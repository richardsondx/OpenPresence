const status = document.getElementById("status");
const openButton = document.getElementById("open");
const stopButton = document.getElementById("stop");
let config;

function render(message, tone = "") {
  status.textContent = message;
  status.className = `status ${tone}`;
}

async function load() {
  const stored = await chrome.storage.session.get("openpresenceConfig");
  config = stored.openpresenceConfig;
  const presence = config?.selected || config?.presences?.find((item) => item.id === config?.activePresenceId);
  if (!presence) { render("Open the local app and enable Chrome hands for a Presence."); return; }
  render(`${presence.name} ${presence.handle || ""}\nReady to open a grouped, visible Chrome session.`, "ready");
  openButton.disabled = false;
  stopButton.disabled = false;
  openButton.onclick = () => { chrome.runtime.sendMessage({ type: "OPENPRESENCE_OPEN_CHROME", presenceId: presence.id }); render(`Opening Chrome for ${presence.name}…`, "ready"); };
  stopButton.onclick = () => { chrome.runtime.sendMessage({ type: "OPENPRESENCE_STOP_CHROME", presenceId: presence.id }); render("The controlled session is closed.", "ready"); };
}

chrome.runtime.onMessage.addListener((message) => { if (message?.type === "OPENPRESENCE_EXTENSION_STATUS" && message.status?.state === "error") render(message.status.message || "The Chrome session needs attention.", "error"); });
void load();
