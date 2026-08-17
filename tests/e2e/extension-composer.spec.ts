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

test("the Chrome adapter preserves X's confirmed post language in observations", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("http://openpresence.test/", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body></body></html>",
  }));
  await page.goto("http://openpresence.test/");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <nav><a href="/gennyverse">@gennyverse</a></nav>
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
    listeners.forEach((listener) => listener({ type: "OPENPRESENCE_SESSION_CONTEXT", expectedHandle: "@gennyverse", presenceName: "Genny" }));
  });
  await page.waitForTimeout(2_500);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const observation = await page.evaluate(() => (window as typeof window & { __openPresenceMessages: Array<{ type?: string; observation?: { object?: { language?: string } } }> }).__openPresenceMessages.find((message) => message.type === "OPENPRESENCE_OBSERVATION"));
  expect(observation?.observation?.object?.language).toBe("en");
});
