import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { getBrowserBody, upsertBrowserBody } from "./db";
import { getPresenceProfileDir } from "./browser-profile";
import type { BrowserBody } from "./types";

type PresenceChromeProcess = {
  child: ChildProcess;
  launchedAt: string;
  profileDir: string;
};

const chromeProcesses = new Map<string, PresenceChromeProcess>();

function executableExists(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function commandOnPath(command: string): string | undefined {
  try {
    const resolved = execFileSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return resolved && executableExists(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function chromeProcessForProfile(profileDir: string): string | undefined {
  if (process.platform === "win32") return undefined;
  try {
    const matches = execFileSync("pgrep", ["-f", "--", `--user-data-dir=${profileDir}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return matches.find((pid) => pid !== String(process.pid));
  } catch {
    return undefined;
  }
}

/** Resolve the installed, user-facing Chrome binary without falling back to Chromium automation. */
export function resolveRealChromeExecutable(): string | undefined {
  const configured = process.env.OPENPRESENCE_CHROME_PATH?.trim();
  if (configured && executableExists(configured)) return configured;

  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      ]
    : process.platform === "win32"
      ? [
          path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe"),
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];

  const installed = candidates.find(executableExists);
  if (installed) return installed;
  if (process.platform === "linux") {
    for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
      const resolved = commandOnPath(command);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

export function presenceBrowserSetupUrl(baseUrl: string, agentId: string | undefined, presenceId: string): string {
  const url = new URL("/settings", baseUrl);
  if (agentId) url.searchParams.set("agentId", agentId);
  url.searchParams.set("presenceId", presenceId);
  return url.toString();
}

export function buildPresenceChromeLaunchArgs(profileDir: string, setupUrl: string): string[] {
  return ["--user-data-dir=" + profileDir, "--new-window", setupUrl];
}

function bodyForLaunch(presenceId: string, profileDir: string, expectedIdentity: string): BrowserBody {
  const current = getBrowserBody(presenceId);
  return {
    presenceId,
    mode: "managed",
    ownership: "openpresence",
    state: "starting",
    canOpenTabs: true,
    canCloseOwnedTabs: true,
    canRestartBrowser: true,
    canRestoreSession: true,
    expectedIdentity,
    verifiedIdentity: current?.verifiedIdentity,
    lastHealthyAt: current?.lastHealthyAt,
    profileDir,
    updatedAt: new Date().toISOString(),
  };
}

export interface PresenceChromeLaunchResult {
  presenceId: string;
  profileDir: string;
  setupUrl: string;
  executablePath: string;
  pid?: number;
  launchedAt: string;
  reused: boolean;
}

/**
 * Open the dedicated real-Chrome identity for one Presence.
 *
 * This launches only the browser identity and setup page. The existing
 * extension remains responsible for opening X, checking the account, and
 * delivering/verifying executions once it is installed in that profile.
 */
export function launchPresenceChrome(input: {
  presenceId: string;
  expectedIdentity: string;
  agentId?: string;
  baseUrl: string;
}): PresenceChromeLaunchResult {
  const profileDir = getPresenceProfileDir(input.presenceId);
  const setupUrl = presenceBrowserSetupUrl(input.baseUrl, input.agentId, input.presenceId);
  const existing = chromeProcesses.get(input.presenceId);
  if (existing && existing.child.exitCode === null && !existing.child.killed) {
    upsertBrowserBody(bodyForLaunch(input.presenceId, profileDir, input.expectedIdentity));
    return {
      presenceId: input.presenceId,
      profileDir,
      setupUrl,
      executablePath: resolveRealChromeExecutable() ?? "",
      pid: existing.child.pid,
      launchedAt: existing.launchedAt,
      reused: true,
    };
  }

  const executablePath = resolveRealChromeExecutable();
  if (!executablePath) {
    const body = bodyForLaunch(input.presenceId, profileDir, input.expectedIdentity);
    body.state = "needs_auth";
    upsertBrowserBody(body);
    throw new Error("Google Chrome could not be found. Install Chrome or set OPENPRESENCE_CHROME_PATH before opening a dedicated browser.");
  }

  const existingChromePid = chromeProcessForProfile(profileDir);
  if (existingChromePid) {
    upsertBrowserBody(bodyForLaunch(input.presenceId, profileDir, input.expectedIdentity));
    return {
      presenceId: input.presenceId,
      profileDir,
      setupUrl,
      executablePath,
      pid: Number(existingChromePid),
      launchedAt: new Date().toISOString(),
      reused: true,
    };
  }

  fs.mkdirSync(profileDir, { recursive: true });
  const launchedAt = new Date().toISOString();
  const child = spawn(executablePath, buildPresenceChromeLaunchArgs(profileDir, setupUrl), {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const processState = { child, launchedAt, profileDir };
  chromeProcesses.set(input.presenceId, processState);
  child.once("exit", () => {
    if (chromeProcesses.get(input.presenceId)?.child === child) {
      chromeProcesses.delete(input.presenceId);
      if (chromeProcessForProfile(profileDir)) return;
      const body = getBrowserBody(input.presenceId);
      if (body?.state === "starting") {
        body.state = "stopped";
        body.updatedAt = new Date().toISOString();
        upsertBrowserBody(body);
      }
    }
  });
  child.once("error", () => {
    if (chromeProcesses.get(input.presenceId)?.child === child) chromeProcesses.delete(input.presenceId);
    if (chromeProcessForProfile(profileDir)) return;
    const body = getBrowserBody(input.presenceId);
    if (body) {
      body.state = "needs_auth";
      body.updatedAt = new Date().toISOString();
      upsertBrowserBody(body);
    }
  });

  upsertBrowserBody(bodyForLaunch(input.presenceId, profileDir, input.expectedIdentity));
  return { presenceId: input.presenceId, profileDir, setupUrl, executablePath, pid: child.pid, launchedAt, reused: false };
}
