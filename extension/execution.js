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

  function bytesFromBase64(value) {
    if (typeof value !== "string" || !value) throw new Error("The authorized Asset response contained no bytes.");
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function connectorAssetFailure(message) {
    const error = new Error(message);
    error.code = "BROWSER_CONNECTOR_UNAVAILABLE";
    return error;
  }

  async function assetsForExecution(execution) {
    const rawIds = execution?.publication?.assetIds;
    if (rawIds !== undefined && !Array.isArray(rawIds)) throw new Error("The approved Asset list is malformed.");
    const ids = [];
    for (const value of rawIds ?? []) {
      if (typeof value !== "string" || !value.trim()) throw new Error("The approved Asset list contains an invalid Asset ID.");
      if (!ids.includes(value)) ids.push(value);
    }
    const assets = [];
    if (ids.length && (typeof execution?.id !== "string" || !execution.id.trim())) throw new Error("The approved execution ID is missing.");
    for (const assetId of ids) {
      let response;
      try {
        if (!root.chrome?.runtime?.id) throw new Error("The extension context is no longer active.");
        response = await root.chrome.runtime.sendMessage({ type: "OPENPRESENCE_FETCH_ASSET", assetId, executionId: execution.id });
      } catch (error) {
        throw connectorAssetFailure(`The OpenPresence browser connector could not retrieve the approved image: ${error instanceof Error ? error.message : "The extension connection was interrupted."} Reload the OpenPresence extension and refresh the X tab before retrying this exact action.`);
      }
      if (!response || (response.ok && !response.asset) || (!response.ok && !response.error)) throw connectorAssetFailure("The installed OpenPresence browser connector did not return the approved image. Reload the OpenPresence extension and refresh the X tab before retrying this exact action.");
      if (!response?.ok || !response.asset || response.asset.assetId !== assetId) {
        throw new Error(response?.error || `The authorized Asset ${assetId} could not be retrieved.`);
      }
      const mimeType = String(response.asset.mimeType || "").split(";", 1)[0].trim().toLowerCase();
      if (!["image/png", "image/jpeg", "image/gif"].includes(mimeType)) {
        throw new Error(`The X Bridge cannot upload ${mimeType || "this Asset format"}.`);
      }
      const bytes = bytesFromBase64(response.asset.data);
      const crypto = root.crypto || globalThis.crypto;
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (response.asset.sha256 && response.asset.sha256 !== sha256) throw new Error("The authorized Asset bytes did not match their immutable hash.");
      assets.push({ assetId, sha256, file: new root.File([bytes], response.asset.name || `${assetId}.img`, { type: mimeType }) });
    }
    return assets;
  }

  function evidenceRequest(action, config) {
    if (!root.addEventListener || !root.postMessage) return Promise.resolve(null);
    const token = (root.crypto || globalThis.crypto).randomUUID();
    return new Promise(resolve => {
      const finish = value => { root.removeEventListener("message", receive); clearTimeout(timer); resolve(value); };
      const receive = event => {
        if (event.source === root && event.origin === root.location.origin && event.data?.type === "OPENPRESENCE_X_EVIDENCE_RESPONSE" && event.data.token === token) finish(event.data);
      };
      const timer = setTimeout(() => finish(null), 1200);
      root.addEventListener("message", receive);
      root.postMessage({ type: "OPENPRESENCE_X_EVIDENCE_REQUEST", token, action, config }, root.location.origin);
    });
  }
  root.OpenPresenceExecution = { protocolVersion: 2, textForExecution, assetsForExecution, evidenceRequest };
  root.OpenPresenceRuntime = { sendMessage };
})(window);
