const sessions = new Map();
const sessionStorageKey = "openpresenceChromeSessions";
const heartbeatAlarmName = "openpresence-heartbeat";
const verificationAlarmName = "openpresence-verification";
const verificationStorageKey = "openpresenceVerificationJobs";
const reconnectPresenceKey = "openpresenceReconnectPresenceId";
// The Bridge lease is 120 seconds. Give a tab a small grace period, then
// requeue work that was claimed by a content script that disappeared during
// an X navigation or service-worker restart.
const activeExecutionWatchdogMs = 135_000;
const bridgeHeartbeatFreshMs = 90_000;
let lastConfig;
const seenEvents = new Set();
const claimRuns = new Map();
const sessionStartRuns = new Map();
const claimRetryTimers = new Map();
const activeExecutionWatchdogs = new Map();
const verificationTimers = new Map();
const verificationJobs = new Map();
const verificationRuns = new Set();

const channelHome = (presence) => presence.domain || (presence.channel === "x" ? "https://x.com/home" : "https://www.linkedin.com/feed/");
const groupColor = (accent) => {
  const value = String(accent || "").toLowerCase();
  if (value.includes("blue")) return "blue";
  if (value.includes("green")) return "green";
  if (value.includes("purple")) return "purple";
  if (value.includes("red")) return "red";
  return "orange";
};

async function appOrigin() {
  if (lastConfig?.appOrigin) return lastConfig.appOrigin;
  const stored = await chrome.storage.session.get("openpresenceConfig");
  return stored.openpresenceConfig?.appOrigin || "http://localhost:3015";
}

// Fetch config directly from the OpenPresence app API. The app-bridge.js
// content script only syncs when the user has the app open in a Chrome tab.
// This fallback lets the extension work even without that tab open.
async function fetchConfigFromApp() {
  for (const origin of ["http://localhost:3015", "http://127.0.0.1:3015"]) {
    try {
      const response = await fetch(`${origin}/api/browser/config`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data?.selected || data?.presences?.length) {
          lastConfig = data;
          await chrome.storage.session.set({ openpresenceConfig: lastConfig });
          return data;
        }
      }
    } catch { /* app not reachable at this origin */ }
  }
  return null;
}

async function bridgeRequest(session, path, options = {}) {
  const origin = await appOrigin();
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${session.bridgeKey}`, ...(options.headers || {}) };
  const response = await fetch(`${origin}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `OpenPresence bridge request failed (${response.status}).`);
  return body;
}

function sendStatus(status) {
  chrome.tabs.query({ url: ["http://localhost:3015/*", "http://127.0.0.1:3015/*"] }).then((tabs) => {
    // The status is useful in the controlled channel tab too. Keep it scoped
    // to the relevant Presence so one Bridge cannot make another look healthy.
    const controlledTabIds = [...sessions.values()]
      .filter((session) => !status.presenceId || session.presence.id === status.presenceId)
      .map((session) => session.tabId);
    const tabIds = new Set([...tabs.map((tab) => tab.id), ...controlledTabIds].filter(Boolean));
    return Promise.all([...tabIds].map((tabId) => chrome.tabs.sendMessage(tabId, { type: "OPENPRESENCE_EXTENSION_STATUS", status }).catch(() => {})));
  });
}

function publicSessionStatus(session) {
  const heartbeatFresh = session.lastHeartbeatAt && Date.now() - session.lastHeartbeatAt <= bridgeHeartbeatFreshMs && session.lastHeartbeatOk !== false;
  const identityReady = session.lastIdentityStatus === "verified";
  return {
    state: heartbeatFresh ? (identityReady ? "connected" : "identity_required") : "stale",
    presenceId: session.presence.id,
    presenceName: session.presence.name,
    presenceHandle: session.presence.handle,
    tabId: session.tabId,
    windowId: session.windowId,
    identityStatus: session.lastIdentityStatus,
    heartbeatAt: session.lastHeartbeatAt,
    message: !heartbeatFresh
      ? (session.lastHeartbeatError || "The OpenPresence app has not acknowledged the Bridge heartbeat recently.")
      : identityReady
        ? undefined
        : session.lastIdentityStatus === "mismatch"
          ? `Sign in to X as ${session.presence.handle} before delivery.`
          : `Verify the signed-in X account as ${session.presence.handle} before delivery.`,
  };
}

function sendSessionStatus(session) {
  sendStatus({ ...publicSessionStatus(session), presenceName: session.presence.name, tabId: session.tabId });
}

