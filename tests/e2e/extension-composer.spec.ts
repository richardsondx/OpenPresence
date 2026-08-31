import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    OpenPresenceComposer: { fillComposer(input: { composer: HTMLElement; value: string }): Promise<boolean> };
    OpenPresenceExecution: { textForExecution(execution: unknown): string };
  }
}

test("the Chrome composer helper waits for controlled submit state", async ({ page }) => {
  await page.setContent(`
    <div data-testid="tweetTextarea_0" contenteditable="true"><div><br></div></div>
    <button data-testid="tweetButtonInline" disabled aria-disabled="true">Reply</button>
  `);
  await page.evaluate(() => {
    const composer = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    const submit = document.querySelector<HTMLButtonElement>('[data-testid="tweetButtonInline"]')!;
    composer.addEventListener("input", () => {
      if ((composer.innerText || "").trim()) {
        submit.disabled = false;
        submit.setAttribute("aria-disabled", "false");
      }
    });
  });
  await page.addScriptTag({ path: "extension/composer.js" });

  const result = await page.evaluate(async () => {
    const composer = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    return window.OpenPresenceComposer.fillComposer({ composer, value: "A controlled reply." });
  });

  expect(result).toBe(true);
  await expect(page.locator('[data-testid="tweetTextarea_0"]')).toHaveText("A controlled reply.");
  await expect(page.locator('[data-testid="tweetButtonInline"]')).toBeEnabled();
  await expect(page.locator('[data-testid="tweetButtonInline"]')).toHaveAttribute("aria-disabled", "false");
});

test("the Chrome adapter reads approved text from the Bridge publication envelope", async ({ page }) => {
  await page.addScriptTag({ path: "extension/execution.js" });
  const text = await page.evaluate(() => window.OpenPresenceExecution.textForExecution({
    publication: {
      payload: { text: "  Approved reply text.  " },
      publicExpression: { text: "Fallback text." },
    },
  }));
  expect(text).toBe("Approved reply text.");
});

test("the Chrome observer preserves quote authorship and nested media ownership", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("http://openpresence.test/home");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article>
      <div data-testid="User-Name"><a href="/martin_casado">Martin</a><a href="/martin_casado">@martin_casado</a></div>
      <a href="/martin_casado/status/2092798389541040280"><time datetime="2026-08-27T00:00:00Z">now</time></a>
      <div data-testid="tweetText" lang="en">Outer commentary.</div>
      <div data-testid="quoteTweet">
        <a href="/edward40e/status/2092381762781659314"><time datetime="2026-08-26T00:00:00Z">yesterday</time></a>
        <div data-testid="User-Name"><a href="/edward40e">Edward</a><a href="/edward40e">@edward40e</a></div>
        <div data-testid="tweetText" lang="en">Quoted project context.</div>
        <img src="https://pbs.twimg.com/media/quoted-demo.jpg" alt="Project demo" />
      </div>
    </article>
  `);
  await page.evaluate(() => {
    const messages: unknown[] = [];
    const listeners: Array<(message: unknown) => void> = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); } } } });
  });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
  });
  await page.waitForTimeout(2_500);
  const observations = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { object?: Record<string, unknown> } }> }).__openPresenceMessages.filter((message) => message.type === "OPENPRESENCE_OBSERVATION").map((message) => message.observation?.object));
  expect(observations).toEqual(expect.arrayContaining([
    expect.objectContaining({ externalRef: { type: "x.post", id: "2092381762781659314" }, author: { displayName: "Edward", handle: "edward40e" }, media: [expect.objectContaining({ sourceUrl: "https://pbs.twimg.com/media/quoted-demo.jpg" })] }),
    expect.objectContaining({ externalRef: { type: "x.post", id: "2092798389541040280" }, referencedExternalRefs: [{ type: "x.post", id: "2092381762781659314" }] }),
  ]));
});

test("the Chrome observer does not resend unchanged visible evidence", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("http://openpresence.test/home");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article>
      <div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div>
      <a href="/builder/status/2093000000000000001"><time datetime="2026-08-27T00:00:00Z">now</time></a>
      <div data-testid="tweetText" lang="en">A stable visible post.</div>
    </article>
  `);
  await page.evaluate(() => {
    const messages: unknown[] = [];
    const listeners: Array<(message: unknown) => void> = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve({ ok: true }); } } } });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
  });
  await page.waitForTimeout(6_500);
  const observations = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { externalRef?: { id?: string } } }> }).__openPresenceMessages.filter((message) => message.type === "OPENPRESENCE_OBSERVATION"));
  expect(observations).toHaveLength(1);
  expect(observations[0]?.observation?.externalRef?.id).toBe("2093000000000000001");
});

