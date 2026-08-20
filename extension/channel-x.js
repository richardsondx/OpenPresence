(function () {
  try {
    const suppressScript = document.createElement("script");
    suppressScript.textContent = `
      try {
        const origEventTargetAdd = typeof EventTarget !== "undefined" && EventTarget.prototype ? EventTarget.prototype.addEventListener : null;
        const origWinAdd = window.addEventListener;
        const internalHandler = (e) => { try { e.stopImmediatePropagation(); e.stopPropagation(); delete e.returnValue; } catch {} };
        if (origEventTargetAdd) { try { origEventTargetAdd.call(window, "beforeunload", internalHandler, true); } catch {} }
        else if (origWinAdd) { try { origWinAdd.call(window, "beforeunload", internalHandler, true); } catch {} }
        if (origEventTargetAdd) {
          EventTarget.prototype.addEventListener = function(t, l, o) {
            if (typeof t === "string" && (t.toLowerCase() === "beforeunload" || t.toLowerCase() === "pagehide")) return;
            return origEventTargetAdd.apply(this, arguments);
          };
        }
        if (origWinAdd) {
          window.addEventListener = function(t, l, o) {
            if (typeof t === "string" && (t.toLowerCase() === "beforeunload" || t.toLowerCase() === "pagehide")) return;
            return origWinAdd.apply(this, arguments);
          };
        }
        try { Object.defineProperty(window, "onbeforeunload", { get: () => null, set: () => {}, configurable: true }); } catch {}
        if (typeof BeforeUnloadEvent !== "undefined" && BeforeUnloadEvent.prototype) {
          try { Object.defineProperty(BeforeUnloadEvent.prototype, "returnValue", { get: () => undefined, set: () => {}, configurable: true }); } catch {}
        }
      } catch {}
    `;
    (document.head || document.documentElement).appendChild(suppressScript);
    suppressScript.remove();
  } catch {}

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
    if (window.location.pathname.includes("/status/")) return;
    metricsInFlight = true;
    const pending = sessionStorage.getItem("openpresence-pending-metrics");
    try {
      if (!isOwnProfile()) {
        // X protects an open composer with a native "Leave site?" dialog.
        // Metrics are observational and must never interrupt an authored or
        // in-flight reply, so leave the tab where it is until the composer is
        // clean.
        if (composerText()) return;
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
        if (pending.returnUrl && pending.returnUrl !== window.location.href && !composerText()) window.location.href = pending.returnUrl;
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
    // X changes its data-testid/aria-label surface between timeline, profile,
    // and reply-composer routes. The left-rail Profile link is stable across
    // those routes and is scoped to the signed-in account, unlike arbitrary
    // author links inside the post being viewed.
    const exactProfileLink = [...document.querySelectorAll('a[href]')].find((link) => {
      try {
        const pathname = new URL(link.href).pathname.replace(/\/$/, "").toLowerCase();
        return pathname === `/${normalized}`;
      } catch { return false; }
    });
    const fallbackObserved = exactProfileLink ? normalized : undefined;
    const actual = visibleHandle || observed || fallbackObserved;
    if (actual && actual === normalized) {
      sessionStorage.setItem("openpresence-last-verified-account", JSON.stringify({ username: actual, verifiedAt: Date.now() }));
      return { ok: true, username: actual };
    }
    if (actual) return { ok: false, username: actual, message: `Account check failed. Expected @${normalized}; the controlled tab is signed in as @${actual}.` };
    try {
      const remembered = JSON.parse(sessionStorage.getItem("openpresence-last-verified-account") || "null");
      if (remembered?.username === normalized && Date.now() - Number(remembered.verifiedAt) < 120_000) {
        return { ok: true, username: normalized, fromRecentVerification: true };
      }
    } catch { /* Ignore malformed transient tab state. */ }
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
    const candidates = [...document.querySelectorAll('[data-testid*="tweetButton"], [data-testid*="postButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline_reply"], [role="button"][data-testid*="tweetButton"]')];
    const fallbackButtons = [...document.querySelectorAll('button, div[role="button"]')].filter((btn) => {
      const label = (btn.getAttribute("aria-label") || btn.innerText || "").trim().toLowerCase();
      return (label === "reply" || label === "post" || label.startsWith("reply to")) && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
    });
    const all = [...candidates, ...fallbackButtons];
    return all.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }

  function composerText() {
    return text(document.querySelector('[data-testid="tweetTextarea_0"]'));
  }

  function submissionError() {
    const candidates = [...document.querySelectorAll('[role="alert"], [data-testid*="toast"], [data-testid*="error"]')]
      .map((node) => text(node))
      .filter(Boolean);
    return candidates.find((message) => /already said|duplicate|not allowed|cannot (?:reply|post)|can't (?:reply|post)|could not (?:send|reply|post)|couldn't (?:send|reply|post)/i.test(message));
  }

  function actionLabel(node) {
    return [node?.getAttribute("aria-label"), node?.getAttribute("data-testid"), text(node)].filter(Boolean).join(" ");
  }

  function reactionButton(article, affordance) {
    if (affordance === "like") return article?.querySelector('[data-testid="like"], [data-testid="unlike"]');
    if (affordance === "repost") return article?.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
    return article?.querySelector('[data-testid="quote"], [data-testid="quoteTweet"], [data-testid="retweet"]');
  }

  function reactionIsActive(button, affordance) {
    const label = actionLabel(button);
    if (affordance === "like") return button?.getAttribute("data-testid") === "unlike" || /unlike|remove like/i.test(label);
    if (affordance === "repost") return button?.getAttribute("data-testid") === "unretweet" || /undo repost|remove repost|unretweet/i.test(label);
    return false;
  }

  async function reportVerifiedAction(execution, target, affordance, externalRef, contentText) {
    await sendMessage({ type: "OPENPRESENCE_OBSERVATION", observation: {
      sourceEventId: `execution:${execution.id}:${affordance}:${externalRef.id}`,
      externalRef,
      object: {
        externalRef,
        parentExternalRef: affordance === "like" || affordance === "repost" ? { type: "x.post", id: target.id } : undefined,
        referencedExternalRefs: affordance === "quote" ? [{ type: "x.post", id: target.id }] : undefined,
        objectType: affordance,
        author: { displayName: presenceName, handle: expectedHandle.replace(/^@/, "") },
        content: contentText ? { text: contentText } : undefined,
        visibility: "public",
        shareability: "presence-only",
        originExecutionId: execution.id,
        occurredAt: new Date().toISOString(),
      },
    }});
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
    const affordance = String(execution.affordance || "").replace(/^x\./, "");
    if (!["reply", "quote", "repost", "like"].includes(affordance)) return failure({ executionId: execution.id, ok: false, code: "UNSUPPORTED_AFFORDANCE", message: `The Chrome Bridge does not execute ${execution.affordance || "this action"}.`, retryable: false });
    const targetId = execution.target?.id;
    if (!targetId) return failure({ executionId: execution.id, ok: false, code: "MISSING_TARGET", message: "The Bridge execution has no target post.", retryable: false });
    let composer = (pendingStage === "composer" || pendingStage === "reply-composer")
      ? await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000)
      : null;
    let target = composer ? null : visiblePosts().find((post) => post.id === targetId);
    if (!target && !composer) {
      target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 15_000);
    }
    if (!target && canNavigate) {
      // A previous X submission can leave the composer mounted while its
      // request is rejected or still settling. Hard navigation here triggers
      // X's native "Leave site?" warning and can strand the next execution.
      // Wait briefly for X to clear it; if it does not, return a bounded,
      // retryable failure instead of navigating through unsaved text.
      const composerReady = await waitFor(() => !composerText(), 3_000);
      if (!composerReady) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_BUSY", message: "X still has an open reply composer; OpenPresence did not navigate away from unsaved text.", retryable: true });
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "target" }));
      try { window.onbeforeunload = null; } catch {}
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
    if (affordance === "like" || affordance === "repost") {
      const button = await waitFor(() => reactionButton(target?.element, affordance), 20_000);
      if (!button) return failure({ executionId: execution.id, ok: false, code: "ACTION_CONTROL_NOT_FOUND", message: `X did not expose the ${affordance} control for the target post.`, retryable: true });
      if (!reactionIsActive(button, affordance)) {
        button.click();
        await waitFor(() => affordance === "repost" ? document.querySelector('[data-testid="retweetConfirm"], [role="menuitem"][data-testid*="retweet"], [role="menuitem"]') : true, 3_000);
        if (affordance === "repost") {
          const confirm = [...document.querySelectorAll('[data-testid="retweetConfirm"], [role="menuitem"]')].find((node) => /repost|retweet/i.test(actionLabel(node)));
          if (confirm) confirm.click();
        }
      }
      const active = await waitFor(() => reactionIsActive(reactionButton(target?.element, affordance), affordance), 10_000);
      if (!active) return failure({ executionId: execution.id, ok: false, code: "ACTION_NOT_VERIFIED", message: `X did not show the ${affordance} control in its completed state.`, retryable: true });
      const externalRef = { type: `x.${affordance}`, id: targetId };
      await reportVerifiedAction(execution, target, affordance, externalRef);
      setState("observing");
      return { executionId: execution.id, ok: true, externalRef };
    }
    if (!composer) {
      // X frequently navigates to /compose/post when Reply is clicked. Keep
      // the approved execution in sessionStorage so the new content-script
      // context can finish the same execution instead of leaving it claimed.
      // If X opens the composer in-place, the current context continues below.
      // Either route is removed once the composer is actually available.
      target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 20_000);
      const composerButton = affordance === "quote"
        ? reactionButton(target?.element, "quote")
        : target?.element?.querySelector('[data-testid="reply"]');
      if (!composerButton) return failure({ executionId: execution.id, ok: false, code: "TARGET_NOT_VISIBLE", message: "The target post was not visible in the controlled tab.", retryable: true });
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "composer" }));
      composerButton.click();
      if (affordance === "quote" && composerButton.getAttribute("data-testid") === "retweet") {
        const quoteChoice = await waitFor(() => [...document.querySelectorAll('[data-testid="quoteTweet"], [role="menuitem"]')].find((node) => /quote/i.test(actionLabel(node))), 5_000);
        if (!quoteChoice) return failure({ executionId: execution.id, ok: false, code: "QUOTE_CONTROL_NOT_FOUND", message: "X did not expose the Quote option for the target post.", retryable: true });
        quoteChoice.click();
      }
      composer = await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000);
    }
    if (!composer) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_NOT_READY", message: "X did not open the reply composer.", retryable: true });
    sessionStorage.removeItem("openpresence-pending-execution");
    const content = window.OpenPresenceExecution?.textForExecution(execution) || "";
    if (!content) return failure({ executionId: execution.id, ok: false, code: "MISSING_PUBLICATION_TEXT", message: "The Bridge execution did not include approved publication text.", retryable: false });
    if (!(await window.OpenPresenceComposer?.fillComposer({ composer, value: content }))) {
      return failure({ executionId: execution.id, ok: false, code: "COMPOSER_INPUT_FAILED", message: "X did not accept the approved reply text or enable the Reply button.", retryable: true });
    }
    const submit = await waitFor(enabledSubmitButton, 12_000);
    if (!submit) {
      return failure({ executionId: execution.id, ok: false, code: "SUBMIT_NOT_READY", message: "The reply button did not become available after X accepted the reply text.", retryable: true });
    }
    setState("acting");
    try { submit.focus(); } catch {}
    submit.click();
    try {
      submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } catch {}
    setState("verifying");
    // The DOM is not the delivery authority: X virtualizes posts and can
    // render a successful reply late (or not in the current view at all).
    // When the composer settles (clears) or the reply appears, return
    // a submission signal and let the server verify the exact public
    // reply through the official X API.
    const submission = await waitFor(() => {
      const ownReply = visiblePosts().find((post) => post.text.includes(content) && post.handle?.toLowerCase() === expectedHandle.replace(/^@/, "").toLowerCase());
      if (ownReply) return { kind: "visible", ownReply };
      const error = submissionError();
      if (error) return { kind: "error", message: error };
      if (!composerText()) return { kind: "settled" };
      return undefined;
    }, 15_000);
    setState("observing");
    if (submission?.kind === "error") {
      const duplicate = /already said|duplicate/i.test(submission.message);
      return failure({
        executionId: execution.id,
        ok: false,
        code: duplicate ? "DUPLICATE_PUBLICATION" : "X_SUBMISSION_REJECTED",
        message: `X rejected the ${affordance}: ${submission.message}`,
        // Replaying an explicit provider rejection can create duplicate or
        // repeated public attempts. Keep it visible for operator review.
        retryable: false,
      });
    }

    // Give X a short settling window for in-flight XHR/fetch completion before closing tab
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    const ownReply = submission?.kind === "visible" ? submission.ownReply : undefined;
    if (submission?.kind === "settled" || ownReply) {
      const externalRef = { type: affordance === "quote" ? "x.post" : "x.reply", id: ownReply ? ownReply.id : targetId };
      if (affordance === "quote" && ownReply) {
        await reportVerifiedAction(execution, target, affordance, externalRef, content);
        return { executionId: execution.id, ok: true, externalRef };
      }
      return { executionId: execution.id, ok: true, verifyWithApi: true, externalRef };
    }

    return failure({ executionId: execution.id, ok: false, code: "PUBLIC_OBJECT_NOT_VISIBLE", message: `X did not show the completed ${affordance} in the controlled tab.`, retryable: true });
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
      void execute(message.execution, !message.dedicatedTab)
        .then((result) => result ? sendMessage({ type: "OPENPRESENCE_EXECUTION_RESULT", result }) : undefined)
        .finally(() => { activeExecutionId = null; });
    }
    if (message?.type === "OPENPRESENCE_SESSION_CONTEXT") {
      expectedHandle = message.expectedHandle || expectedHandle;
      presenceName = message.presenceName || presenceName;
      stateLabel();
      reportAccountIdentity();
    }
    if (message?.type === "OPENPRESENCE_REQUEST_IDENTITY") reportAccountIdentity(message.claimAfterVerification !== false);
    if (message?.type === "OPENPRESENCE_REQUEST_METRICS") void collectMetrics();
  });
  const pendingMetrics = sessionStorage.getItem("openpresence-pending-metrics");
  if (pendingMetrics && !window.location.pathname.includes("/status/")) {
    try {
      const restoredMetrics = JSON.parse(pendingMetrics);
      expectedHandle = restoredMetrics.expectedHandle || expectedHandle;
      presenceName = restoredMetrics.presenceName || presenceName;
    } catch { sessionStorage.removeItem("openpresence-pending-metrics"); }
  }
  if (pendingMetrics && isOwnProfile()) window.setTimeout(() => void collectMetrics(), 1_500);
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
  window.addEventListener("beforeunload", (event) => {
    if (activeExecutionId || sessionStorage.getItem("openpresence-pending-execution")) {
      event.stopImmediatePropagation();
    }
  }, true);
  setState("observing");
  window.setTimeout(reportAccountIdentity, 1_000);
  window.setInterval(scan, 6_000);
  window.setTimeout(scan, 2_000);
})();