async function popupStatus(presenceId) {
  await restoreSessions();
  let configured = lastConfig || (await chrome.storage.session.get("openpresenceConfig")).openpresenceConfig;
  // If no config from app-bridge.js sync, try fetching directly from the app API
  if (!configured) {
    configured = await fetchConfigFromApp();
  }
  const presence = configured?.presences?.find((item) => item.id === presenceId)
    || configured?.selected
    || configured?.presences?.find((item) => item.id === configured?.activePresenceId);
  const session = presence?.id ? sessions.get(presence.id) : undefined;
  if (session) return publicSessionStatus(session);
  if (!presence) return { state: "unconfigured" };
  return {
    state: presence.browserAccess?.enabled ? "ready" : "disabled",
    presenceId: presence.id,
    presenceName: presence.name,
    presenceHandle: presence.handle,
  };
}

function sendSessionContext(session) {
  return chrome.tabs.sendMessage(session.tabId, { type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: session.presence.handle, presenceName: session.presence.name }).catch(() => {});
}

function sendSessionContextToTab(session, tabId) {
  return chrome.tabs.sendMessage(tabId, { type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: session.presence.handle, presenceName: session.presence.name }).catch(() => {});
}

function requestIdentity(session, claimAfterVerification = true) {
  const message = {
    type: "OPENPRESENCE_REQUEST_IDENTITY",
    expectedHandle: session.presence.handle,
    presenceName: session.presence.name,
    claimAfterVerification,
  };
  // X is a single signed-in browser session, but its SPA regularly replaces
  // the tab that was persisted when the Bridge was opened. Ask every X tab in
  // the controlled window so a freshly mounted content script can re-establish
  // identity without requiring the operator to close and reopen Chrome.
  return chrome.tabs.query({ windowId: session.windowId, url: ["https://x.com/*", "https://*.x.com/*"] })
    .then((tabs) => {
      const tabIds = new Set([session.tabId, ...tabs.map((tab) => tab.id)].filter(Boolean));
      return Promise.all([...tabIds].map((tabId) => chrome.tabs.sendMessage(tabId, message).catch(() => undefined)))
        .then(async (responses) => {
          if (responses.some((response) => response?.ok)) return responses;
          // A persisted session can outlive the content script after an
          // unpacked-extension reload. Re-mount the controlled tab so the
          // identity check cannot remain stuck at "unknown" forever.
          if (session.lastIdentityProbeAt && Date.now() - session.lastIdentityProbeAt < 15_000) return responses;
          session.lastIdentityProbeAt = Date.now();
          const tab = await chrome.tabs.get(session.tabId).catch(() => undefined);
          if (tab && isXTab(tab)) await chrome.tabs.reload(session.tabId).catch(() => {});
          return responses;
        });
    })
    .catch(() => undefined);
}

function isXTab(tab) {
  try {
    const hostname = new URL(tab?.url || "").hostname.toLowerCase();
    return hostname === "x.com" || hostname.endsWith(".x.com");
  } catch {
    return false;
  }
}

async function probeVisibleXAccount(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const fromText = (value) => String(value || "").match(/@([a-z0-9_]{1,30})/i)?.[1]?.toLowerCase() || null;
        const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid*="AccountSwitcher"]');
        const fromSwitcher = fromText(switcher?.innerText);
        if (fromSwitcher) return fromSwitcher;
        const profile = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
        return fromText(profile?.getAttribute("href")?.replace(/^\//, ""));
      },
    });
    return typeof result === "string" ? result : undefined;
  } catch {
    return undefined;
  }
}

async function probeAndReportIdentity(session, tabId = session.tabId, claimAfterVerification = true) {
  const username = await probeVisibleXAccount(tabId);
  if (username) await reportIdentity(session, username, claimAfterVerification);
  return username;
}

async function updateBadge() {
  const count = sessions.size;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: count ? "#c77d50" : "#766b63" });
}

async function persistSessions() {
  await chrome.storage.session.set({ [sessionStorageKey]: [...sessions.values()] });
}

async function persistVerificationJobs() {
  await chrome.storage.session.set({ [verificationStorageKey]: [...verificationJobs.values()] });
}

async function restoreVerificationJobs() {
  if (verificationJobs.size) return;
  const stored = await chrome.storage.session.get(verificationStorageKey);
  const saved = Array.isArray(stored[verificationStorageKey]) ? stored[verificationStorageKey] : [];
  for (const job of saved) {
    if (!job?.executionId || !job?.presenceId || !job?.result?.executionId || !job?.nextAttemptAt) continue;
    verificationJobs.set(job.executionId, job);
  }
  await scheduleVerificationAlarm();
}

async function scheduleVerificationAlarm() {
  const next = [...verificationJobs.values()]
    .map((job) => new Date(job.nextAttemptAt).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];
  if (next === undefined) {
    await chrome.alarms.clear(verificationAlarmName);
    return;
  }
  await chrome.alarms.create(verificationAlarmName, { when: Math.max(Date.now() + 250, next) });
}

