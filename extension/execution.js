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

  async function assetsForExecution(execution) {
    const rawIds = execution?.publication?.assetIds;
    if (rawIds !== undefined && !Array.isArray(rawIds)) throw new Error("The approved Asset list is malformed.");
    const ids = [];
    for (const value of rawIds ?? []) {
      if (typeof value !== "string" || !value.trim()) throw new Error("The approved Asset list contains an invalid Asset ID.");
      if (!ids.includes(value)) ids.push(value);
    }
    const assets = [];
    for (const assetId of ids) {
      const response = await sendMessage({ type: "OPENPRESENCE_FETCH_ASSET", assetId });
      if (!response?.ok || !response.asset || response.asset.assetId !== assetId) {
        throw new Error(response?.error || `The authorized Asset ${assetId} could not be retrieved.`);
      }
      const mimeType = String(response.asset.mimeType || "").split(";", 1)[0].trim().toLowerCase();
      if (!["image/png", "image/jpeg", "image/gif"].includes(mimeType)) {
        throw new Error(`The X Bridge cannot upload ${mimeType || "this Asset format"}.`);
      }
      const bytes = bytesFromBase64(response.asset.data);
      assets.push({ assetId, file: new root.File([bytes], response.asset.name || `${assetId}.img`, { type: mimeType }) });
    }
    return assets;
  }

  root.OpenPresenceExecution = { textForExecution, assetsForExecution };
  root.OpenPresenceRuntime = { sendMessage };
})(window);
