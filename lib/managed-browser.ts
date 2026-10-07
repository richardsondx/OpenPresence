import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { getPresenceProfileDir } from "./browser-profile";
import { getBrowserBody, upsertBrowserBody } from "./db";
import { logRecoveryAttempt, recordOperationalSuccess } from "./incident-engine";
import { reconsiderAffectedRuns } from "./recovery-reconsideration";
import type { BrowserBody } from "./types";

export { getPresenceProfileDir } from "./browser-profile";

type BrowserEvaluate = <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T>;

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
    evaluate?: BrowserEvaluate;
  };
  presenceId: string;
  launchedAt: string;
}

const activeSessions = new Map<string, ActiveBrowserSession>();

/**
 * Get the currently active browser session for a presence, if one exists.
 * Unlike launchManagedBrowser, this does NOT close and re-launch the browser.
 * Used by the verify flow to check identity without destroying the user's
 * just-opened login session.
 */
export function getActiveBrowserSession(presenceId: string): ActiveBrowserSession | undefined {
  const session = activeSessions.get(presenceId);
  if (!session) return undefined;
  // Check if the page is still alive
  try {
    if (session.page?.isClosed?.()) return undefined;
  } catch { /* ignore */ }
  return session;
}

/**
 * Clean up stale Chrome processes and lock files for a profile directory.
 *
 * When using real Google Chrome (not Playwright's bundled Chromium), Chrome
 * enforces a singleton lock on the profile directory. If a previous
 * Playwright-controlled Chrome instance crashed or was killed without
 * cleaning up, the lock file remains and the next launch fails with
 * "Opening in existing browser session."
 *
 * This function:
 * 1. Kills any Chrome process still using the profile directory
 * 2. Removes the stale SingletonLock, SingletonCookie, and SingletonSocket files
 */
function cleanupStaleChromeProfile(profileDir: string): void {
  try {
    // Kill any Chrome process that is using this profile directory.
    // We use pkill with the user-data-dir argument as a pattern.
    try {
      execSync(`pkill -f "user-data-dir=${profileDir.replace(/ /g, "\\ ")}"`, { stdio: "ignore" });
    } catch { /* no process found or kill failed — that's fine */ }

    // Remove stale singleton lock files. Chrome creates these to enforce
    // single-instance-per-profile, but they persist after a crash.
    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
    for (const lockFile of lockFiles) {
      const lockPath = path.join(profileDir, lockFile);
      try {
        if (fs.existsSync(lockPath) || fs.lstatSync(lockPath).isSymbolicLink()) {
          fs.unlinkSync(lockPath);
        }
      } catch { /* lock file might be held by a process that just exited */ }
    }
  } catch { /* ignore all cleanup errors — they shouldn't block launch */ }
}

async function getPlaywrightChromium() {
  const mod = "@playwright/test";
  const pw = await import(/* webpackIgnore: true */ mod);
  return pw.chromium || pw.default?.chromium;
}

/**
 * Detect the real Google Chrome executable path on macOS. X and Google detect
 * Playwright's bundled Chromium (Chrome for Testing) as automated because it
 * carries automation markers (cdc_ variables, missing Google integration,
 * different binary signature). Using the user's real Chrome installation
 * avoids this detection while still allowing Playwright to control the browser.
 */
function detectRealChromePath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    os.homedir() + "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return undefined;
}

/**
 * Generate a realistic, current Chrome user-agent string for macOS.
 * The previous hardcoded Chrome/124.0.0.0 was stale (real Chrome is 151+)
 * and the mismatch itself was a detection signal.
 */