async function clearVerificationJob(executionId) {
  const timer = verificationTimers.get(executionId);
  if (timer) clearTimeout(timer);
  verificationTimers.delete(executionId);
  if (verificationJobs.delete(executionId)) await persistVerificationJobs();
  await scheduleVerificationAlarm();
}

async function processVerificationJobs() {
  await restoreVerificationJobs();
  const now = Date.now();
  for (const job of [...verificationJobs.values()]) {
    if (new Date(job.nextAttemptAt).getTime() > now || verificationRuns.has(job.executionId)) continue;
    const session = sessions.get(job.presenceId);
    if (!session) {
      job.nextAttemptAt = new Date(now + 30_000).toISOString();
      continue;
    }
    verificationRuns.add(job.executionId);
    void verifySubmittedExecution(session, job.result, job.attempt)
      .finally(() => verificationRuns.delete(job.executionId));
  }
  await persistVerificationJobs();
  await scheduleVerificationAlarm();
}

async function reportMetrics(session, metrics) {
  const result = await bridgeRequest(session, "/api/bridge/v1/metrics", { method: "POST", body: JSON.stringify(metrics) });
  session.lastMetricsAt = Date.now();
  await persistSessions();
  return result;
}

async function requestMetrics(session) {
  if (session.activeExecutionId) return;
  try {
    await chrome.tabs.sendMessage(session.tabId, { type: "OPENPRESENCE_REQUEST_METRICS" });
  } catch (error) {
    sendStatus({ state: "error", presenceId: session.presence.id, message: error.message || "The controlled tab could not collect channel metrics." });
  }
}

async function reportIdentity(session, username, claimAfterVerification = true) {
  // X can briefly expose neither the account switcher nor the profile link
  // while its SPA is navigating. Do not overwrite a previously verified
  // identity with an empty value during that loading window.
  if ((typeof username !== "string" || !username.trim()) && session.lastIdentityStatus === "verified") return undefined;
  try {
    const result = await bridgeRequest(session, "/api/bridge/v1/identity", { method: "POST", body: JSON.stringify({ executorId: session.executorId, username }) });
    session.lastIdentityStatus = result.identity?.status;
    if (result.identity?.status === "verified") {
      sendSessionStatus(session);
      if (claimAfterVerification) await claim(session);
    } else {
      sendSessionStatus(session);
    }
    return result;
  } catch (error) {
    sendStatus({ state: "error", presenceId: session.presence.id, message: error.message || "The controlled tab account could not be verified." });
    return undefined;
  }
}

async function restoreSessions() {
  await restoreVerificationJobs();
  if (sessions.size) return;
  const stored = await chrome.storage.session.get(sessionStorageKey);
  const saved = Array.isArray(stored[sessionStorageKey]) ? stored[sessionStorageKey] : [];
  for (const session of saved) {
    if (!session?.presence?.id || !session.tabId || !session.bridgeKey || !session.bridgeId) continue;
    try {
      await chrome.tabs.get(session.tabId);
      if (session.activeExecutionId && (!session.activeExecutionStartedAt || Date.now() - session.activeExecutionStartedAt >= activeExecutionWatchdogMs)) {
        // A previous service-worker instance may have persisted a claim that
        // no longer has a living content-script execution attached to it.
        // Clear it before restoring the session; claim() will let the Bridge
        // expire/requeue the server-side lease and deliver the next item.
        session.activeExecutionId = undefined;
        session.activeExecutionStartedAt = undefined;
      }
      sessions.set(session.presence.id, session);
      await sendSessionContext(session);
    } catch {
      // The controlled tab was closed while the service worker was asleep.
    }
  }
  if (sessions.size !== saved.length) await persistSessions();
  await updateBadge();
  await Promise.all([...sessions.values()].map(async (session) => {
    const connected = await heartbeat(session);
    if (!connected) return;
    sendSessionStatus(session);
    // A service worker can wake after work was queued. Reconcile the queue
    // immediately instead of waiting for the next alarm tick.
    await requestMetrics(session);
    if (!session.activeExecutionId) await claim(session);
  }));
}

async function ensureHeartbeatAlarm() {
  await chrome.alarms.create(heartbeatAlarmName, { periodInMinutes: 0.5 });
}