test("the Chrome adapter does not navigate away from a dirty X composer", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/reply");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <div data-testid="tweetTextarea_0" contenteditable="true">Unsent reply</div>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/composer.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
    listeners.forEach((listener) => listener({
      type: "OPENPRESENCE_EXECUTE",
      expectedHandle: "@example_agent",
      presenceName: "Genny",
      execution: { id: "execution-dirty-composer", affordance: "x.reply", target: { type: "x.post", id: "missing-target" }, publication: { payload: { text: "A reply that must not navigate." } } },
    }));
  });
  await page.waitForTimeout(3_500);
  expect(await page.url()).toBe("http://openpresence.test/reply");
  const result = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; result?: { code?: string; retryable?: boolean } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_EXECUTION_RESULT")?.result);
  expect(result).toMatchObject({ code: "COMPOSER_BUSY", retryable: true });
});

test("the Chrome adapter leaves a composer untouched when its visible target differs from the approved reply", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/compose/post");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article>
      <a href="/wrong-author/status/wrong-target">Open post</a>
      <div data-testid="User-Name"><a href="/wrong-author">Wrong Author</a><a href="/wrong-author">@wrong-author</a></div>
      <div data-testid="tweetText" lang="en">An unrelated conversation.</div>
    </article>
    <div data-testid="tweetTextarea_0" contenteditable="true"></div>
    <button data-testid="tweetButtonInline" aria-disabled="true" disabled>Reply</button>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
    sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({
      expectedHandle: "@example_agent",
      presenceName: "Genny",
      stage: "composer",
      execution: { id: "execution-wrong-target", affordance: "x.reply", target: { type: "x.post", id: "approved-target" }, publication: { payload: { text: "This must not enter the wrong conversation." } } },
    }));
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/composer.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.waitForTimeout(5_500);
  await expect(page.locator('[data-testid="tweetTextarea_0"]')).toHaveText("");
  const result = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; result?: { code?: string; retryable?: boolean } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_EXECUTION_RESULT")?.result);
  expect(result).toMatchObject({ code: "COMPOSER_TARGET_MISMATCH", retryable: true });
});

test("the Chrome adapter rechecks the approved target after typing and before submit", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("http://openpresence.test/compose/post");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article id="approved"><a href="/author/status/2092800223185703069">Open post</a><div data-testid="User-Name"><a href="/author">Author</a><a href="/author">@author</a></div><div data-testid="tweetText" lang="en">Approved conversation.</div></article>
    <div data-testid="tweetTextarea_0" contenteditable="true"></div>
    <button data-testid="tweetButtonInline" aria-disabled="true" disabled>Reply</button>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); } } } });
    const composer = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    composer.addEventListener("input", () => {
      document.querySelector("#approved")?.remove();
      const button = document.querySelector<HTMLButtonElement>('[data-testid="tweetButtonInline"]')!;
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
    });
    sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({ expectedHandle: "@example_agent", presenceName: "Genny", stage: "composer", execution: { id: "execution-target-changed", affordance: "x.reply", target: { type: "x.post", id: "2092800223185703069" }, publication: { payload: { text: "Do not submit after the target changes." } } } }));
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/composer.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.waitForTimeout(5_500);
  const result = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; result?: { code?: string } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_EXECUTION_RESULT")?.result);
  expect(result).toMatchObject({ code: "COMPOSER_TARGET_CHANGED" });
});

test("the Chrome adapter closes duplicate X submissions instead of retrying them", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/reply");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article>
      <a href="/builder/status/123">Open post</a>
      <div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div>
      <div data-testid="tweetText" lang="en">A target post.</div>
      <button data-testid="reply">Reply</button>
    </article>
    <div data-testid="tweetTextarea_0" contenteditable="true"></div>
    <button data-testid="tweetButtonInline" aria-disabled="false">Reply</button>
  `);
  await page.evaluate(() => {
    const submit = document.querySelector<HTMLButtonElement>('[data-testid="tweetButtonInline"]')!;
    submit.addEventListener("click", () => {
      const alert = document.createElement("div");
      alert.setAttribute("role", "alert");
      alert.textContent = "Whoops! You already said that.";
      document.body.appendChild(alert);
    });
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
    sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({
      expectedHandle: "@example_agent",
      presenceName: "Genny",
      stage: "composer",
      execution: { id: "execution-duplicate", affordance: "x.reply", target: { type: "x.post", id: "123" }, publication: { payload: { text: "A duplicate reply." } } },
    }));
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/composer.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.waitForTimeout(2_500);
  const result = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; result?: { code?: string; retryable?: boolean } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_EXECUTION_RESULT")?.result);
  expect(result).toMatchObject({ code: "DUPLICATE_PUBLICATION", retryable: false });
});

test("the Chrome adapter preserves X's confirmed post language in observations", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/example_agent");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
      <article>
        <a href="/builder/status/123">Open post</a>
        <div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div>
        <div data-testid="tweetText" lang="en">A useful post about building agents.</div>
      </article>
    `;
  });
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
  });
  await page.waitForTimeout(2_500);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const observation = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { object?: { language?: string } } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_OBSERVATION"));
  expect(observation?.observation?.object?.language).toBe("en");
});

