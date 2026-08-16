(function () {
  let sessionState = "observing";
  let expectedHandle = "";
  let presenceName = "OpenPresence";
  const overlay = document.createElement("div");
  overlay.id = "openpresence-browser-overlay";
  overlay.attachShadow({ mode: "open" }).innerHTML = `<style>:host{all:initial}.wrap{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(213,146,103,.65);border-radius:999px;background:rgba(255,250,246,.96);box-shadow:0 5px 24px rgba(39,25,17,.14);color:#332a25;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mark{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#c77d50;color:#fff;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:#73a879}.text{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label{display:block;color:#766b63;font-size:10px;margin-top:2px}</style><div class="wrap"><span class="mark">◉</span><span class="text"><b id="name">OpenPresence</b><span class="label" id="state">Observing · browser hands ready</span></span><span class="dot"></span></div>`;
  document.documentElement.appendChild(overlay);
  const stateLabel = () => overlay.shadowRoot.getElementById("state").textContent = `${sessionState[0].toUpperCase()}${sessionState.slice(1)} · ${presenceName}`;
  const setState = (value) => { sessionState = value; stateLabel(); };
  const text = (node) => node?.innerText?.trim().replace(/\s+/g, " ") || "";

  function verifyAccount() {
    if (!expectedHandle) return { ok: false, message: "The Presence account is not known to this tab." };
    const normalized = expectedHandle.replace(/^@/, "").toLowerCase();
    const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const visible = text(switcher).toLowerCase();
    if (!visible || !visible.includes(normalized)) return { ok: false, message: `Account check failed. Expected @${normalized}.` };
    return { ok: true };
  }

  function visiblePosts() {
    return [...document.querySelectorAll("article")].map((article) => {
      const link = article.querySelector('a[href*="/status/"]');
      const match = link?.href?.match(/status\/(\d+)/);
      if (!match) return null;
      const userLink = article.querySelector('[data-testid="User-Name"] a');
      return { id: match[1], text: text(article), handle: userLink?.textContent?.replace(/^@/, "").trim(), element: article };
    }).filter(Boolean);
  }

  async function waitFor(predicate, timeout = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const value = predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 250)); }
    return undefined;
  }

  async function execute(execution, canNavigate = true) {
    setState("preparing");
    const account = verifyAccount();
    if (!account.ok) return { executionId: execution.id, ok: false, code: "ACCOUNT_MISMATCH", message: account.message, retryable: false };
    if (execution.affordance !== "reply" && execution.affordance !== "x.reply") return { executionId: execution.id, ok: false, code: "UNSUPPORTED_AFFORDANCE", message: "This first Chrome route only executes replies.", retryable: false };
    const targetId = execution.target?.id;
    if (!targetId) return { executionId: execution.id, ok: false, code: "MISSING_TARGET", message: "The Bridge execution has no target post.", retryable: false };
    let target = visiblePosts().find((post) => post.id === targetId);
    if (!target && canNavigate) {
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName }));
      window.location.href = `https://x.com/i/web/status/${encodeURIComponent(targetId)}`;
      return undefined;
    }
    await waitFor(() => document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'));
    const afterNavigation = verifyAccount();
    if (!afterNavigation.ok) return { executionId: execution.id, ok: false, code: "ACCOUNT_MISMATCH", message: afterNavigation.message, retryable: false };
    setState("acting");
    target = await waitFor(() => visiblePosts().find((post) => post.id === targetId));
    const replyButton = target?.element?.querySelector('[data-testid="reply"]');
    if (!replyButton) return { executionId: execution.id, ok: false, code: "TARGET_NOT_VISIBLE", message: "The target post was not visible in the controlled tab.", retryable: true };
    replyButton.click();
    const composer = await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'));
    if (!composer) return { executionId: execution.id, ok: false, code: "COMPOSER_NOT_READY", message: "X did not open the reply composer.", retryable: true };
    composer.focus();
    document.execCommand("insertText", false, execution.content || "");
    const submit = await waitFor(() => document.querySelector('[data-testid="tweetButtonInline"]:not([disabled])'));
    if (!submit) return { executionId: execution.id, ok: false, code: "SUBMIT_NOT_READY", message: "The reply button did not become available.", retryable: true };
    setState("verifying");
    submit.click();
    const ownReply = await waitFor(() => visiblePosts().find((post) => post.text.includes(execution.content || "") && post.handle?.toLowerCase() === expectedHandle.replace(/^@/, "").toLowerCase()), 12_000);
    if (!ownReply) return { executionId: execution.id, ok: false, code: "RESULT_NOT_VERIFIED", message: "The tab submitted no reply that could be verified as the Presence account.", retryable: true };
    setState("observing");
    return { executionId: execution.id, ok: true, externalRef: { type: "x.reply", id: ownReply.id } };
  }

  function scan() {
    const account = verifyAccount();
    if (!account.ok) { setState("waiting"); return; }
    for (const post of visiblePosts().slice(0, 12)) chrome.runtime.sendMessage({ type: "OPENPRESENCE_OBSERVATION", observation: { sourceEventId: `x:${post.id}`, externalRef: { type: "x.post", id: post.id }, object: { externalRef: { type: "x.post", id: post.id }, objectType: "post", author: { displayName: post.handle ? `@${post.handle}` : "X account", handle: post.handle }, content: { text: post.text }, visibility: "public", shareability: "presence-only" } } }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPENPRESENCE_EXECUTE") { expectedHandle = message.expectedHandle || expectedHandle; presenceName = message.presenceName || presenceName; overlay.shadowRoot.getElementById("name").textContent = presenceName; void execute(message.execution).then((result) => { if (result) chrome.runtime.sendMessage({ type: "OPENPRESENCE_EXECUTION_RESULT", result }); }); }
    if (message?.type === "OPENPRESENCE_SESSION_CONTEXT") { expectedHandle = message.expectedHandle || expectedHandle; presenceName = message.presenceName || presenceName; }
  });
  const pending = sessionStorage.getItem("openpresence-pending-execution");
  if (pending) {
    sessionStorage.removeItem("openpresence-pending-execution");
    try {
      const restored = JSON.parse(pending);
      expectedHandle = restored.expectedHandle || expectedHandle;
      presenceName = restored.presenceName || presenceName;
      overlay.shadowRoot.getElementById("name").textContent = presenceName;
      void execute(restored.execution, false).then((result) => { if (result) chrome.runtime.sendMessage({ type: "OPENPRESENCE_EXECUTION_RESULT", result }); });
    } catch { /* Ignore malformed session state and keep the tab observational. */ }
  }
  setState("observing");
  window.setInterval(scan, 6_000);
  window.setTimeout(scan, 2_000);
})();