async function waitForTabComplete(tabId, timeout = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return true;
    } catch {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startSession(presenceId) {
  const presence = lastConfig?.presences?.find((item) => item.id === presenceId) || lastConfig?.selected;
  if (!presence || presence.id !== presenceId || !presence.browserAccess?.enabled) throw new Error("Enable Chrome hands for the selected Presence in OpenPresence first.");
  if (sessions.has(presenceId)) {
    const current = sessions.get(presenceId);
    const connected = await heartbeat(current);
    if (connected) {
      if (current.windowId) await chrome.windows.update(current.windowId, { focused: true });
      await sendSessionContext(current);
      sendSessionStatus(current);
      return current;
    }

    // The unpacked extension can retain a session after its tab or bridge
    // credential has gone stale. Tear it down so this explicit user action
    // repairs the session instead of silently reusing a dead executor.
    await stopSession(presenceId);
  }
  const executorId = `openpresence-chrome-${crypto.randomUUID()}`;
  const connectOrigin = await appOrigin();
  const connect = await fetch(`${connectOrigin}/api/browser/connect?presenceId=${encodeURIComponent(presenceId)}`, { method: "POST", headers: { "content-type": "application/json", "x-openpresence-presence-id": presenceId }, body: JSON.stringify({ presenceId, executorId }), cache: "no-store" });
  const connected = await connect.json().catch(() => ({}));
  if (!connect.ok) throw new Error(connected.error || "OpenPresence could not prepare the Chrome bridge.");

  const window = await chrome.windows.create({ url: channelHome(presence), focused: true, type: "normal" });
  const tab = window.tabs?.[0];
  if (!tab?.id) throw new Error("Chrome did not return a controlled tab.");
  const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, { title: `OpenPresence · ${presence.name} · ${presence.channel}`, color: groupColor(presence.accent) });
  const session = { presence, bridgeId: connected.bridgeId, bridgeKey: connected.bridgeKey, executorId, windowId: window.id, tabId: tab.id, groupId };
  sessions.set(presenceId, session);
  await persistSessions();
  // The tab can finish loading before the session is inserted into `sessions`,
  // so its only tabs.onUpdated event may already be gone. Reconcile explicitly
  // after the content script is ready instead of relying on that event race.
  await waitForTabComplete(tab.id);
  await sendSessionContext(session);
  // MV3 service workers can restart while the X content script is mounting.
  // Ask the controlled tab for its visible account as a fallback, so an
  // unpacked-extension reload cannot strand a correct session at "unknown".
  await probeAndReportIdentity(session, tab.id);
  await updateBadge();
  sendSessionStatus(session);
  await requestMetrics(session);
  return session;
}

function restoreConfiguredSessions(config) {
  const configured = [config?.selected, ...(Array.isArray(config?.presences) ? config.presences : [])]
    .filter((presence) => presence?.id && presence.browserAccess?.enabled)
    .filter((presence, index, list) => list.findIndex((item) => item.id === presence.id) === index);
  for (const presence of configured) {
    if (sessions.has(presence.id) || sessionStartRuns.has(presence.id)) continue;
    const run = startSession(presence.id)
      .catch((error) => sendStatus({ state: "error", presenceId: presence.id, message: error instanceof Error ? error.message : "The configured Chrome session could not be restored." }))
      .finally(() => sessionStartRuns.delete(presence.id));
    sessionStartRuns.set(presence.id, run);
  }
}

async function restoreLastConfiguredSession() {
  const stored = await chrome.storage.local.get(reconnectPresenceKey);
  const presenceId = stored[reconnectPresenceKey];
  if (!presenceId) return;
  const config = lastConfig || await fetchConfigFromApp();
  const presence = config?.presences?.find((item) => item.id === presenceId) || config?.selected;
  if (presence?.id === presenceId && presence.browserAccess?.enabled) restoreConfiguredSessions({ ...config, selected: presence });
}

async function stopSession(presenceId) {
  const session = sessions.get(presenceId);
  if (!session) return;
  const retryTimer = claimRetryTimers.get(presenceId);
  if (retryTimer) {
    clearTimeout(retryTimer);
    claimRetryTimers.delete(presenceId);
  }
  sessions.delete(presenceId);
  await persistSessions();
  try { await chrome.tabs.remove(session.tabId); } catch { /* The user may have closed it already. */ }
  await updateBadge();
  sendStatus({ state: "stopped", presenceId });
}

function scheduleClaimAfterIdentity(session) {
  if (session.lastIdentityStatus === "mismatch") return;
  if (claimRetryTimers.has(session.presence.id)) return;
  const timer = setTimeout(() => {
    claimRetryTimers.delete(session.presence.id);
    if (sessions.get(session.presence.id) === session) void claim(session);
  }, 400);
  claimRetryTimers.set(session.presence.id, timer);
}