test("the Chrome adapter observes X posts when the timeline omits lang metadata", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("http://openpresence.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("http://openpresence.test/example_agent");
  await page.evaluate(() => {
    document.body.innerHTML = `<nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav><article><a href="/builder/status/456">Open post</a><div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div><div data-testid="tweetText">A timeline post without language metadata.</div></article>`;
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); } } } });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
  });
  await page.waitForTimeout(2_500);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const observation = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { externalRef?: { id?: string } } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_OBSERVATION"));
  expect(observation?.observation?.externalRef?.id).toBe("456");
});

test("the Chrome adapter reports X profile and publication metrics", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/example_agent");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a><a href="/example_agent/following">321 Following</a><a href="/example_agent/verified_followers">3 Followers</a></nav>
      <article>
        <a href="/example_agent/status/123">Open post</a>
        <div data-testid="User-Name"><a href="/example_agent">Genny</a><a href="/example_agent">@example_agent</a></div>
        <div data-testid="tweetText" lang="en">A useful post about building agents.</div>
        <time datetime="2026-08-17T00:00:00.000Z"></time>
        <button aria-label="12 Replies. Reply">12</button>
        <button aria-label="4 reposts. Repost">4</button>
        <button aria-label="89 Likes. Like">89</button>
        <a href="/example_agent/status/123/analytics" aria-label="4567 views. View post analytics">4.5K</a>
      </article>
    `;
  });
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_REQUEST_METRICS" }));
  });
  await page.waitForTimeout(750);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const metrics = await page.evaluate(() => {
    const messages = (window as typeof window & {
      __openPresenceMessages: Array<{
        type?: string;
        metrics?: {
          audience?: { followers?: number; following?: number };
          publications?: Array<{ externalRef?: { id?: string }; metrics?: Record<string, number> }>;
        };
      }>;
    }).__openPresenceMessages;
    return messages.find((message) => message.type === "OPENPRESENCE_METRICS");
  });
  expect(metrics?.metrics?.audience).toMatchObject({ followers: 3, following: 321 });
  expect(metrics?.metrics?.publications?.[0]).toMatchObject({ externalRef: { id: "123" }, metrics: { impressions: 4567, likes: 89, replies: 12, reposts: 4 } });
});

test("the Chrome adapter keeps a timeline tab in place while collecting observations", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/home");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">@example_agent</a></nav>
    <article>
      <a href="/builder/status/456">Open post</a>
      <div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div>
      <div data-testid="tweetText" lang="en">A concrete public result from an AI builder.</div>
    </article>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_REQUEST_METRICS" }));
  });
  await page.waitForTimeout(2_500);
  expect(await page.url()).toBe("http://openpresence.test/home");
  const observation = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { externalRef?: { id?: string } } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_OBSERVATION"));
  expect(observation?.observation?.externalRef?.id).toBe("456");
});

test("the controlled tab overlay shows concise Agent connection state", async ({ page }) => {
  await page.setContent("<body></body>");
  await page.evaluate(() => {
    const listeners: Array<(message: unknown) => void> = [];
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown) => void) => listeners.push(listener) },
          sendMessage: () => Promise.resolve(),
        },
      },
    });
    Object.assign(window, { __openPresenceListeners: listeners });
  });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_EXTENSION_STATUS", status: { state: "connected", presenceName: "Genny" } }));
  });
  await expect.poll(() => page.evaluate(() => document.getElementById("openpresence-browser-overlay")?.shadowRoot?.getElementById("state")?.textContent)).toBe("connected · Genny");
  expect(await page.evaluate(() => document.getElementById("openpresence-browser-overlay")?.shadowRoot?.getElementById("state")?.textContent?.includes("browser tab"))).toBe(false);
});

test("an identity probe binds a freshly mounted X tab before verifying its signed-in account", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/home");
  await page.setContent('<nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">Profile</a></nav>');
  await page.evaluate(() => {
    const listeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "test-extension",
          onMessage: { addListener: (listener: (message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void) => listeners.push(listener) },
          sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); },
        },
      },
    });
  });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const state = window as typeof window & {
      __openPresenceListeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void>;
      __openPresenceMessages: unknown[];
    };
    state.__openPresenceMessages.length = 0;
    state.__openPresenceListeners.forEach((listener) => listener({
      type: "OPENPRESENCE_REQUEST_IDENTITY",
      expectedHandle: "@example_agent",
      presenceName: "Genny",
    }, undefined, () => {}));
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & {
    __openPresenceMessages: Array<{ type?: string; username?: string }>;
  }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_ACCOUNT_IDENTITY")?.username)).toBe("example_agent");
});

test("the Chrome adapter never treats a viewed Genny post as the signed-in account", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/example_agent/status/2093173724484653488");
  await page.setContent(`
    <article>
      <a href="/example_agent/status/2093173724484653488">The viewed post</a>
      <div data-testid="User-Name"><a href="/example_agent">Genny</a><a href="/example_agent">@example_agent</a></div>
      <div data-testid="tweetText" lang="en">A post authored by the viewed account.</div>
    </article>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); } } } });
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.evaluate(() => {
    const listeners = (window as typeof window & { __openPresenceListeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void> }).__openPresenceListeners;
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@example_agent", presenceName: "Genny" }));
  });
  await page.waitForTimeout(2_500);
  const messages = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; username?: string }> }).__openPresenceMessages);
  expect(messages.filter((message) => message.type === "OPENPRESENCE_OBSERVATION")).toHaveLength(0);
  expect(messages.filter((message) => message.type === "OPENPRESENCE_ACCOUNT_IDENTITY").every((message) => !message.username)).toBe(true);
});

