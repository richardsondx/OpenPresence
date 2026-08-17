(function (root) {
  function sendMessage(message) {
    try {
      if (!root.chrome?.runtime?.id) return Promise.resolve(false);
      return Promise.resolve(root.chrome.runtime.sendMessage(message)).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function textForExecution(execution) {
    const payload = execution?.publication?.payload;
    if (payload && typeof payload === "object" && typeof payload.text === "string") return payload.text.trim();
    if (typeof execution?.publication?.publicExpression?.text === "string") return execution.publication.publicExpression.text.trim();
    return "";
  }

  root.OpenPresenceExecution = { textForExecution };
  root.OpenPresenceRuntime = { sendMessage };
})(window);