async function heartbeat(session) {
  try {
    // A service-worker restart can restore a persisted local execution guard
    // without restoring the watchdog timer that originally owned it. The
    // Bridge lease is authoritative; once its grace window has elapsed, clear
    // the local guard so the next heartbeat can reconcile and claim queued
    // Growth work instead of leaving the queue stranded indefinitely.
    if (session.activeExecutionId && (!session.activeExecutionStartedAt || Date.now() - session.activeExecutionStartedAt >= activeExecutionWatchdogMs)) {
      session.activeExecutionId = undefined;
      session.activeExecutionStartedAt = undefined;
      session.activeExecution = undefined;
      await persistSessions();
    }
    await bridgeRequest(session, "/api/bridge/v1/heartbeat", { method: "POST", body: JSON.stringify({ executorId: session.executorId }) });
    session.lastHeartbeatAt = Date.now();
    session.lastHeartbeatOk = true;
    session.lastHeartbeatError = undefined;
    await persistSessions();
    await requestIdentity(session);
    return true;
  } catch (error) {
    session.lastHeartbeatOk = false;
    session.lastHeartbeatError = error instanceof Error ? error.message : "The OpenPresence app did not acknowledge the Bridge heartbeat.";
    await persistSessions();
    sendStatus({ state: "error", presenceId: session.presence.id, message: error.message });
    return false;
  }
}

async function claim(session) {
  const existing = claimRuns.get(session.presence.id);
  // A navigation fires tabs.onUpdated more than once while X moves through
  // the target post and reply composer. Keep the Bridge queue serialized for
  // the controlled tab; claim the next execution only after the current one
  // has returned an outcome.
  if (existing) return existing;
  if (session.activeExecutionId) {
    if (!session.activeExecutionStartedAt || Date.now() - session.activeExecutionStartedAt >= activeExecutionWatchdogMs) {
      // The local execution watchdog is deliberately conservative: by this
      // point the server lease has expired or is about to expire, so release
      // the local guard. For a fresh local guard we still poll the server;
      // claimExecutions is authoritative and refuses a second claim while a
      // valid lease exists, but can recover when the server-side execution
      // was cancelled/expired during a worker restart.
      const watchdog = activeExecutionWatchdogs.get(session.presence.id);
      if (watchdog) clearTimeout(watchdog);
      activeExecutionWatchdogs.delete(session.presence.id);
      session.activeExecutionId = undefined;
      session.activeExecutionStartedAt = undefined;
      session.activeExecution = undefined;
      await persistSessions();
    }
  }
  const run = (async () => {
    try {
      // A controlled tab is a single foreground executor. Claim one execution
      // at a time so concurrent target navigations cannot race each other.
      const result = await bridgeRequest(session, "/api/bridge/v1/executions/claim", { method: "POST", body: JSON.stringify({ executorId: session.executorId, limit: 1 }) });
      const claimed = result.executions || [];
      for (const execution of claimed) {
        session.activeExecutionId = execution.id;
        session.activeExecutionStartedAt = Date.now();
        // X may open a quote/reply composer in a new tab. Keep the claimed
        // payload in the service worker because tab-scoped sessionStorage is
        // not shared with that new document.
        session.activeExecution = execution;
        await persistSessions();
        armActiveExecutionWatchdog(session, execution.id);

        const targetId = execution.target?.id;
        const affordance = String(execution.affordance || "").replace(/^x\./, "");
        const targetUrl = affordance === "follow" && targetId
          ? `https://x.com/i/user/${encodeURIComponent(targetId)}`
          : affordance === "post"
            ? "https://x.com/compose/post"
            : targetId
              ? `https://x.com/i/web/status/${encodeURIComponent(targetId)}`
              : channelHome(session.presence);

        try {
          let tab = null;
          try {
            tab = await chrome.tabs.get(session.tabId);
          } catch {
            tab = null;
          }

          if (!tab) {
            const win = await chrome.windows.get(session.windowId).catch(() => null);
            tab = await chrome.tabs.create({
              windowId: win?.id,
              url: targetUrl,
              active: true,
            });
            session.tabId = tab.id;
            if (session.groupId && tab.id) {
              await chrome.tabs.group({ tabIds: [tab.id], groupId: session.groupId }).catch(() => {});
            }
            await persistSessions();
          } else {
            // X can replace the persisted tab with a composer tab during a
            // navigation. Prefer the live composer in the controlled window
            // so a service-worker restart does not send the execution back to
            // the pre-composer tab.
            const windowTabs = await chrome.tabs.query({ windowId: session.windowId }).catch(() => []);
            const composerTab = windowTabs.find((candidate) => typeof candidate.url === "string" && /\/compose\/post(?:\?|$)/.test(candidate.url));
            if (composerTab?.id) {
              tab = composerTab;
              session.tabId = composerTab.id;
              await persistSessions();
            }
            // Re-use an already-open X composer when an operator or a prior
            // navigation has left one mounted. Navigating that tab to the
            // target first destroys the composer and makes the pending
            // execution impossible to finish within its permit window.
            // A generic composer is reusable only for an original post. A
            // reply/quote/repost composer is target-bound; reusing an old one
            // routes the next execution into the wrong conversation and can
            // leave the server lease claimed until it expires.
            const composerIsOpen = affordance === "post" && typeof tab.url === "string" && /\/compose\/post(?:\?|$)/.test(tab.url);
            if (!composerIsOpen && tab.url !== targetUrl) {
              await chrome.tabs.update(session.tabId, { url: targetUrl });
            }
          }

          await waitForTabComplete(session.tabId);
          await sendSessionContext(session);

          // Deliver the execution to the controlled tab
          chrome.tabs.sendMessage(session.tabId, {
            type: "OPENPRESENCE_EXECUTE",
            execution,
            expectedHandle: session.presence.handle,
            presenceName: session.presence.name,
            dedicatedTab: false,
          }).catch((error) => {
            finishExecution(session, {
              executionId: execution.id,
              ok: false,
              code: "CONTROLLED_TAB_UNAVAILABLE",
              message: error.message || "The controlled tab did not accept the execution.",
              retryable: true,
            });
          });
        } catch (error) {
          finishExecution(session, {
            executionId: execution.id,
            ok: false,
            code: "EXECUTION_NAVIGATION_FAILED",
            message: error.message || "Could not navigate controlled tab to target URL.",
            retryable: true,
          });
        }
      }
      // A healthy Bridge can still be unable to claim work when the tab's
      // account identity is stale. Re-verify the signed-in account instead
      // of leaving the queue blocked until a manual reload or navigation.
      // Do not immediately claim from the identity callback: an empty queue
      // would otherwise recurse forever between claim and identity checks.
      if (!claimed.length && result.retryAfterIdentity) {
        await requestIdentity(session, false);
        // The identity POST and the claim request are separate round trips.
        // Retry only when the server explicitly says the queue was held for
        // account freshness; otherwise an empty queue must stay quiet.
        scheduleClaimAfterIdentity(session);
      }
    } catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
  })();
  claimRuns.set(session.presence.id, run);
  try { await run; } finally { claimRuns.delete(session.presence.id); }
}

