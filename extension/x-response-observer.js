// MAIN world: observe only the active claimed execution's upload/CreateTweet
// and exact public readback. Never capture headers, cookies, tokens or general
// timeline/DM bodies. The website performs every request; this script is inert
// without a bounded claim from the isolated extension adapter.
(function (root) {
  const storageKey = 'openpresence-x-response-claim-v1';
  const maxBytes = 20 * 1024 * 1024;
  let claim;
  const chunks = new Map();
  const now = () => new Date().toISOString();
  const active = () => claim && Date.now() < claim.expiresAt;
  const persist = () => { try { if (claim) root.sessionStorage.setItem(storageKey, JSON.stringify(claim)); else root.sessionStorage.removeItem(storageKey); } catch {} };
  const snapshot = () => active() ? { executionId: claim.executionId, permitNonce: claim.permitNonce, createdPostId: claim.createdPostId, post: claim.post, uploads: claim.uploads, observedAt: now(), readback: Boolean(claim.post) } : null;
  try { const restored = JSON.parse(root.sessionStorage.getItem(storageKey) || 'null'); if (restored && restored.expiresAt > Date.now()) claim = restored; } catch {}
  function route(value) {
    try {
      const url = new URL(value, root.location.href);
      if (url.protocol !== 'https:' || !(url.hostname === 'x.com' || url.hostname.endsWith('.x.com'))) return null;
      if (/\/media\/upload(?:\.json)?$/.test(url.pathname)) return 'upload';
      if (/\/graphql\/[^/]+\/CreateTweet$/.test(url.pathname)) return 'create';
      if (/\/graphql\/[^/]+\/(?:TweetDetail|TweetResultByRestId|TweetResultsByRestIds)$/.test(url.pathname)) return 'read';
      return null;
    } catch { return null; }
  }
  function publicPost(body, wantedId) {
    // Traverse structural response data, but retain only this exact post.
    const pending = [body]; let visited = 0;
    while (pending.length && visited++ < 12000) {
      const node = pending.pop(); if (!node || typeof node !== 'object') continue;
      const legacy = node.legacy;
      const id = String(node.rest_id || legacy?.id_str || '');
      if (legacy && /^\d+$/.test(id) && (!wantedId || id === wantedId)) {
        const user = node.core?.user_results?.result;
        const authorHandle = user?.legacy?.screen_name || user?.core?.screen_name;
        const noteText = node.note_tweet?.note_tweet_results?.result?.text;
        let text = noteText || legacy.full_text;
        // X appends attachment/quote URLs to full_text. Its display range
        // identifies the authored body; never strip arbitrary user URLs.
        const range = legacy.display_text_range;
        if (!noteText && typeof text === 'string' && Array.isArray(range) && range.length === 2
          && range.every(Number.isInteger) && range[0] >= 0 && range[1] >= range[0] && range[1] <= text.length) {
          text = text.slice(range[0], range[1]);
        }
        const created = Date.parse(legacy.created_at);
        if (!Number.isFinite(created)) continue;
        const createdAt = new Date(created).toISOString();
        if (typeof authorHandle === 'string' && typeof text === 'string') {
          const media = legacy.extended_entities?.media || legacy.entities?.media || [];
          const mediaIds = media.map(item => String(item.id_str || '')).filter(id => /^\d+$/.test(id));
          // Missing media IDs must not be mistaken for a text-only post.
          if (mediaIds.length !== media.length) return null;
          return { externalRef: { type: 'x.post', id }, permalink: `https://x.com/${authorHandle.toLowerCase()}/status/${id}`, authorHandle, text: text.slice(0, 100000), createdAt,
            parentId: legacy.in_reply_to_status_id_str || undefined, quotedTargetId: legacy.quoted_status_id_str || undefined, mediaIds };
        }
      }
      for (const value of Object.values(node)) if (value && typeof value === 'object') pending.push(value);
    }
    return null;
  }
  const hash = async bytes => Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  async function uploadRequest(body, url) {
    if (!active()) return null;
    let fields = body;
    if (typeof fields === 'string') fields = new URLSearchParams(fields);
    if (!fields?.get) return null;
    const params = new URL(url, root.location.href).searchParams;
    const get = name => fields.get(name) || params.get(name);
    const mediaId = String(get('media_id') || '');
    const command = String(get('command') || '').toUpperCase();
    const media = get('media');
    if (media?.arrayBuffer) {
      if (media.size > maxBytes) return null;
      const bytes = new Uint8Array(await media.arrayBuffer());
      if (!active()) return null;
      if (command === 'APPEND' && /^\d+$/.test(mediaId)) {
        const segment = Number(get('segment_index') || 0);
        if (!Number.isInteger(segment) || segment < 0 || segment > 1000) return null;
        const group = chunks.get(mediaId) || new Map();
        const total = [...group.values()].reduce((sum, value) => sum + value.length, 0);
        if (total + bytes.length > maxBytes) return null;
        group.set(segment, bytes); chunks.set(mediaId, group);
        return { command, mediaId };
      }
      return { command, mediaId, sha256: await hash(bytes) };
    }
    return { command, mediaId };
  }
  async function observe(kind, request, body, scope) {
    if (!active() || claim !== scope) return;
    if (kind === 'upload') {
      if (!request) return;
      const mediaId = String(body?.media_id_string || body?.media_id || request.mediaId || '');
      if (!/^\d+$/.test(mediaId) || request.command === 'INIT' || request.command === 'APPEND') return;
      let sha256 = request.sha256;
      if (!sha256 && ['FINALIZE', 'STATUS'].includes(request.command)) {
        const group = chunks.get(mediaId);
        if (group?.size) {
          const ordered = [...group.keys()].sort((a,b) => a-b);
          if (ordered.every((value,index) => value === index)) {
            const parts = ordered.map(index => group.get(index));
            const bytes = new Uint8Array(parts.reduce((sum,part) => sum + part.length,0)); let offset = 0;
            for (const part of parts) { bytes.set(part,offset); offset += part.length; }
            sha256 = await hash(bytes);
          }
        }
      }
      if (!active() || claim !== scope || !sha256) return;
      const asset = claim.assets.find(item => item.sha256 === sha256 && !claim.uploads.some(upload => upload.assetId === item.assetId));
      if (!asset || claim.uploads.some(upload => upload.platformMediaId === mediaId)) return;
      claim.uploads.push({ assetId: asset.assetId, sha256, platformMediaId: mediaId, executionId: claim.executionId, permitNonce: claim.permitNonce, uploadedAt: now() }); chunks.delete(mediaId); persist();
    } else if (kind === 'create') {
      const post = publicPost(body?.data?.create_tweet?.tweet_results?.result);
      if (post) { claim.createdPostId = post.externalRef.id; claim.post = undefined; persist(); }
    } else if (kind === 'read' && claim.createdPostId) {
      // An independent website read response, never the CreateTweet body.
      const post = publicPost(body, claim.createdPostId);
      if (post) { claim.post = post; persist(); }
    }
  }
  root.addEventListener('message', event => {
    if (event.source !== root || event.origin !== root.location.origin || event.data?.type !== 'OPENPRESENCE_X_EVIDENCE_REQUEST') return;
    const { action, token, config } = event.data;
    if (action === 'start' && typeof config?.executionId === 'string' && config.executionId.length <= 240
      && typeof config.permitNonce === 'string' && config.permitNonce.length <= 240 && config.permitNonce
      && Array.isArray(config.assets) && config.assets.length <= 8) {
      if (!active() || claim.executionId !== config.executionId || claim.permitNonce !== config.permitNonce) {
        claim = { executionId: config.executionId, permitNonce: config.permitNonce, assets: config.assets.filter(item => typeof item.assetId === 'string' && /^[a-f0-9]{64}$/.test(item.sha256)), uploads: [], expiresAt: Math.min(Number(config.expiresAt) || 0, Date.now() + 180000) };
        chunks.clear(); persist();
      }
    }
    if (action === 'stop') { claim = undefined; chunks.clear(); persist(); }
    root.postMessage({ type: 'OPENPRESENCE_X_EVIDENCE_RESPONSE', token, installed: true, evidence: snapshot() }, root.location.origin);
  });
  async function boundedJson(response) {
    const reader = response.body?.getReader();
    if (!reader) return null;
    const parts = []; let count = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        count += next.value.length;
        if (count > 4 * 1024 * 1024) { await reader.cancel(); return null; }
        parts.push(next.value);
      }
      const bytes = new Uint8Array(count); let offset = 0;
      for (const part of parts) { bytes.set(part,offset); offset += part.length; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally { reader.releaseLock(); }
  }
  const nativeFetch = root.fetch;
  if (nativeFetch) root.fetch = function (input, init) {
    const kind = active() && route(typeof input === 'string' || input instanceof URL ? String(input) : input?.url);
    const scope = claim;
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const request = kind === 'upload' ? (init?.body ? uploadRequest(init.body,url) : input?.clone?.().formData().then(body => uploadRequest(body,url)).catch(() => null)) : Promise.resolve(null);
    return nativeFetch.apply(this, arguments).then(response => {
      if (kind && response.ok && claim === scope) void Promise.all([request, boundedJson(response.clone())]).then(([req,body]) => observe(kind,req,body,scope)).catch(() => {});
      return response;
    });
  };
  const proto = root.XMLHttpRequest?.prototype;
  if (proto) {
    const nativeOpen = proto.open, nativeSend = proto.send;
    const contexts = new WeakMap();
    proto.open = function (method,url) { contexts.set(this,{url:String(url)}); return nativeOpen.apply(this,arguments); };
    proto.send = function (body) {
      const context = contexts.get(this); const kind = active() && route(context?.url); const scope = claim;
      if (kind) {
        const request = kind === 'upload' ? uploadRequest(body,context.url) : Promise.resolve(null);
        this.addEventListener('load', () => {
          if (this.status < 200 || this.status >= 300 || claim !== scope) return;
          try { if (this.responseType !== 'json' && this.responseText.length > 4 * 1024 * 1024) return; const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText); void request.then(req => observe(kind,req,data,scope)).catch(() => {}); } catch {}
        }, {once:true});
      }
      return nativeSend.apply(this,arguments);
    };
  }
  // Test surface is only present in the Node composition harness.
  if (typeof module !== 'undefined' && module.exports) module.exports = { route, publicPost, uploadRequest, observe, snapshot };
})(window);
