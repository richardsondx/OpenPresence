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
    // If the service worker is inactive, it may need a moment to wake up.
    // Retry once after a short delay.
    if (error?.message?.includes("Could not establish connection") || error?.message?.includes("Receiving end does not exist")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        return await chrome.runtime.sendMessage(message);
      } catch (retryError) {
        return { ok: false, error: "The extension service worker is unavailable. Reload the extension in chrome://extensions." };
      }
    }
    return { ok: false, error: error instanceof Error ? error.message : "The extension service worker is unavailable. Reload the extension." };
  }
}

// Fetch config directly from the OpenPresence app API as a fallback.
// The app-bridge.js content script only syncs config when the user visits
// localhost:3015 in Chrome. If they haven't, the popup would show nothing.
// This makes the popup work even before visiting the app.
async function fetchConfigFromApp() {
  // Try localhost:3015 first, then 127.0.0.1:3015
  for (const origin of ["http://localhost:3015", "http://127.0.0.1:3015"]) {
    try {
      const response = await fetch(`${origin}/api/browser/config`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data?.selected || data?.presences?.length) {
          // Sync to extension storage so background.js picks it up too
          try { await chrome.runtime.sendMessage({ type: "OPENPRESENCE_APP_STATE", config: data }); } catch {}
          return data;
        }
      }
    } catch { /* app not reachable at this origin */ }
  }
  return null;
}

async function load() {
  render("Looking for the OpenPresence app…");

  // Try synced config first (from app-bridge.js)
  const stored = await chrome.storage.session.get("openpresenceConfig");
  config = stored.openpresenceConfig;

  // If no synced config, fetch directly from the app API
  if (!config) {
    config = await fetchConfigFromApp();
  }

  const configuredPresence = config?.selected || config?.presences?.find((item) => item.id === config?.activePresenceId);
  const current = await request({ type: "OPENPRESENCE_GET_STATUS", presenceId: configuredPresence?.id });
  const presence = configuredPresence || (current?.presenceId ? { id: current.presenceId, name: current.presenceName, handle: current.presenceHandle } : undefined);

  if (!presence || current?.state === "unconfigured") {
    render("Open the local app at localhost:3015 and enable Chrome hands for a Presence. If the app is already running, open it in this browser so the extension can sync.");
    return;
  }
  if (current?.state === "disabled") {
    render(`${presence.name} ${presence.handle || ""}\nChrome hands are disabled for this Presence.`);
    openButton.disabled = true;
    stopButton.disabled = true;
    return;
  }
  const connected = current?.state === "connected";
  const identityRequired = current?.state === "identity_required";
  render(`${presence.name} ${presence.handle || ""}\n${connected ? "Connected and account verified. Browser actions are available." : identityRequired ? `Connected, but account verification is required. X must be signed in as ${presence.handle || "the configured account"}.` : "Ready to connect. Click Open controlled Chrome to start the session."}`, identityRequired ? "error" : "ready");
  openButton.disabled = false;
  stopButton.disabled = !(connected || identityRequired);
  openButton.textContent = connected || identityRequired ? "Focus controlled Chrome" : "Open controlled Chrome";
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