async function ingest(session, observation) {
  const sourceEventId = observation.sourceEventId || `${session.executorId}:${observation.externalRef?.id || Date.now()}`;
  if (seenEvents.has(sourceEventId)) return;
  seenEvents.add(sourceEventId);
  if (seenEvents.size > 500) seenEvents.delete(seenEvents.values().next().value);
  try { await bridgeRequest(session, "/api/bridge/v1/events", { method: "POST", body: JSON.stringify({ events: [{ sourceEventId, event: "created", object: observation.object }] }) }); }
  catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
}

function releaseActiveExecution(session, executionId) {
  if (session.activeExecutionId !== executionId) return;
  const watchdog = activeExecutionWatchdogs.get(session.presence.id);
  if (watchdog) clearTimeout(watchdog);
  activeExecutionWatchdogs.delete(session.presence.id);
  session.activeExecutionId = undefined;
  session.activeExecutionStartedAt = undefined;
  session.activeExecution = undefined;
  void persistSessions();
}

function armActiveExecutionWatchdog(session, executionId) {
  const previous = activeExecutionWatchdogs.get(session.presence.id);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    activeExecutionWatchdogs.delete(session.presence.id);
    if (session.activeExecutionId !== executionId) return;
    // The server-side Bridge lease is already expired at this point. Release
    // only the local guard and let the next claim reconcile/requeue the stale
    // execution; never synthesize success for a target we could not verify.
    session.activeExecutionId = undefined;
    session.activeExecutionStartedAt = undefined;
    session.activeExecution = undefined;
    void persistSessions();
    setTimeout(() => {
      if (sessions.get(session.presence.id) === session) void claim(session);
    }, 250);
  }, activeExecutionWatchdogMs + 1_000);
  activeExecutionWatchdogs.set(session.presence.id, timer);
}