test("the Chrome adapter rechecks the signed-in account immediately before submit", async ({ page }) => {
  await page.route("http://openpresence.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/compose/post");
  await page.setContent(`
    <nav><a data-testid="AppTabBar_Profile_Link" href="/example_agent">Profile</a></nav>
    <article>
      <a href="/builder/status/2092800223185703069">Open post</a>
      <div data-testid="User-Name"><a href="/builder">Builder</a><a href="/builder">@builder</a></div>
      <div data-testid="tweetText" lang="en">Approved conversation.</div>
    </article>
    <div data-testid="tweetTextarea_0" contenteditable="true"></div>
    <button data-testid="tweetButtonInline" aria-disabled="true" disabled>Reply</button>
  `);
  await page.evaluate(() => {
    const listeners: Array<(message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void> = [];
    const messages: unknown[] = [];
    Object.assign(window, { __openPresenceMessages: messages, __openPresenceListeners: listeners, __submitClicked: false });
    Object.defineProperty(window, "chrome", { configurable: true, value: { runtime: { id: "test-extension", onMessage: { addListener: (listener: (message: unknown, sender?: unknown, sendResponse?: (response: unknown) => void) => void) => listeners.push(listener) }, sendMessage: (message: unknown) => { messages.push(message); return Promise.resolve(); } } } });
    const profile = document.querySelector<HTMLAnchorElement>('[data-testid="AppTabBar_Profile_Link"]')!;
    const composer = document.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!;
    const submit = document.querySelector<HTMLButtonElement>('[data-testid="tweetButtonInline"]')!;
    submit.addEventListener("click", () => { (window as typeof window & { __submitClicked: boolean }).__submitClicked = true; });
    composer.addEventListener("input", () => {
      profile.href = "/poko";
      submit.disabled = false;
      submit.setAttribute("aria-disabled", "false");
    });
    sessionStorage.setItem("openpresence-pending-execution", JSON.stringify({
      expectedHandle: "@example_agent",
      presenceName: "Genny",
      stage: "composer",
      execution: { id: "execution-account-drift", affordance: "x.reply", target: { type: "x.post", id: "2092800223185703069" }, publication: { payload: { text: "This must stay unsent after the account changes." } } },
    }));
  });
  await page.addScriptTag({ path: "extension/execution.js" });
  await page.addScriptTag({ path: "extension/composer.js" });
  await page.addScriptTag({ path: "extension/channel-x.js" });
  await page.waitForTimeout(3_000);
  const result = await page.evaluate(() => {
    const messages = (window as typeof window & { __openPresenceMessages: Array<{ type?: string; result?: { code?: string; retryable?: boolean } }>; __submitClicked: boolean }).__openPresenceMessages;
    return { result: messages.find((message) => message.type === "OPENPRESENCE_EXECUTION_RESULT")?.result, submitClicked: (window as typeof window & { __submitClicked: boolean }).__submitClicked };
  });
  expect(result).toMatchObject({ result: { code: "ACCOUNT_MISMATCH", retryable: false }, submitClicked: false });
  await expect(page.locator('[data-testid="tweetTextarea_0"]')).toHaveText("This must stay unsent after the account changes.");
});
