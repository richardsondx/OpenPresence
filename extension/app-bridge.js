(function () {
  function sendMessage(message) {
    // A reload of an unpacked extension invalidates content scripts that are
    // still attached to an open app tab. Treat that transition as a temporary
    // disconnect; the refreshed app tab will re-establish the bridge.
    try {
      if (!chrome?.runtime?.id) return Promise.resolve(false);
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  const context = new URL(window.location.href);
  const contextQuery = new URLSearchParams();
  if (context.searchParams.get("agentId")) contextQuery.set("agentId", context.searchParams.get("agentId"));
  if (context.searchParams.get("presenceId")) contextQuery.set("presenceId", context.searchParams.get("presenceId"));

  async function sync() {
    try {
      const suffix = contextQuery.toString();
      const response = await fetch(`/api/browser/config${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
      if (response.ok) await sendMessage({ type: "OPENPRESENCE_APP_STATE", config: await response.json() });
    } catch { /* The app may be restarting; the next poll will recover. */ }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "openpresence") return;
    if (["OPENPRESENCE_OPEN_CHROME", "OPENPRESENCE_STOP_CHROME"].includes(event.data.type)) void sendMessage({ type: event.data.type, presenceId: event.data.presenceId });
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPENPRESENCE_EXTENSION_STATUS") window.postMessage({ source: "openpresence-extension", ...message }, "*");
  });
  void sync();
  window.setInterval(sync, 4_000);
})();