function currentChromeUserAgent(): string {
  // Match the OS version pattern that real Chrome sends on macOS.
  // We use a recent stable Chrome version that won't stand out.
  const platform = process.platform === "darwin"
    ? `Macintosh; Intel Mac OS X 10_15_7`
    : process.platform === "win32"
      ? `Windows NT 10.0; Win64; x64`
      : `X11; Linux x86_64`;
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`;
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

  // Clean up any stale Chrome process or lock files from a previous session.
  // This prevents the "Opening in existing browser session" error when
  // real Chrome is used and a previous instance didn't shut down cleanly.
  cleanupStaleChromeProfile(profileDir);

  const chromium = await getPlaywrightChromium();
  const realChromePath = detectRealChromePath();

  // Use the real Google Chrome installation when available. Playwright's
  // bundled Chromium (Chrome for Testing) carries automation markers that
  // X and Google detect as unusual activity. The real Chrome binary does not.
  // When using real Chrome, use the "new" headless mode which is much harder
  // to detect than the old headless mode. The old headless mode strips too many
  // browser features and is trivially detectable. The new headless mode (Chrome 112+)
  // runs the full browser shell, just without a visible window.
  const launchOptions: Record<string, unknown> = {
    // Playwright requires a boolean; Chrome selects its supported headless mode.
    headless,
    viewport: { width: 1280, height: 800 },
    // Let Chrome use its own authentic user-agent when we are driving the
    // real binary. Only override for the bundled Chromium fallback.
    ...(realChromePath ? {} : { userAgent: currentChromeUserAgent() }),
    args: [
      // --disable-blink-features=AutomationControlled hides the navigator.webdriver
      // flag that X/Google check to detect automated browsers. This is the
      // single most important anti-detection flag.
      "--disable-blink-features=AutomationControlled",
      // A realistic set of flags that a normal Chrome install uses.
      "--disable-features=TranslateUI",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-hang-monitor",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      "--password-store=basic",
      "--use-mock-keychain",
      // --remote-debugging-port=0 forces Chrome to start a new process with
      // a fresh DevTools debugging endpoint instead of reusing an existing
      // Chrome session. This prevents the "Opening in existing browser
      // session" error when real Chrome is already running.
      ...(realChromePath ? ["--remote-debugging-port=0"] : []),
    ],
  };

  if (realChromePath) {
    launchOptions.executablePath = realChromePath;
    // When using real Chrome, also set the channel so Playwright knows
    // it's driving a stable Chrome, not a Chromium build.
    launchOptions.channel = "chrome";
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);

  // Inject a stealth script that removes remaining automation markers.
  // This runs before any page navigation, so X/Google never see the signals.
  try {
    await context.addInitScript(() => {
      // Remove navigator.webdriver (the primary automation detection signal)
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // Restore realistic plugin/mime types that headless Chrome strips
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5].map(() => ({
          name: "Chrome PDF Plugin",
          filename: "internal-pdf-viewer",
          description: "Portable Document Format",
        })),
      });
      // Restore realistic languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
      // Remove the "Chrome for Testing" marker from the user agent
      // (Playwright's bundled Chromium includes "HeadlessChrome" in headless mode)
      if (navigator.userAgent.includes("HeadlessChrome")) {
        Object.defineProperty(navigator, "userAgent", {
          get: () => navigator.userAgent.replace("HeadlessChrome", "Chrome"),
        });
      }
    });
  } catch { /* Some context types may not support addInitScript */ }

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
  page: {
    goto: (url: string, opts?: unknown) => Promise<unknown>;
    $: (sel: string) => Promise<{ getAttribute: (name: string) => Promise<string | null> } | null>;
    evaluate?: BrowserEvaluate;
  },
  expectedIdentity?: string,
): Promise<{ verified: boolean; observedIdentity?: string }> {
  try {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 15_000 });

    // X's SPA can take several seconds to mount the navigation bar after
    // domcontentloaded. Poll for the signed-in account using multiple
    // strategies, mirroring the robust detection in channel-x.js.
    let observedIdentity: string | undefined;

    for (let attempt = 0; attempt < 20 && !observedIdentity; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));

      // Strategy 1: SideNav_AccountSwitcher_Button text contains @handle.
      try {
        const switcherText = await page.evaluate?.(() => {
          const el = document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid*="AccountSwitcher"], [aria-label*="Account"]'
          ) as HTMLElement | null;
          if (!el) return null;
          const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
          const match = text.match(/@([a-zA-Z0-9_]{1,30})/);
          return match ? match[1] : null;
        }) as string | null;
        if (switcherText) { observedIdentity = switcherText; break; }
      } catch { /* evaluate not available */ }

      // Strategy 2: AppTabBar_Profile_Link href contains the handle.
      try {
        const profileLink = await page.$('a[data-testid="AppTabBar_Profile_Link"]');
        if (profileLink) {
          const href = (await profileLink.getAttribute("href")) || "";
          const handle = href.replace("/", "").replace("@", "").split("/")[0];
          if (handle) { observedIdentity = handle; break; }
        }
      } catch { /* $ not available */ }

      // Strategy 3: Account switcher nested link href.
      try {
        const accountLink = await page.$(
          '[data-testid="SideNav_AccountSwitcher_Button"] a[href^="/"], ' +
          '[data-testid*="AccountSwitcher"] a[href^="/"]'
        );
        if (accountLink) {
          const href = (await accountLink.getAttribute("href")) || "";
          const handle = href.replace(/^\//, "").split("/")[0];
          if (handle) { observedIdentity = handle; break; }
        }
      } catch { /* ignore */ }

      // Strategy 4: Scan all links for an exact profile path match.
      if (expectedIdentity) {
        const normalized = expectedIdentity.replace(/^@/, "").toLowerCase();
        try {
          const found = await page.evaluate?.((handle: unknown) => {
            const links = [...document.querySelectorAll("a[href]")];
            const match = links.find((link) => {
              try {
                const href = link.getAttribute("href") || "";
                const pathname = new URL(href, window.location.origin).pathname.replace(/\/$/, "").toLowerCase();
                return pathname === "/" + String(handle);
              } catch { return false; }
            });
            return match ? handle : null;
          }, normalized) as string | null;
          if (found) { observedIdentity = found; break; }
        } catch { /* evaluate not available */ }
      }

      // Strategy 5: After several attempts, check for login page elements.
      if (attempt >= 4) {
        try {
          const loginButton = await page.$('a[data-testid="loginButton"], input[autocomplete="username"], input[name="text"][autocomplete="username"]');
          if (loginButton) {
            return { verified: false, observedIdentity: undefined };
          }
        } catch { /* ignore */ }
      }
    }

    if (!observedIdentity) {
      return { verified: false };
    }

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