async function verifySubmittedExecution(session, result, attempt = 0) {
  if (!result.executionId) return;
  const executionPath = `/api/bridge/v1/executions/${encodeURIComponent(result.executionId)}/verify`;
  try {
    // When the composer settles without rendering the newly-created object,
    // channel-x returns the target post as a verification hint. That is not
    // the quote/reply's external ID; passing it as candidateExternalRef makes
    // the API verifier look for the target itself forever. Let the server
    // search by verified author, parent, and approved text in this fallback.
    const candidateExternalRef = result.externalRef?.type === "x.post"
      ? undefined
      : result.externalRef;
    const response = await bridgeRequest(session, executionPath, {
      method: "POST",
      body: JSON.stringify({ executorId: session.executorId, candidateExternalRef, observedAt: new Date().toISOString() })
    });
    if (response.verified || response.execution?.status === "succeeded") {
      await clearVerificationJob(result.executionId);
      releaseActiveExecution(session, result.executionId);
      setTimeout(() => void claim(session), 2_000);
      return;
    }
    if (response.execution?.status === "verification-pending" && response.execution?.failure?.retryable !== false && attempt < 5) {
      const delay = [1_000, 3_000, 8_000, 20_000, 45_000][attempt] || 45_000;
      const job = { executionId: result.executionId, presenceId: session.presence.id, result, attempt: attempt + 1, nextAttemptAt: new Date(Date.now() + delay).toISOString() };
      verificationJobs.set(result.executionId, job);
      await persistVerificationJobs();
      await scheduleVerificationAlarm();
      const timer = setTimeout(() => {
        verificationTimers.delete(result.executionId);
        if (verificationRuns.has(result.executionId)) return;
        verificationRuns.add(result.executionId);
        void verifySubmittedExecution(session, result, attempt + 1).finally(() => verificationRuns.delete(result.executionId));
      }, delay);
      verificationTimers.set(result.executionId, timer);
      // Retain session.activeExecutionId so subsequent executions remain strictly queued until verified
      return;
    }
    await clearVerificationJob(result.executionId);
    releaseActiveExecution(session, result.executionId);
    setTimeout(() => void claim(session), 2_000);
  } catch (error) {
    if (attempt < 5) {
      const delay = [1_000, 3_000, 8_000, 20_000, 45_000][attempt] || 45_000;
      verificationJobs.set(result.executionId, { executionId: result.executionId, presenceId: session.presence.id, result, attempt: attempt + 1, nextAttemptAt: new Date(Date.now() + delay).toISOString() });
      await persistVerificationJobs();
      await scheduleVerificationAlarm();
      const timer = setTimeout(() => {
        verificationTimers.delete(result.executionId);
        if (verificationRuns.has(result.executionId)) return;
        verificationRuns.add(result.executionId);
        void verifySubmittedExecution(session, result, attempt + 1).finally(() => verificationRuns.delete(result.executionId));
      }, delay);
      verificationTimers.set(result.executionId, timer);
    } else {
      await clearVerificationJob(result.executionId);
      const note = "Chrome reported submission, but OpenPresence could not prove the matching public X object after bounded verification retries. The action was closed without counting delivery.";
      try {
        await bridgeRequest(session, `${executionPath}/close`, {
          method: "POST",
          body: JSON.stringify({ executorId: session.executorId, note }),
        });
      } catch (closeError) {
        sendStatus({ state: "error", presenceId: session.presence.id, message: closeError.message || error.message || "X API verification could not be completed." });
      }
      releaseActiveExecution(session, result.executionId);
      setTimeout(() => void claim(session), 2_000);
    }
  }
}

