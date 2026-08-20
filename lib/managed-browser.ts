import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getBrowserBody, upsertBrowserBody } from "./db";
import { logRecoveryAttempt, recordOperationalSuccess } from "./incident-engine";
import { reconsiderAffectedRuns } from "./recovery-reconsideration";
import type { BrowserBody } from "./types";

export function getPresenceProfileDir(presenceId: string): string {
  const baseDir = process.env.OPENPRESENCE_DATA_DIR
    ? path.join(process.env.OPENPRESENCE_DATA_DIR, "browser-profiles")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "OpenPresence", "browser-profiles")
      : path.join(process.cwd(), "data", "browser-profiles");
  const profileDir = path.join(baseDir, presenceId);
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

interface ActiveBrowserSession {
  context: {
    pages: () => unknown[];
    newPage: () => Promise<unknown>;
    close: () => Promise<void>;
  };
  page?: {
    isClosed?: () => boolean;
    title?: () => Promise<string>;
    reload?: (options?: unknown) => Promise<unknown>;
    close?: () => Promise<void>;
    goto: (url: string, options?: unknown) => Promise<unknown>;
    $: (selector: string) => Promise<{ getAttribute: (name: string) => Promise<string | null> } | null>;
  };
  presenceId: string;
  launchedAt: string;
}

const activeSessions = new Map<string, ActiveBrowserSession>();

async function getPlaywrightChromium() {
  const mod = "@playwright/test";
  const pw = await import(/* webpackIgnore: true */ mod);
  return pw.chromium || pw.default?.chromium;
}

export async function launchManagedBrowser(
  presenceId: string,
  options: { headless?: boolean; expectedIdentity?: string } = {},
): Promise<ActiveBrowserSession> {
  const profileDir = getPresenceProfileDir(presenceId);
  const headless = options.headless ?? true;

  // Close existing if open
  if (activeSessions.has(presenceId)) {
    try {
      const existing = activeSessions.get(presenceId);
      await existing?.context.close();
    } catch { /* ignored */ }
    activeSessions.delete(presenceId);
  }

  const chromium = await getPlaywrightChromium();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  const session: ActiveBrowserSession = {
    context,
    page,
    presenceId,
    launchedAt: new Date().toISOString(),
  };

  activeSessions.set(presenceId, session);

  // Update persistent state
  const body: BrowserBody = {
    presenceId,
    mode: "managed",
    ownership: "openpresence",
    state: "starting",
    canOpenTabs: true,
    canCloseOwnedTabs: true,
    canRestartBrowser: true,
    canRestoreSession: true,
    expectedIdentity: options.expectedIdentity,
    lastHealthyAt: new Date().toISOString(),
    profileDir,
    updatedAt: new Date().toISOString(),
  };
  upsertBrowserBody(body);
  recordOperationalSuccess("managed_browser", presenceId);

  return session;
}

export async function closeManagedBrowser(presenceId: string): Promise<void> {
  const session = activeSessions.get(presenceId);
  if (session) {
    try {
      await session.context.close();
    } catch { /* ignored */ }
    activeSessions.delete(presenceId);
  }
  const body = getBrowserBody(presenceId);
  if (body) {
    body.state = "stopped";
    body.updatedAt = new Date().toISOString();
    upsertBrowserBody(body);
  }
}

export async function verifyBrowserIdentity(
  page: { goto: (url: string, opts?: unknown) => Promise<unknown>; $: (sel: string) => Promise<{ getAttribute: (name: string) => Promise<string | null> } | null> },
  expectedIdentity?: string,
): Promise<{ verified: boolean; observedIdentity?: string }> {
  try {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15000 });
    // Probe logged in user handle from navigation/profile links
    const handleElement = await page.$('a[data-testid="AppTabBar_Profile_Link"]');
    if (!handleElement) {
      return { verified: false };
    }
    const href = (await handleElement.getAttribute("href")) || "";
    const observedIdentity = href.replace("/", "").replace("@", "");

    if (!expectedIdentity) {
      return { verified: true, observedIdentity };
    }

    const cleanExpected = expectedIdentity.replace("@", "").toLowerCase();
    const cleanObserved = observedIdentity.toLowerCase();
    const verified = cleanExpected === cleanObserved;

    return { verified, observedIdentity };
  } catch {
    return { verified: false };
  }
}

// ============================================================================
// 10-Step Deterministic Recovery Ladder
// ============================================================================

export interface BrowserLadderResult {
  stepReached: number;
  succeeded: boolean;
  actionTaken: string;
  error?: string;
}

