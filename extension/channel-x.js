(function () {
  // beforeunload suppression is installed by suppress-beforeunload.js in the
  // manifest's MAIN/document_start content script. Do not inject inline code:
  // X's CSP correctly blocks it.
  let sessionState = "observing";
  let connectionState = "unknown";
  let expectedHandle = "";
  let presenceName = "Waiting for Presence";
  let activeExecutionId = null;
  let metricsInFlight = false;
  const reportedObservations = new Map();
  const maxReportedObservations = 256;
  const observationScanIntervalMs = 2_000;
  const syncTabTitle = () => {
    const label = String(presenceName || "").trim();
    if (label && label !== "Waiting for Presence" && document.title !== label) document.title = label;
  };
  const overlay = document.createElement("div");
  overlay.id = "openpresence-browser-overlay";
  overlay.attachShadow({ mode: "open" }).innerHTML = `<style>:host{all:initial}.wrap{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(213,146,103,.65);border-radius:999px;background:rgba(255,250,246,.96);box-shadow:0 5px 24px rgba(39,25,17,.14);color:#332a25;font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mark{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#c77d50;color:#fff;font-weight:700}.dot{width:7px;height:7px;border-radius:50%;background:#9b8d82}.text{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.label{display:block;color:#766b63;font-size:10px;margin-top:2px}</style><div class="wrap"><span class="mark">◉</span><span class="text"><b id="name">OpenPresence</b><span class="label" id="state">Checking connection</span></span><span class="dot" id="connection-dot"></span></div>`;
  document.documentElement.appendChild(overlay);
  const stateLabel = () => {
    syncTabTitle();
    const connectionLabels = {
      connected: "connected",
      identity_required: "verify account",
      stale: "Connection stale",
      error: "Connection error",
      stopped: "Agent disconnected",
      disabled: "Chrome hands off",
      unconfigured: "Not connected",
      ready: "Ready to connect",
      unknown: "Checking connection",
    };
    const activityLabels = { waiting: "Account check", preparing: "Preparing", acting: "Delivering", verifying: "Verifying" };
    const connection = connectionLabels[connectionState] || connectionLabels.unknown;
    const activity = sessionState === "observing" ? "" : ` · ${activityLabels[sessionState] || "Working"}`;
    overlay.shadowRoot.getElementById("state").textContent = `${connection}${activity} · ${presenceName}`;
    const dot = overlay.shadowRoot.getElementById("connection-dot");
    dot.style.background = connectionState === "connected" ? "#73a879" : connectionState === "identity_required" || connectionState === "stale" ? "#c99556" : "#9b8d82";
  };
  const setState = (value) => { sessionState = value; stateLabel(); };
  const setConnectionState = (value) => { connectionState = value || "unknown"; stateLabel(); };
  // Keep the channel usable while the unpacked extension is reloading or
  // when execution.js was attached in a different isolated-world context.
  // A missing runtime bridge must not silently suppress account identity,
  // observations, or execution outcomes; the content script still has the
  // normal extension messaging API available as a safe fallback.
  const sendMessage = (message) => {
    if (window.OpenPresenceRuntime?.sendMessage) return window.OpenPresenceRuntime.sendMessage(message);
    try {
      if (!chrome?.runtime?.id) return Promise.resolve(false);
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  };
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
        // Metrics are observational and must not pull a controlled timeline
        // away from the material the Agent is meant to notice. A profile tab
        // reports account/publication metrics; a timeline tab stays put and
        // continues sending visible posts through scan().
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
    // Never infer identity from an arbitrary profile link on the page. A
    // viewed post, quote card, recommendation, or reply target can all link
    // to the Presence's expected handle while the browser is signed in as a
    // different account. Only X's signed-in account surfaces are authoritative.
    const actual = visibleHandle || observed;
    if (actual && actual === normalized) {
      return { ok: true, username: actual };
    }
    if (actual) return { ok: false, username: actual, message: `Account check failed. Expected @${normalized}; the controlled tab is signed in as @${actual}.` };
    return { ok: false, message: `Account check failed. Expected @${normalized}; X has not exposed a verifiable signed-in account.` };
  }

  let lastIdentityReport = "";
  let lastIdentityReportAt = 0;
  let identityReportInFlight = false;
  async function reportAccountIdentity(claimAfterVerification = true) {
    if (identityReportInFlight) return;
    identityReportInFlight = true;
    let account = verifyAccount();
    // X mounts the account menu/profile link after the initial document. Give
    // the page a bounded opportunity to expose it before reporting unknown;
    // otherwise a normal SPA mount is indistinguishable from a bad login.
    if (!account.username && expectedHandle) {
      account = await waitFor(() => {
        const next = verifyAccount();
        return next.username ? next : undefined;
      }, 10_000) || account;
    }
    // During an X SPA navigation the account controls may not have mounted
    // yet. After the bounded probe, report unknown explicitly so the Bridge
    // cannot keep treating an old identity as current while an account switch
    // is in progress.
    try {
      const identity = account.username || `unknown:${account.message || "unverified"}`;
      if (identity === lastIdentityReport && Date.now() - lastIdentityReportAt < 15_000) return;
      lastIdentityReport = identity;
      lastIdentityReportAt = Date.now();
      await sendMessage({ type: "OPENPRESENCE_ACCOUNT_IDENTITY", username: account.username, claimAfterVerification });
    } finally {
      identityReportInFlight = false;
    }
  }

  function visiblePosts() {
    return [...document.querySelectorAll("article")].map((article) => {
      const link = article.querySelector('a[href*="/status/"]');
      const match = link?.href?.match(/status\/(\d+)/);
      if (!match) return null;
      const author = readAuthor(article);
      const textNode = article.querySelector('[data-testid="tweetText"]');
      const language = textNode?.getAttribute("lang")?.trim() || undefined;
      const quoteLink = [...article.querySelectorAll('a[href*="/status/"]')].find((candidate) => {
        const quotedId = candidate.href?.match(/status\/(\d+)/)?.[1];
        return quotedId && quotedId !== match[1];
      });
      const quoteId = quoteLink?.href?.match(/status\/(\d+)/)?.[1];
      const quoteContainer = quoteLink?.closest('[data-testid="quoteTweet"], [role="link"]') || quoteLink?.parentElement;
      const quoteTextNode = quoteContainer?.querySelector?.('[data-testid="tweetText"]');
      const quoteAuthor = quoteContainer ? readAuthor(quoteContainer) : undefined;
      const mediaFrom = (container, excluded) => [...(container?.querySelectorAll?.('img[src], video[src], video[poster]') || [])].flatMap((node) => {
        if (excluded?.contains(node)) return [];
        const playableVideoUrl = node.tagName === "VIDEO" ? (node.currentSrc || node.src) : undefined;
        const sourceUrl = playableVideoUrl || node.src || node.poster;
        if (!sourceUrl || /profile_images|emoji/i.test(sourceUrl)) return [];
        return [{ sourceUrl, kind: playableVideoUrl ? "video" : "image", altText: node.getAttribute("alt") || (node.tagName === "VIDEO" ? "Video preview" : undefined) }];
      }).slice(0, 4);
      const quotedPost = quoteId ? {
        id: quoteId,
        text: text(quoteTextNode),
        language: quoteTextNode?.getAttribute("lang")?.trim() || undefined,
        ...(quoteAuthor || {}),
        media: mediaFrom(quoteContainer),
      } : undefined;
      return { id: match[1], text: text(textNode), language, ...author, media: mediaFrom(article, quoteContainer), quotedPost, element: article };
    }).filter(Boolean);
  }

  function isEnglishPost(post) {
    // X often omits `lang` from timeline tweetText nodes. Unknown language is
    // not proof of non-English content: sending the observation lets the
    // server's Presence language policy decide, while filtering unknown posts
    // here silently produced zero Bridge observations on real X timelines.
    return !post.language || /^(?:en|eng)(?:-|$)/i.test(post.language.trim());
  }

  async function waitFor(predicate, timeout = 8_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const value = predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 250)); }
    return undefined;
  }

  // Human-like interaction delay. X and Google detect automation partly
  // through interaction patterns: instant clicks with zero delay between
  // actions are a strong automation signal. A real user takes 200-800ms
  // to move their cursor and click between elements. We add a randomized
  // delay to each interaction step to make the pattern look natural.
  async function humanDelay(min = 250, max = 800) {
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Simulate a more natural click: hover, brief pause, then click.
  // This mirrors how a real user interacts with the page.
  async function humanClick(element) {
    if (!element) return;
    // X's React controls ignore synthetic mouse sequences in several
    // composer/menu surfaces. The DOM click is the reliable control event;
    // the bounded delay still keeps the action from becoming a zero-time
    // burst without pretending that untrusted events are user input.
    element.click();
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
    const candidates = [...document.querySelectorAll('[role="alert"], [role="status"], [data-testid*="toast"], [data-testid*="error"]')]
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
    const accountFailure = (result) => ({ executionId: execution.id, ok: false, code: result?.username ? "ACCOUNT_MISMATCH" : "ACCOUNT_NOT_READY", message: result?.message || `Account check failed. Expected ${expectedHandle}; X did not expose a signed-in account in time.`, retryable: !result?.username });
    const account = await waitFor(() => {
      const result = verifyAccount();
      return result.ok || result.username ? result : undefined;
    }, 15_000);
    reportAccountIdentity();
    if (!account?.ok) return failure(accountFailure(account));
    const affordance = String(execution.affordance || "").replace(/^x\./, "");
    if (!["post", "reply", "quote", "repost", "like", "follow", "delete"].includes(affordance)) return failure({ executionId: execution.id, ok: false, code: "UNSUPPORTED_AFFORDANCE", message: `The Chrome Bridge does not execute ${execution.affordance || "this action"}.`, retryable: false });
    const targetId = execution.target?.id;
    if (affordance !== "post" && !targetId) return failure({ executionId: execution.id, ok: false, code: "MISSING_TARGET", message: affordance === "follow" ? "The Bridge follow execution has no target user." : "The Bridge execution has no target post.", retryable: false });
    if (affordance === "follow") {
      if (!window.location.pathname.includes("/i/user/") && canNavigate) {
        sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "follow" }));
        window.location.href = `https://x.com/i/user/${encodeURIComponent(targetId)}`;
        return undefined;
      }
      const followAccount = await waitFor(() => {
        const result = verifyAccount();
        return result.ok || result.username ? result : undefined;
      }, 15_000);
      if (!followAccount?.ok) return failure(accountFailure(followAccount));
      const followButton = await waitFor(() => [...document.querySelectorAll('button,[role="button"]')].find((node) => {
        const label = actionLabel(node).toLowerCase();
        return /(^|\b)follow(\b|$)/i.test(label) && !/following|unfollow/i.test(label) && node.getAttribute("aria-disabled") !== "true";
      }), 20_000);
      if (!followButton) return failure({ executionId: execution.id, ok: false, code: "FOLLOW_CONTROL_NOT_FOUND", message: "X did not expose a Follow control for the target user.", retryable: true });
      await humanDelay(300, 800);
      await humanClick(followButton);
      const followed = await waitFor(() => [...document.querySelectorAll('button,[role="button"]')].some((node) => /following|unfollow/i.test(actionLabel(node))), 10_000);
      if (!followed) return failure({ executionId: execution.id, ok: false, code: "FOLLOW_NOT_VERIFIED", message: "X did not show the target user as followed.", retryable: true });
      const externalRef = { type: "x.user", id: targetId };
      await reportVerifiedAction(execution, { id: targetId }, affordance, externalRef);
      setState("observing");
      return { executionId: execution.id, ok: true, externalRef };
    }
    // X may open a fresh /compose/post tab for Quote/Reply. That new tab does
    // not inherit the target tab's sessionStorage stage, but its URL is an
    // authoritative indication that the approved composer is already open.
    // Recognize both signals so a claimed execution is never stranded in a
    // dedicated composer tab after the Bridge rebinds it.
    const composerUrl = window.location.pathname.includes("/compose/post");
    const mountedComposer = document.querySelector('[data-testid="tweetTextarea_0"]');
    let composer = (pendingStage === "composer" || pendingStage === "reply-composer" || composerUrl || mountedComposer)
      ? await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000)
      : null;
    // A mounted composer is not proof that it belongs to this execution. X
    // can leave a reply composer open while another Bridge execution is
    // claimed, or open a generic /compose/post tab with no target identity in
    // its URL. Resolve the approved target from the visible conversation
    // before writing any reply/quote text; otherwise fail closed.
    let target = affordance === "post" ? null : visiblePosts().find((post) => post.id === targetId);
    if (!target && !composer) {
      target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 15_000);
    }
    if (composer && affordance !== "post" && !target) {
      if (composerText()) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_BUSY", message: "X still has an open reply composer; OpenPresence left its unsaved text untouched.", retryable: true });
      target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 5_000);
      if (!target) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_TARGET_MISMATCH", message: "The open X composer did not show the approved target post. OpenPresence left it untouched.", retryable: true });
    }
    if (affordance === "post" && !composer && canNavigate) {
      sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ execution, expectedHandle, presenceName, stage: "composer" }));
      window.location.href = "https://x.com/compose/post";
      return undefined;
    }
    if (affordance !== "post" && !target && canNavigate) {
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
      return failure(accountFailure(latest));
    }
    if (affordance === "delete" && !target) target = await waitFor(() => visiblePosts().find((post) => post.id === targetId), 12_000);
    setState("acting");
    if (affordance === "delete") {
      if (!target || target.handle?.replace(/^@/, "").toLowerCase() !== expectedHandle.replace(/^@/, "").toLowerCase()) {
        return failure({ executionId: execution.id, ok: false, code: "TARGET_NOT_OWNED", message: "The target post is not authored by the expected Presence account. OpenPresence did not open its deletion controls.", retryable: false });
      }
      const moreButton = await waitFor(() => target.element?.querySelector('[data-testid="caret"], button[aria-label*="More"], div[role="button"][aria-label*="More"]'), 12_000);
      if (!moreButton) return failure({ executionId: execution.id, ok: false, code: "DELETE_CONTROL_NOT_FOUND", message: "X did not expose the More menu for this own post or reply.", retryable: true });
      await humanDelay(300, 800);
      await humanClick(moreButton);
      const deleteItem = await waitFor(() => [...document.querySelectorAll('[role="menuitem"], button')].find((node) => /^delete(?: post| tweet)?$/i.test(actionLabel(node))), 5_000);
      if (!deleteItem) return failure({ executionId: execution.id, ok: false, code: "DELETE_CONTROL_NOT_FOUND", message: "X did not expose a Delete option for this own post or reply.", retryable: true });
      await humanDelay(200, 500);
      await humanClick(deleteItem);
      const confirmDelete = await waitFor(() => [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="button"], button')].find((node) => /^delete(?: post| tweet)?$/i.test(actionLabel(node))), 5_000);
      if (!confirmDelete) return failure({ executionId: execution.id, ok: false, code: "DELETE_CONFIRMATION_NOT_FOUND", message: "X did not expose the deletion confirmation control. OpenPresence left the post untouched.", retryable: true });
      await humanDelay(200, 500);
      await humanClick(confirmDelete);
      const disappeared = await waitFor(() => !visiblePosts().some((post) => post.id === targetId) || [...document.querySelectorAll('[role="alert"], [role="status"], [data-testid*="toast"]')].some((node) => /deleted/i.test(text(node))), 12_000);
      if (!disappeared) return failure({ executionId: execution.id, ok: false, code: "DELETE_NOT_VERIFIED", message: "X did not show that the post was deleted. OpenPresence is waiting for API verification and will not count this yet.", retryable: true });
      setState("observing");
      return { executionId: execution.id, ok: true, verifyWithApi: true, externalRef: { type: "x.post", id: targetId } };
    }
    if (affordance === "like" || affordance === "repost") {
      const button = await waitFor(() => reactionButton(target?.element, affordance), 20_000);
      if (!button) return failure({ executionId: execution.id, ok: false, code: "ACTION_CONTROL_NOT_FOUND", message: `X did not expose the ${affordance} control for the target post.`, retryable: true });
      if (!reactionIsActive(button, affordance)) {
        await humanDelay(300, 800);
        await humanClick(button);
        await waitFor(() => affordance === "repost" ? document.querySelector('[data-testid="retweetConfirm"], [role="menuitem"][data-testid*="retweet"], [role="menuitem"]') : true, 3_000);
        if (affordance === "repost") {
          const confirm = [...document.querySelectorAll('[data-testid="retweetConfirm"], [role="menuitem"]')].find((node) => /repost|retweet/i.test(actionLabel(node)));
          if (confirm) {
            await humanDelay(200, 500);
            await humanClick(confirm);
            if (document.querySelector('[data-testid="retweetConfirm"], [role="menuitem"]')) confirm.click();
          }
        }
      }
      const active = await waitFor(() => reactionIsActive(reactionButton(target?.element, affordance), affordance), 10_000);
      if (!active) return failure({ executionId: execution.id, ok: false, code: "ACTION_NOT_VERIFIED", message: `X did not show the ${affordance} control in its completed state.`, retryable: true });
      const externalRef = { type: `x.${affordance}`, id: targetId };
      await reportVerifiedAction(execution, target, affordance, externalRef);
      setState("observing");
      return { executionId: execution.id, ok: true, externalRef };
    }
    if (!composer && affordance !== "post") {
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
      await humanDelay(300, 700);
      await humanClick(composerButton);
      if (affordance === "quote" && composerButton.getAttribute("data-testid") === "retweet") {
        const quoteChoice = await waitFor(() => [...document.querySelectorAll('[data-testid="quoteTweet"], [role="menuitem"]')].find((node) => /quote/i.test(actionLabel(node))), 5_000);
        if (!quoteChoice) return failure({ executionId: execution.id, ok: false, code: "QUOTE_CONTROL_NOT_FOUND", message: "X did not expose the Quote option for the target post.", retryable: true });
        await humanDelay(200, 500);
        await humanClick(quoteChoice);
        if (!document.querySelector('[data-testid="tweetTextarea_0"]')) quoteChoice.click();
      }
      composer = await waitFor(() => document.querySelector('[data-testid="tweetTextarea_0"]'), 20_000);
    }
    if (!composer) return failure({ executionId: execution.id, ok: false, code: "COMPOSER_NOT_READY", message: `X did not open the ${affordance === "post" ? "post" : "reply"} composer.`, retryable: true });
    sessionStorage.removeItem("openpresence-pending-execution");
    const content = window.OpenPresenceExecution?.textForExecution(execution) || "";
    if (!content) return failure({ executionId: execution.id, ok: false, code: "MISSING_PUBLICATION_TEXT", message: "The Bridge execution did not include approved publication text.", retryable: false });
    if (!(await window.OpenPresenceComposer?.fillComposer({ composer, value: content }))) {
      return failure({ executionId: execution.id, ok: false, code: "COMPOSER_INPUT_FAILED", message: `X did not accept the approved ${affordance === "post" ? "post" : "reply"} text or enable the submit button.`, retryable: true });
    }
    // Account switching can happen while an X composer is open. A positive
    // check at execution start is not sufficient authority for the final
    // public click; re-check the signed-in account after text entry and before
    // submitting any post, reply, or quote.
    const beforeSubmitAccount = verifyAccount();
    if (!beforeSubmitAccount.ok) return failure(accountFailure(beforeSubmitAccount));
    // Re-check after text entry and immediately before submit. X is a live SPA:
    // the conversation can be replaced or remounted between the first target
    // check and the final click. A target that disappears at this point must
    // leave the authored text unsubmitted.
    if (affordance !== "post" && !visiblePosts().some((post) => post.id === targetId)) {
      return failure({ executionId: execution.id, ok: false, code: "COMPOSER_TARGET_CHANGED", message: "The approved target post changed or disappeared before submission. OpenPresence did not click Reply.", retryable: true });
    }
    const submit = await waitFor(enabledSubmitButton, 12_000);
    if (!submit) {
      return failure({ executionId: execution.id, ok: false, code: "SUBMIT_NOT_READY", message: "The reply button did not become available after X accepted the reply text.", retryable: true });
    }
    setState("acting");
    await humanDelay(500, 1200);
    try { submit.focus(); } catch {}
    try {
      submit.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      await humanDelay(100, 300);
      submit.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await humanDelay(50, 150);
      submit.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } catch {
      submit.click();
    }
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
      if (affordance === "post" && !ownReply) return failure({ executionId: execution.id, ok: false, code: "PUBLIC_OBJECT_NOT_VISIBLE", message: "X accepted the composer, but the new original post was not visible for verification.", retryable: true });
      const externalRef = { type: affordance === "quote" || affordance === "post" ? "x.post" : "x.reply", id: ownReply ? ownReply.id : targetId };
      if ((affordance === "quote" || affordance === "post") && ownReply) {
        await reportVerifiedAction(execution, target, affordance, externalRef, content);
        return { executionId: execution.id, ok: true, externalRef };
      }
      return { executionId: execution.id, ok: true, verifyWithApi: true, externalRef };
    }

    return failure({ executionId: execution.id, ok: false, code: "PUBLIC_OBJECT_NOT_VISIBLE", message: `X did not show the completed ${affordance} in the controlled tab.`, retryable: true });
  }

  function reportObservation(sourceEventId, object) {
    const fingerprint = JSON.stringify(object);
    if (reportedObservations.get(sourceEventId) === fingerprint) return;
    reportedObservations.delete(sourceEventId);
    reportedObservations.set(sourceEventId, fingerprint);
    while (reportedObservations.size > maxReportedObservations) reportedObservations.delete(reportedObservations.keys().next().value);
    void sendMessage({ type: "OPENPRESENCE_OBSERVATION", observation: { sourceEventId, externalRef: object.externalRef, object } }).then((result) => {
      // Keep the observation eligible for the next scan when the extension or
      // app was temporarily unavailable. A successful send remains quiet on
      // subsequent scans until the visible evidence actually changes.
      if (result === false && reportedObservations.get(sourceEventId) === fingerprint) reportedObservations.delete(sourceEventId);
    }).catch(() => {
      if (reportedObservations.get(sourceEventId) === fingerprint) reportedObservations.delete(sourceEventId);
    });
  }

  function scan() {
    reportAccountIdentity();
    const account = verifyAccount();
    if (!account.ok) { setState("waiting"); return; }
    for (const post of visiblePosts().filter(isEnglishPost).slice(0, 12)) {
      if (post.quotedPost && isEnglishPost(post.quotedPost)) {
        reportObservation(`x:${post.quotedPost.id}`, { externalRef: { type: "x.post", id: post.quotedPost.id }, objectType: "post", language: post.quotedPost.language, author: { displayName: post.quotedPost.displayName, handle: post.quotedPost.handle }, content: post.quotedPost.text ? { text: post.quotedPost.text, language: post.quotedPost.language } : undefined, media: post.quotedPost.media, visibility: "public", shareability: "presence-only" });
      }
      reportObservation(`x:${post.id}`, { externalRef: { type: "x.post", id: post.id }, referencedExternalRefs: post.quotedPost ? [{ type: "x.post", id: post.quotedPost.id }] : undefined, objectType: "post", language: post.language, author: { displayName: post.displayName, handle: post.handle }, content: post.text ? { text: post.text, language: post.language } : undefined, media: post.media, visibility: "public", shareability: "presence-only" });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "OPENPRESENCE_EXTENSION_STATUS") {
      presenceName = message.status?.presenceName || presenceName;
      setConnectionState(message.status?.state);
    }
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
    if (message?.type === "OPENPRESENCE_REQUEST_IDENTITY") {
      // A newly mounted X tab may receive an identity probe before the
      // session-context message reaches it (or after the service worker has
      // recovered a different tab in the controlled window). Carry the
      // Presence binding on the probe itself so this tab can verify the
      // visible account instead of truthfully reporting an avoidable
      // "unknown" identity.
      expectedHandle = message.expectedHandle || expectedHandle;
      presenceName = message.presenceName || presenceName;
      stateLabel();
      void reportAccountIdentity(message.claimAfterVerification !== false);
      sendResponse({ ok: true });
    }
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
  // A session-context message may have been sent before this script mounted.
  // Announce readiness so the background binds this actual X tab reliably.
  void sendMessage({ type: "OPENPRESENCE_CHANNEL_READY" });
  window.setTimeout(reportAccountIdentity, 1_000);
  // X's SPA rewrites document.title during navigation. Re-apply the durable
  // Presence identity so controlled tabs remain distinguishable after every
  // target/composer transition.
  window.setInterval(syncTabTitle, 1_000);
  window.setInterval(scan, observationScanIntervalMs);
  window.setTimeout(scan, 2_000);
})();
