(function () {
  let sessionState = "observing";
  let expectedHandle = "";
  let presenceName = "Waiting for Presence";
  let activeExecutionId = null;
  let metricsInFlight = false;
  const overlay = document.createElement("div");
  overlay.id = "openpresence-browser-overlay";
  overlay.attachShadow({ mode: "open" }).innerHTML = `<style>:host{all:initial}.wrap{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(213,146,103,.65);border-radius:999px;background:rgba(255,250,246,.96);box-shadow:0 5px 24px rgba(39,25,17,.14);color:#332a25;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mark{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#c77d50;color:#fff;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:#73a879}.text{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label{display:block;color:#766b63;font-size:10px;margin-top:2px}</style><div class="wrap"><span class="mark">◉</span><span class="text"><b id="name">OpenPresence</b><span class="label" id="state">Observing · browser hands ready</span></span><span class="dot"></span></div>`;
  document.documentElement.appendChild(overlay);
  const stateLabel = () => overlay.shadowRoot.getElementById("state").textContent = `${sessionState[0].toUpperCase()}${sessionState.slice(1)} · ${presenceName}`;
  const setState = (value) => { sessionState = value; stateLabel(); };
  const sendMessage = (message) => window.OpenPresenceRuntime?.sendMessage(message) || Promise.resolve(false);
  const text = (node) => node?.innerText?.trim().replace(/\s+/g, " ") || "";

  function parseHumanMetric(raw) {
    const match = String(raw || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)([KMB])?/i);
    if (!match) return undefined;
    const multiplier = match[2]?.toUpperCase() === "K" ? 1_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "B" ? 1_000_000_000 : 1;
    return Math.round(Number(match[1]) * multiplier);
  }

  function metricFromLabels(labels, name) {
    const pattern = new RegExp(`(?:([\\d,.]+(?:[KMB])?)\\s+${name}|${name}\\s*[:·-]?\\s*([\\d,.]+(?:[KMB])?))`, "i");
    for (const label of labels) {
      const match = String(label).match(pattern);
      const value = parseHumanMetric(match?.[1] || match?.[2]);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function profilePath() {
    return `/${expectedHandle.replace(/^@/, "")}`.toLowerCase();
  }

  function isOwnProfile() {
    return window.location.pathname.replace(/\/$/, "").toLowerCase() === profilePath();
  }

  function profileMetric(name) {
    const normalized = expectedHandle.replace(/^@/, "");
    const links = [...document.querySelectorAll("a[href]")].filter((link) => {
      try {
        const parts = new URL(link.href).pathname.split("/").filter(Boolean).map((part) => part.toLowerCase());
        const metricPath = parts.at(-1);
        return parts[0] === normalized.toLowerCase() && (metricPath === name.toLowerCase() || metricPath === `verified_${name.toLowerCase()}`);
      } catch {
        return false;
      }
    });
    const labels = links.flatMap((link) => [link.getAttribute("aria-label"), text(link)]).filter(Boolean);
    return metricFromLabels(labels, name);
  }

  function publicationMetrics() {
    return visiblePosts().flatMap((post) => {
      const article = post.element;
      const labels = [...article.querySelectorAll('button,[role=button],a[href*="/analytics"]')].flatMap((button) => [button.getAttribute("aria-label"), text(button)]).filter(Boolean);
      const metrics = {
        impressions: metricFromLabels(labels, "(?:views|impressions)"),
        likes: metricFromLabels(labels, "likes?"),
        replies: metricFromLabels(labels, "(?:reply|replies)"),
        reposts: metricFromLabels(labels, "(?:reposts?|retweets?)"),
        quotes: metricFromLabels(labels, "quotes?"),
      };
      const observed = Object.fromEntries(Object.entries(metrics).filter(([, value]) => value !== undefined));
      if (!Object.keys(observed).length) return [];
      const time = article.querySelector("time")?.getAttribute("datetime");
      return [{ externalRef: { type: "x.post", id: post.id }, publicationAgeSeconds: time ? Math.max(0, Math.floor((Date.now() - new Date(time).getTime()) / 1000)) : 0, metrics: observed }];
    });
  }

  async function collectMetrics() {
    if (metricsInFlight || activeExecutionId || !expectedHandle) return;
    metricsInFlight = true;
    const pending = sessionStorage.getItem("openpresence-pending-metrics");
    try {
      if (!isOwnProfile()) {
        sessionStorage.setItem("openpresence-pending-metrics", JSON.stringify({ returnUrl: window.location.href, expectedHandle, presenceName }));
        window.location.href = `https://x.com/${encodeURIComponent(expectedHandle.replace(/^@/, ""))}`;
        return;
      }
      const account = await waitFor(() => verifyAccount().ok, 12_000);
      if (!account) return;
      await waitFor(() => profileMetric("followers") !== undefined, 12_000);
      const followers = profileMetric("followers");
      const following = profileMetric("following");
      const publications = publicationMetrics();
      if (followers !== undefined || publications.length) {
        await sendMessage({ type: "OPENPRESENCE_METRICS", metrics: { ...(followers === undefined ? {} : { audience: { followers, following, observedAt: new Date().toISOString() } }), publications } });
      }
    } finally {
      metricsInFlight = false;
      if (pending && isOwnProfile()) {
        sessionStorage.removeItem("openpresence-pending-metrics");
        if (pending.returnUrl && pending.returnUrl !== window.location.href) window.location.href = pending.returnUrl;
      }
    }
  }

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
    const accountLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"], [data-testid="SideNav_AccountSwitcher_Button"] a[href^="/"]');
    let observed;
    try { observed = accountLink ? new URL(accountLink.href).pathname.replace(/^\//, "").split("/")[0].toLowerCase() : undefined; } catch { observed = undefined; }
    const visibleHandle = visible.match(/@([a-z0-9_]{1,30})/i)?.[1]?.toLowerCase();
    const actual = visibleHandle || observed;
    if (actual && actual === normalized) return { ok: true, username: actual };
    if (actual) return { ok: false, username: actual, message: `Account check failed. Expected @${normalized}; the controlled tab is signed in as @${actual}.` };
    return { ok: false, message: `Account check failed. Expected @${normalized}; X has not exposed a verifiable signed-in account.` };
  }

  let lastIdentityReport = "";
  let lastIdentityReportAt = 0;
  function reportAccountIdentity(claimAfterVerification = true) {
    const account = verifyAccount();
    // During an X SPA navigation the account controls may not have mounted
    // yet. Unknown is a loading state, not proof that the wrong account is
    // signed in; preserve the last verified identity until X exposes one.
    if (!account.username) return;
    const identity = account.username || `unknown:${account.message || "unverified"}`;
    if (identity === lastIdentityReport && Date.now() - lastIdentityReportAt < 15_000) return;
    lastIdentityReport = identity;
    lastIdentityReportAt = Date.now();
    sendMessage({ type: "OPENPRESENCE_ACCOUNT_IDENTITY", username: account.username, claimAfterVerification });
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

  function isEnglishPost(post) {
    return typeof post.language === "string" && /^(?:en|eng)(?:-|$)/i.test(post.language.trim());
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
    const account = await waitFor(() => {
      const result = verifyAccount();
      return result.ok || result.username ? result : undefined;
    }, 15_000);
    reportAccountIdentity();
    if (!account?.ok) return failure({ executionId: execution.id, ok: false, code: account?.username ? "ACCOUNT_MISMATCH" : "ACCOUNT_NOT_READY", message: account?.message || `Account check failed. Expected ${expectedHandle}; X did not expose a signed-in account in time.`, retryable: !account?.username });
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
      return result.ok || result.username ? result : undefined;
    }, 15_000);
    if (!afterNavigation?.ok) {
      const latest = verifyAccount();
      return failure({ executionId: execution.id, ok: false, code: latest.username ? "ACCOUNT_MISMATCH" : "ACCOUNT_NOT_READY", message: latest.message, retryable: !latest.username });
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
    reportAccountIdentity();
    const account = verifyAccount();
    if (!account.ok) { setState("waiting"); return; }
    for (const post of visiblePosts().filter(isEnglishPost).slice(0, 12)) sendMessage({ type: "OPENPRESENCE_OBSERVATION", observation: { sourceEventId: `x:${post.id}`, externalRef: { type: "x.post", id: post.id }, object: { externalRef: { type: "x.post", id: post.id }, objectType: "post", language: post.language, author: { displayName: post.displayName, handle: post.handle }, content: post.text ? { text: post.text, language: post.language } : undefined, visibility: "public", shareability: "presence-only" } } });
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
      reportAccountIdentity();
      // The Bridge may deliver session context after the tab has already
      // finished loading. Start a measurement pass here as well as from the
      // background alarm so recovery does not depend on message ordering.
      if (!activeExecutionId) window.setTimeout(() => void collectMetrics(), 750);
    }
    if (message?.type === "OPENPRESENCE_REQUEST_IDENTITY") reportAccountIdentity(message.claimAfterVerification !== false);
    if (message?.type === "OPENPRESENCE_REQUEST_METRICS") void collectMetrics();
  });
  const pendingMetrics = sessionStorage.getItem("openpresence-pending-metrics");
  if (pendingMetrics) {
    try {
      const restoredMetrics = JSON.parse(pendingMetrics);
      expectedHandle = restoredMetrics.expectedHandle || expectedHandle;
      presenceName = restoredMetrics.presenceName || presenceName;
    } catch { sessionStorage.removeItem("openpresence-pending-metrics"); }
  }
  if (pendingMetrics) window.setTimeout(() => void collectMetrics(), 1_500);
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
  window.setTimeout(reportAccountIdentity, 1_000);
  window.setInterval(scan, 6_000);
  window.setTimeout(scan, 2_000);
})();