export async function executeBrowserRecoveryLadder(
  presenceId: string,
  incidentId: string,
  expectedIdentity?: string,
): Promise<BrowserLadderResult> {
  const currentBody = getBrowserBody(presenceId);
  if (currentBody) {
    currentBody.state = "recovering";
    currentBody.updatedAt = new Date().toISOString();
    upsertBrowserBody(currentBody);
  }
  const logStep = (stepNumber: number, stepName: string, outcome: "succeeded" | "failed" | "deferred", error?: string) => {
    logRecoveryAttempt({
      incidentId,
      step: `Ladder Step ${stepNumber}: ${stepName}`,
      outcome,
      error,
    });
  };

  try {
    // Step 1: Probe browser controller
    let session = activeSessions.get(presenceId);
    if (session && !session.page?.isClosed?.()) {
      try {
        await session.page?.title?.();
        logStep(1, "Probe browser controller", "succeeded");
      } catch (err: unknown) {
        logStep(1, "Probe browser controller", "failed", err instanceof Error ? err.message : String(err));
        session = undefined;
      }
    } else {
      logStep(1, "Probe browser controller", "failed", "No active session");
    }

    // Step 2: Reacquire an owned X tab before changing the body.
    if (session?.context) {
      const ownedPage = session.context.pages().find((candidate) => {
        const page = candidate as { url?: () => string; isClosed?: () => boolean };
        return !page.isClosed?.() && (page.url?.() ?? "").includes("x.com");
      }) as ActiveBrowserSession["page"] | undefined;
      if (ownedPage) {
        session.page = ownedPage;
        logStep(2, "Reacquire owned X tab", "succeeded");
      } else {
        logStep(2, "Reacquire owned X tab", "failed", "No owned X tab found");
      }
    }

    // Step 3: Reload the reacquired tab.
    if (session?.page && !session.page.isClosed?.()) {
      try {
        await session.page.reload?.({ waitUntil: "domcontentloaded", timeout: 10000 });
        logStep(3, "Reload tab", "succeeded");
        const reconsideration = reconsiderAffectedRuns({ presenceId });
        recordOperationalSuccess("managed_browser", presenceId);
        return { stepReached: 3, succeeded: true, actionTaken: `Reloaded current X tab; ${reconsideration.stillRelevant} affected actions reconsidered` };
      } catch (err: unknown) {
        logStep(3, "Reload tab", "failed", err instanceof Error ? err.message : String(err));
      }
    }

    // Step 4: Close and recreate owned X tab
    if (session?.context) {
      try {
        if (session.page && !session.page.isClosed?.()) {
          await session.page.close?.().catch(() => {});
        }
        const newPage = (await session.context.newPage()) as ActiveBrowserSession["page"];
        session.page = newPage;
        if (session.page) {
          await session.page.goto("https://x.com", { waitUntil: "domcontentloaded", timeout: 15000 });
        }
        logStep(4, "Close and recreate owned X tab", "succeeded");

        // Step 5: Revalidate identity
        if (session.page) {
          const check = await verifyBrowserIdentity(session.page, expectedIdentity);
          if (check.verified) {
            logStep(5, "Revalidate @identity", "succeeded");
            const reconsideration = reconsiderAffectedRuns({ presenceId });
            logStep(10, "Reconsider affected runs", "succeeded");
            recordOperationalSuccess("managed_browser", presenceId);
            return { stepReached: 5, succeeded: true, actionTaken: `Recreated tab and revalidated identity; ${reconsideration.stillRelevant} affected actions reconsidered` };
          } else {
            logStep(5, "Revalidate @identity", "failed", "Observed identity did not match expected");
          }
        }
      } catch (err: unknown) {
        logStep(4, "Recreate tab", "failed", err instanceof Error ? err.message : String(err));
      }
    }

    // Step 6 & 7: Restart managed Chrome process
    logStep(6, "Restart Browser Body controller", "succeeded");
    await closeManagedBrowser(presenceId);

    // Step 8 & 9: Restore persistent profile + open clean X tab
    session = await launchManagedBrowser(presenceId, { headless: true, expectedIdentity });
    logStep(7, "Restart managed Chrome process", "succeeded");
    logStep(8, "Restore persistent profile", "succeeded");

    if (session.page) {
      const check = await verifyBrowserIdentity(session.page, expectedIdentity);
      if (check.verified) {
        logStep(9, "Reopen X and revalidate identity", "succeeded");
        const reconsideration = reconsiderAffectedRuns({ presenceId });
        logStep(10, "Reconsider affected runs", "succeeded");
        recordOperationalSuccess("managed_browser", presenceId);
        return { stepReached: 10, succeeded: true, actionTaken: `Restarted managed Chrome and verified persistent session; ${reconsideration.stillRelevant} affected actions reconsidered` };
      } else {
        logStep(9, "Revalidate identity after restart", "failed", "Interactive login required");
        const body = getBrowserBody(presenceId);
        if (body) {
          body.state = "needs_auth";
          body.updatedAt = new Date().toISOString();
          upsertBrowserBody(body);
        }
        return {
          stepReached: 9,
          succeeded: false,
          actionTaken: "Restarted browser but session requires operator interactive login",
          error: "AUTH_REQUIRED",
        };
      }
    }

    return { stepReached: 10, succeeded: false, actionTaken: "Recovery ladder exhausted", error: "EXHAUSTED" };
  } catch (err: unknown) {
    return { stepReached: 10, succeeded: false, actionTaken: "Recovery ladder error", error: err instanceof Error ? err.message : String(err) };
  }
}
