const sessions = new Map();
const sessionStorageKey = "openpresenceChromeSessions";
const heartbeatAlarmName = "openpresence-heartbeat";
let lastConfig;
const seenEvents = new Set();
const claimRuns = new Map();

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

async function bridgeRequest(session, path, options = {}) {
  const origin = await appOrigin();
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${session.bridgeKey}`, ...(options.headers || {}) };
  const response = await fetch(`${origin}${path}`, { ...options, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `OpenPresence bridge request failed (${response.status}).`);
  return body;
}

function sendStatus(status) {
  chrome.tabs.query({ url: ["http://localhost:3015/*", "http://127.0.0.1:3015/*"] }).then((tabs) => tabs.forEach((tab) => chrome.tabs.sendMessage(tab.id, { type: "OPENPRESENCE_EXTENSION_STATUS", status }).catch(() => {})));
}

function sendSessionContext(session) {
  return chrome.tabs.sendMessage(session.tabId, { type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: session.presence.handle, presenceName: session.presence.name }).catch(() => {});
}

async function updateBadge() {
  const count = sessions.size;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: count ? "#c77d50" : "#766b63" });
}

async function persistSessions() {
  await chrome.storage.session.set({ [sessionStorageKey]: [...sessions.values()] });
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

async function reportIdentity(session, username) {
  try {
    const result = await bridgeRequest(session, "/api/bridge/v1/identity", { method: "POST", body: JSON.stringify({ executorId: session.executorId, username }) });
    if (result.identity?.status === "verified") {
      sendStatus({ state: "connected", presenceId: session.presence.id, presenceName: session.presence.name, tabId: session.tabId });
      await claim(session);
    } else {
      sendStatus({ state: "error", presenceId: session.presence.id, message: result.identity?.message || `The controlled tab must be signed in as ${session.presence.handle}.` });
    }
    return result;
  } catch (error) {
    sendStatus({ state: "error", presenceId: session.presence.id, message: error.message || "The controlled tab account could not be verified." });
    return undefined;
  }
}

async function restoreSessions() {
  if (sessions.size) return;
  const stored = await chrome.storage.session.get(sessionStorageKey);
  const saved = Array.isArray(stored[sessionStorageKey]) ? stored[sessionStorageKey] : [];
  for (const session of saved) {
    if (!session?.presence?.id || !session.tabId || !session.bridgeKey || !session.bridgeId) continue;
    try {
      await chrome.tabs.get(session.tabId);
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
    sendStatus({ state: "connected", presenceId: session.presence.id, presenceName: session.presence.name, tabId: session.tabId });
    // A service worker can wake after work was queued. Reconcile the queue
    // immediately instead of waiting for the next alarm tick.
    await claim(session);
    await requestMetrics(session);
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
      sendSessionContext(current);
      sendStatus({ state: "connected", presenceId: current.presence.id, presenceName: current.presence.name, tabId: current.tabId });
      await claim(current);
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
  await updateBadge();
  sendStatus({ state: "connected", presenceId, presenceName: presence.name, tabId: tab.id });
  await claim(session);
  await requestMetrics(session);
  return session;
}

async function stopSession(presenceId) {
  const session = sessions.get(presenceId);
  if (!session) return;
  sessions.delete(presenceId);
  await persistSessions();
  try { await chrome.tabs.remove(session.tabId); } catch { /* The user may have closed it already. */ }
  await updateBadge();
  sendStatus({ state: "stopped", presenceId });
}

async function heartbeat(session) {
  try {
    await bridgeRequest(session, "/api/bridge/v1/heartbeat", { method: "POST", body: JSON.stringify({ executorId: session.executorId }) });
    return true;
  } catch (error) {
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
  if (existing || session.activeExecutionId) return existing;
  const run = (async () => {
    try {
      // A controlled tab is a single foreground executor. Claim one execution
      // at a time so concurrent target navigations cannot race each other.
      const result = await bridgeRequest(session, "/api/bridge/v1/executions/claim", { method: "POST", body: JSON.stringify({ executorId: session.executorId, limit: 1 }) });
      for (const execution of result.executions || []) {
        session.activeExecutionId = execution.id;
        await persistSessions();
        chrome.tabs.sendMessage(session.tabId, { type: "OPENPRESENCE_EXECUTE", execution, expectedHandle: session.presence.handle, presenceName: session.presence.name })
          .catch((error) => finishExecution(session, { executionId: execution.id, ok: false, code: "CONTROLLED_TAB_UNAVAILABLE", message: error.message || "The controlled tab did not accept the execution.", retryable: true }));
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

async function finishExecution(session, result) {
  if (!result.executionId) return;
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
    if (session.activeExecutionId === result.executionId) {
      session.activeExecutionId = undefined;
      await persistSessions();
    }
  }
  if (acknowledged) setTimeout(() => void claim(session), 250);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  (async () => {
    await restoreSessions();
    if (message?.type === "OPENPRESENCE_APP_STATE") {
      lastConfig = message.config;
      await chrome.storage.session.set({ openpresenceConfig: lastConfig });
      return;
    }
    if (message?.type === "OPENPRESENCE_OPEN_CHROME") {
      try { await startSession(message.presenceId || lastConfig?.activePresenceId); }
      catch (error) { sendStatus({ state: "error", presenceId: message.presenceId, message: error.message }); }
      return;
    }
    if (message?.type === "OPENPRESENCE_STOP_CHROME") { await stopSession(message.presenceId); return; }
    const session = [...sessions.values()].find((item) => item.tabId === sender.tab?.id);
    if (!session) return;
    if (message?.type === "OPENPRESENCE_OBSERVATION") await ingest(session, message.observation);
    if (message?.type === "OPENPRESENCE_ACCOUNT_IDENTITY") await reportIdentity(session, message.username);
    if (message?.type === "OPENPRESENCE_METRICS") {
      try {
        await reportMetrics(session, message.metrics);
        sendStatus({ state: "connected", presenceId: session.presence.id, presenceName: session.presence.name, tabId: session.tabId });
      } catch (error) {
        sendStatus({ state: "error", presenceId: session.presence.id, message: error.message || "The channel metrics could not be saved." });
      }
    }
    if (message?.type === "OPENPRESENCE_EXECUTION_RESULT") await finishExecution(session, message.result);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [presenceId, session] of sessions) if (session.tabId === tabId) void stopSession(presenceId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const session = [...sessions.values()].find((item) => item.tabId === tabId);
  if (session) {
    sendSessionContext(session);
    // The channel content script is now ready to receive an autonomous
    // execution. This keeps the queue moving without a manual reply click.
    if (!session.activeExecutionId) void claim(session);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const session = [...sessions.values()].find((item) => item.tabId === tabId);
  if (session) sendSessionContext(session);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== heartbeatAlarmName) return;
  void restoreSessions().then(() => Promise.all([...sessions.values()].map(async (session) => {
    await heartbeat(session);
    await claim(session);
    if (!session.lastMetricsAt || Date.now() - session.lastMetricsAt >= 15 * 60_000) await requestMetrics(session);
  })));
});
chrome.runtime.onInstalled.addListener(() => { void ensureHeartbeatAlarm(); });
chrome.runtime.onStartup.addListener(() => { void ensureHeartbeatAlarm(); });
void ensureHeartbeatAlarm();
void restoreSessions();
void updateBadge();
