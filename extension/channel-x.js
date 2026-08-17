(function () {
  let sessionState = "observing";
  let expectedHandle = "";
  let presenceName = "Waiting for Presence";
  let activeExecutionId = null;
  const overlay = document.createElement("div");
  overlay.id = "openpresence-browser-overlay";
  overlay.attachShadow({ mode: "open" }).innerHTML = `<style>:host{all:initial}.wrap{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(213,146,103,.65);border-radius:999px;background:rgba(255,250,246,.96);box-shadow:0 5px 24px rgba(39,25,17,.14);color:#332a25;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mark{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#c77d50;color:#fff;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:#73a879}.text{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label{display:block;color:#766b63;font-size:10px;margin-top:2px}</style><div class="wrap"><span class="mark">◉</span><span class="text"><b id="name">OpenPresence</b><span class="label" id="state">Observing · browser hands ready</span></span><span class="dot"></span></div>`;
  document.documentElement.appendChild(overlay);
  const stateLabel = () => overlay.shadowRoot.getElementById("state").textContent = `${sessionState[0].toUpperCase()}${sessionState.slice(1)} · ${presenceName}`;
  const setState = (value) => { sessionState = value; stateLabel(); };
  const sendMessage = (message) => window.OpenPresenceRuntime?.sendMessage(message) || Promise.resolve(false);
  const text = (node) => node?.innerText?.trim().replace(/\s+/g, " ") || "";

  function readAuthor(article) {
    const container = article.querySelector('[data-testid="User-Name"]');
    const links = [...(container?.querySelectorAll('a[href]') || [])];
    const handleLink = links.find((link) => {
      try { return /^\/[A-Za-z0-9_]{1,30}$/.test(new URL(link.href).pathname); } catch { return false; }
    });
    const handle = handleLink ? new URL(handleLink.href).pathname.replace(/^\//, "") : undefined;
    const displayLink = links.find((link) => !text(link).startsWith("@"));
    return { displayName: text(displayLink) || (handle ? `@${handle}` : "X account"), handle };
  }

  function verifyAccount() {
    if (!expectedHandle) return { ok: false, message: "The Presence account is not known to this tab." };
    const normalized = expectedHandle.replace(/^@/, "").toLowerCase();
    const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid*="AccountSwitcher"], [aria-label*="Account"]');
    const visible = text(switcher).toLowerCase();
    if (visible && visible.includes(normalized)) return { ok: true };
    // X's route shell often renders the account menu before its accessible
    // label, while the signed-in profile link is already available. An exact
    // profile href is stronger evidence than whatever text a loading shell
    // happens to expose, and works on both the home and direct-status routes.
    const profileLink = [...document.querySelectorAll('a[href]')].find((node) => {
      try { return new URL(node.href).pathname.replace(/^\//, "").toLowerCase() === normalized; } catch { return false; }
    });
    if (profileLink) return { ok: true };
    if (!visible || !visible.includes(normalized)) return { ok: false, message: `Account check failed. Expected @${normalized}.` };
    return { ok: true };
  }

  function visiblePosts() {
    return [...document.querySelectorAll("article")].map((article) => {
      const link = article.querySelector('a[href*="/status/"]');
      const match = link?.href?.match(/status\/(\d+)/);
      if (!match) return null;
      const author = readAuthor(article);
      const textNode = article.querySelector('[data-testid="tweetText"]');
      const language = textNode?.getAttribute("lang")?.trim() || undefined;
      return { id: match[1], text: text(textNode), language, ...author, element: article };
    }).filter(Boolean);
  }

  async function waitFor(predicate, timeout = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const value = predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 250)); }
    return undefined;
  }

  function enabledSubmitButton() {
    return [...document.querySelectorAll('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]')]
      .find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }

  async function execute(execution, canNavigate = true, pendingStage = "") {
    setState("preparing");
    const failure = (result) => { setState("observing"); return result; };
    const account = verifyAccount();
    if (!account.ok) return failure({ executionId: execution.id, ok: false, code: "ACCOUNT_MISMATCH", message: account.message, retryable: false });
    if (execution.affordance !== "reply" && execution.affordance !== "x.reply") return failure({ executionId: execution.id, ok: false, code: "UNSUPPORTED_AFFORDANCE", message: "This first Chrome route only executes replies.", retryable: false });
    const targetId = execution.target?.id;
    if (!targetId) return failure({ executionId: execution.id, ok: false, code: "MISSING_TARGET", message: "The Bridge execution has no target post.", retryable: false });
    let composer = pendingStage === "reply-composer"
      ? await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000)
      : null;
    let target = composer ? null : visiblePosts().find((post) => post.id === targetId);
    if (!target && canNavigate) {
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "target" }));
      window.location.href = `https://x.com/i/web/status/${encodeURIComponent(targetId)}`;
      return undefined;
    }
    const afterNavigation = await waitFor(() => {
      const result = verifyAccount();
      return result.ok ? result : undefined;
    }, 10_000);
    if (!afterNavigation?.ok) {
      const latest = verifyAccount();
      return failure({ executionId: execution.id, ok: false, code: "ACCOUNT_MISMATCH", message: latest.message, retryable: false });
    }
    setState("acting");
    if (!composer) {
      // X frequently navigates to /compose/post when Reply is clicked. Keep
      // the approved execution in sessionStorage so the new content-script
      // context can finish the same execution instead of leaving it claimed.
      // If X opens the composer in-place, the current context continues below.
      // Either route is removed once the composer is actually available.
      target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 20_000);
      const replyButton = target?.element?.querySelector('[data-testid="reply"]');
      if (!replyButton) return failure({ executionId: execution.id, ok: false, code: "TARGET_NOT_VISIBLE", message: "The target post was not visible in the controlled tab.", retryable: true });
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "reply-composer" }));
      replyButton.click();
      composer = await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000);
    }
    if (!composer) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_NOT_READY", message: "X did not open the reply composer.", retryable: true });
    sessionStorage.removeItem("openpresence-pending-execution");
    const content = window.OpenPresenceExecution?.textForExecution(execution) || "";
    if (!content) return failure({ executionId: execution.id, ok: false, code: "MISSING_PUBLICATION_TEXT", message: "The Bridge execution did not include approved publication text.", retryable: false });
    if (!(await window.OpenPresenceComposer?.fillComposer({ composer, value: content }))) {
      return failure({ executionId: execution.id, ok: false, code: "COMPOSER_INPUT_FAILED", message: "X did not accept the approved reply text or enable the Reply button.", retryable: true });
    }
    const submit = await waitFor(enabledSubmitButton);
    if (!submit) {
      return failure({ executionId: execution.id, ok: false, code: "SUBMIT_NOT_READY", message: "The reply button did not become available after X accepted the reply text.", retryable: true });
    }
    setState("verifying");
    submit.click();
    const ownReply = await waitFor(() => visiblePosts().find((post) => post.text.includes(content) && post.handle?.toLowerCase() === expectedHandle.replace(/^@/, "").toLowerCase()), 12_000);
    if (!ownReply) {
      return failure({ executionId: execution.id, ok: false, code: "RESULT_NOT_VERIFIED", message: "The tab submitted no reply that could be verified as the Presence account.", retryable: false });
    }
    setState("observing");
    return { executionId: execution.id, ok: true, externalRef: { type: "x.reply", id: ownReply.id } };
  }

  function scan() {
    const account = verifyAccount();
    if (!account.ok) { setState("waiting"); return; }
    for (const post of visiblePosts().slice(0, 12)) sendMessage({ type: "OPENPRESENCE_OBSERVATION", observation: { sourceEventId: `x:${post.id}`, externalRef: { type: "x.post", id: post.id }, object: { externalRef: { type: "x.post", id: post.id }, objectType: "post", language: post.language, author: { displayName: post.displayName, handle: post.handle }, content: post.text ? { text: post.text, language: post.language } : undefined, visibility: "public", shareability: "presence-only" } } });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPENPRESENCE_EXECUTE") {
      if (activeExecutionId === message.execution?.id) return;
      activeExecutionId = message.execution?.id || null;
      expectedHandle = message.expectedHandle || expectedHandle;
      presenceName = message.presenceName || presenceName;
      stateLabel();
      void execute(message.execution)
        .then((result) => result ? sendMessage({ type: "OPENPRESENCE_EXECUTION_RESULT", result }) : undefined)
        .finally(() => { activeExecutionId = null; });
    }
    if (message?.type === "OPENPRESENCE_SESSION_CONTEXT") {
      expectedHandle = message.expectedHandle || expectedHandle;
      presenceName = message.presenceName || presenceName;
      stateLabel();
    }
  });
  const pending = sessionStorage.getItem("openpresence-pending-execution");
  if (pending) {
    sessionStorage.removeItem("openpresence-pending-execution");
    try {
      const restored = JSON.parse(pending);
      expectedHandle = restored.expectedHandle || expectedHandle;
      presenceName = restored.presenceName || presenceName;
      activeExecutionId = restored.execution?.id || null;
      void execute(restored.execution, false, restored.stage)
        .then((result) => result ? sendMessage({ type: "OPENPRESENCE_EXECUTION_RESULT", result }) : undefined)
        .finally(() => { activeExecutionId = null; });
    } catch { /* Ignore malformed session state and keep the tab observational. */ }
  }
  setState("observing");
  window.setInterval(scan, 6_000);
  window.setTimeout(scan, 2_000);
})();
