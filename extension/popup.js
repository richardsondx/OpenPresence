const status = document.getElementById("status");
const openButton = document.getElementById("open");
const stopButton = document.getElementById("stop");
let config;

function render(message, tone = "") {
  status.textContent = message;
  status.className = `status ${tone}`;
}

async function request(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The extension service worker is unavailable. Reload the extension." };
  }
}

async function load() {
  const stored = await chrome.storage.session.get("openpresenceConfig");
  config = stored.openpresenceConfig;
  const configuredPresence = config?.selected || config?.presences?.find((item) => item.id === config?.activePresenceId);
  const current = await request({ type: "OPENPRESENCE_GET_STATUS", presenceId: configuredPresence?.id });
  const presence = configuredPresence || (current?.presenceId ? { id: current.presenceId, name: current.presenceName, handle: current.presenceHandle } : undefined);
  if (!presence || current?.state === "unconfigured") { render("Open the local app and enable Chrome hands for a Presence."); return; }
  if (current?.state === "disabled") {
    render(`${presence.name} ${presence.handle || ""}\nChrome hands are disabled for this Presence.`);
    openButton.disabled = true;
    stopButton.disabled = true;
    return;
  }
  const connected = current?.state === "connected";
  render(`${presence.name} ${presence.handle || ""}\n${connected ? "Connected to the controlled Chrome session." : "Ready to open a grouped, visible Chrome session."}`, "ready");
  openButton.disabled = false;
  stopButton.disabled = !connected;
  openButton.textContent = connected ? "Focus controlled Chrome" : "Open controlled Chrome";
  openButton.onclick = async () => {
    openButton.disabled = true;
    render(`${connected ? "Focusing" : "Opening"} Chrome for ${presence.name}…`, "ready");
    const result = await request({ type: "OPENPRESENCE_OPEN_CHROME", presenceId: presence.id });
    if (!result?.ok) {
      render(result?.error || "OpenPresence could not open the controlled Chrome session.", "error");
      openButton.disabled = false;
      return;
    }
    render(`${presence.name} ${presence.handle || ""}\nConnected to the controlled Chrome session.`, "ready");
    openButton.disabled = false;
    stopButton.disabled = false;
  };
  stopButton.onclick = async () => {
    stopButton.disabled = true;
    const result = await request({ type: "OPENPRESENCE_STOP_CHROME", presenceId: presence.id });
    if (!result?.ok) {
      render(result?.error || "The controlled session could not be closed.", "error");
      stopButton.disabled = false;
      return;
    }
    render("The controlled session is closed.", "ready");
    openButton.textContent = "Open controlled Chrome";
  };
}

chrome.runtime.onMessage.addListener((message) => { if (message?.type === "OPENPRESENCE_EXTENSION_STATUS" && message.status?.state === "error") render(message.status.message || "The Chrome session needs attention.", "error"); });
void load();