async function finishExecution(session, result) {
  if (!result.executionId) return;
  if (result.verifyWithApi) {
    await verifySubmittedExecution(session, result);
    return;
  }
  let acknowledged = false;
  try {
    if (result.ok) {
      await bridgeRequest(session, `/api/bridge/v1/executions/${encodeURIComponent(result.executionId)}/ack`, { method: "POST", body: JSON.stringify({ executorId: session.executorId, externalRef: result.externalRef, observedAt: new Date().toISOString() }) });
      acknowledged = true;
    }
    else {
      await bridgeRequest(session, `/api/bridge/v1/executions/${encodeURIComponent(result.executionId)}/fail`, { method: "POST", body: JSON.stringify({ executorId: session.executorId, code: result.code || "BROWSER_EXECUTION_FAILED", message: result.message || "The controlled tab could not verify the result.", retryable: Boolean(result.retryable) }) });
      acknowledged = true;
    }
  } catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
  finally {
    releaseActiveExecution(session, result.executionId);
  }
  setTimeout(() => void claim(session), acknowledged ? 2_000 : 3_000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      await restoreSessions();
      if (message?.type === "OPENPRESENCE_GET_STATUS") {
        sendResponse(await popupStatus(message.presenceId || lastConfig?.activePresenceId));
        return;
      }
      if (message?.type === "OPENPRESENCE_APP_STATE") {
        lastConfig = message.config;
        await chrome.storage.session.set({ openpresenceConfig: lastConfig });
        if (lastConfig?.selected?.id && lastConfig.selected.browserAccess?.enabled) {
          await chrome.storage.local.set({ [reconnectPresenceKey]: lastConfig.selected.id });
        }
        // Browser hands are an operator-enabled capability. Restore the
        // controlled session after an MV3 worker/extension reload instead of
        // leaving a healthy-looking Bridge stale until a manual click.
        restoreConfiguredSessions(lastConfig);
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "OPENPRESENCE_OPEN_CHROME") {
        try {
          const session = await startSession(message.presenceId || lastConfig?.activePresenceId);
          sendResponse({ ok: true, status: publicSessionStatus(session) });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "OpenPresence could not open the controlled Chrome session.";
          sendStatus({ state: "error", presenceId: message.presenceId, message: detail });
          sendResponse({ ok: false, error: detail });
        }
        return;
      }
      if (message?.type === "OPENPRESENCE_STOP_CHROME") {
        await chrome.storage.local.remove(reconnectPresenceKey);
        await stopSession(message.presenceId);
        sendResponse({ ok: true, status: await popupStatus(message.presenceId) });
        return;
      }
      // Execution tabs are rebound during X navigation and after an MV3
      // service-worker restart. There is no separate executionTabs registry;
      // resolve the session from the sender's live tab, then fall back to the
      // controlled window for identity/readiness messages.
      let session = [...sessions.values()].find((item) => item.tabId === sender.tab?.id);
      // Identity is observational and can be reported by any X tab in the
      // controlled window. The persisted execution tab is not authoritative:
      // X navigation and extension reloads can leave a newer tab carrying the
      // live account controls while the old tab ID remains in the session.
      if (!session && message?.type === "OPENPRESENCE_ACCOUNT_IDENTITY" && sender.tab && isXTab(sender.tab)) {
        session = [...sessions.values()].find((item) => item.windowId === sender.tab.windowId);
      }
      if (!session && message?.type === "OPENPRESENCE_CHANNEL_READY" && sender.tab && isXTab(sender.tab)) {
        session = [...sessions.values()].find((item) => item.windowId === sender.tab.windowId);
      }
      if (!session) { sendResponse({ ok: false, error: "The controlled Chrome session is no longer active." }); return; }
      if (message?.type === "OPENPRESENCE_CHANNEL_READY" && sender.tab?.id) {
        // X can mount its content script after the one initial context send.
        // Rebind the live X tab before it reports account identity.
        session.tabId = sender.tab.id;
        await persistSessions();
        await sendSessionContextToTab(session, sender.tab.id);
      }
      if (message?.type === "OPENPRESENCE_OBSERVATION") await ingest(session, message.observation);
      if (message?.type === "OPENPRESENCE_ACCOUNT_IDENTITY") await reportIdentity(session, message.username, message.claimAfterVerification !== false);
      if (message?.type === "OPENPRESENCE_METRICS") {
        try {
          await reportMetrics(session, message.metrics);
          sendSessionStatus(session);
        } catch (error) {
          sendStatus({ state: "error", presenceId: session.presence.id, message: error.message || "The channel metrics could not be saved." });
        }
      }
      if (message?.type === "OPENPRESENCE_EXECUTION_RESULT") {
        await finishExecution(session, message.result);
      }
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "The OpenPresence extension request failed." });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [presenceId, session] of sessions) if (session.tabId === tabId) void stopSession(presenceId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  void chrome.tabs.get(tabId).then((tab) => {
    const session = [...sessions.values()].find((item) => item.tabId === tabId
      || (item.activeExecutionId && item.windowId === tab.windowId));
    if (!session) return;
    if (session.activeExecutionId && session.activeExecution?.id === session.activeExecutionId && tabId !== session.tabId) {
      // Rebind to the newly-created X composer and deliver the same claimed
      // execution. The content script will finish the approved action and
      // report the result through the normal acknowledgement path.
      session.tabId = tabId;
      void persistSessions();
      sendSessionContext(session);
      chrome.tabs.sendMessage(tabId, {
        type: "OPENPRESENCE_EXECUTE",
        execution: session.activeExecution,
        expectedHandle: session.presence.handle,
        presenceName: session.presence.name,
        dedicatedTab: false,
      }).catch(() => {});
      return;
    }
    sendSessionContext(session);
    // The channel content script is now ready to receive an autonomous
    // execution. This keeps the queue moving without a manual reply click.
    if (!session.activeExecutionId) void claim(session);
  }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const session = [...sessions.values()].find((item) => item.tabId === tabId);
  if (session) sendSessionContext(session);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === verificationAlarmName) {
    void restoreSessions().then(() => processVerificationJobs());
    return;
  }
  if (alarm.name !== heartbeatAlarmName) return;
  void restoreSessions().then(() => Promise.all([...sessions.values()].map(async (session) => {
    const connected = await heartbeat(session);
    // Heartbeats are also the Bridge's durable queue wake-up. Without this
    // claim, work queued after the tab opened can remain queued indefinitely
    // while the Bridge still appears online and verified.
    if (connected && !session.activeExecutionId) await claim(session);
    if (!session.lastMetricsAt || Date.now() - session.lastMetricsAt >= 15 * 60_000) await requestMetrics(session);
  })).then(() => processVerificationJobs()));
});
chrome.runtime.onInstalled.addListener(() => { void ensureHeartbeatAlarm(); });
chrome.runtime.onStartup.addListener(() => { void ensureHeartbeatAlarm(); void restoreLastConfiguredSession(); });
void ensureHeartbeatAlarm();
void restoreSessions();
void restoreLastConfiguredSession();
void updateBadge();
