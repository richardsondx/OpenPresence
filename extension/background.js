const sessions = new Map();
let lastConfig;
const seenEvents = new Set();

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

async function updateBadge() {
  const count = sessions.size;
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: count ? "#c77d50" : "#766b63" });
}

async function startSession(presenceId) {
  const presence = lastConfig?.presences?.find((item) => item.id === presenceId) || lastConfig?.selected;
  if (!presence || presence.id !== presenceId || !presence.browserAccess?.enabled) throw new Error("Enable Chrome hands for the selected Presence in OpenPresence first.");
  if (sessions.has(presenceId)) {
    const current = sessions.get(presenceId);
    if (current.windowId) await chrome.windows.update(current.windowId, { focused: true });
    return current;
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
  chrome.tabs.sendMessage(tab.id, { type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: presence.handle, presenceName: presence.name }).catch(() => {});
  await updateBadge();
  sendStatus({ state: "connected", presenceId, presenceName: presence.name, tabId: tab.id });
  return session;
}

async function stopSession(presenceId) {
  const session = sessions.get(presenceId);
  if (!session) return;
  sessions.delete(presenceId);
  try { await chrome.tabs.remove(session.tabId); } catch { /* The user may have closed it already. */ }
  await updateBadge();
  sendStatus({ state: "stopped", presenceId });
}

async function heartbeat(session) {
  try { await bridgeRequest(session, "/api/bridge/v1/heartbeat", { method: "POST", body: JSON.stringify({ executorId: session.executorId }) }); }
  catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
}

async function claim(session) {
  try {
    const result = await bridgeRequest(session, "/api/bridge/v1/executions/claim", { method: "POST", body: JSON.stringify({ executorId: session.executorId, limit: 3 }) });
    for (const execution of result.executions || []) chrome.tabs.sendMessage(session.tabId, { type: "OPENPRESENCE_EXECUTE", execution, expectedHandle: session.presence.handle, presenceName: session.presence.name }).catch(() => {});
  } catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
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
  try {
    if (result.ok) await bridgeRequest(session, `/api/bridge/v1/executions/${encodeURIComponent(result.executionId)}/ack`, { method: "POST", body: JSON.stringify({ executorId: session.executorId, externalRef: result.externalRef, observedAt: new Date().toISOString() }) });
    else await bridgeRequest(session, `/api/bridge/v1/executions/${encodeURIComponent(result.executionId)}/fail`, { method: "POST", body: JSON.stringify({ executorId: session.executorId, code: result.code || "BROWSER_EXECUTION_FAILED", message: result.message || "The controlled tab could not verify the result.", retryable: Boolean(result.retryable) }) });
  } catch (error) { sendStatus({ state: "error", presenceId: session.presence.id, message: error.message }); }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  (async () => {
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
    if (message?.type === "OPENPRESENCE_EXECUTION_RESULT") await finishExecution(session, message.result);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [presenceId, session] of sessions) if (session.tabId === tabId) void stopSession(presenceId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const session = [...sessions.values()].find((item) => item.tabId === tabId);
  if (session) chrome.tabs.sendMessage(tabId, { type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: session.presence.handle, presenceName: session.presence.name }).catch(() => {});
});

setInterval(() => { for (const session of sessions.values()) { void heartbeat(session); void claim(session); } }, 5_000);
void updateBadge();
