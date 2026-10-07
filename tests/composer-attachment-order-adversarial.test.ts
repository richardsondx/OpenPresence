import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

describe("real Chromium attachment-before-text ordering in a declared composer world", () => {
  it.each([false, true])("accepts complete attachments with submit disabled and consumed input=%s, then requires text readiness", async clearInput => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<section role="dialog"><div data-testid="tweetTextarea_0" contenteditable="true"></div><input type="file" multiple><div id="previews"></div><button data-testid="tweetButton" disabled aria-disabled="true">Post</button></section>');
      await page.evaluate(clear => {
        const input = document.querySelector<HTMLInputElement>("input")!;
        input.onchange = () => {
          const count = input.files!.length;
          document.querySelector("#previews")!.innerHTML = Array.from({ length: count }, (_, index) => `<img data-testid="mediaPreview-${index}" alt="Declared accepted image ${index}"><button aria-label="Remove media">Remove</button>`).join("");
          if (clear) input.value = "";
        };
        const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
        editor.oninput = () => {
          const ready = editor.innerText === "Exact approved text";
          const button = document.querySelector<HTMLButtonElement>('[data-testid="tweetButton"]')!;
          button.disabled = !ready; button.setAttribute("aria-disabled", String(!ready));
        };
      }, clearInput);
      await page.addScriptTag({ path: "extension/composer.js" });
      const result = await page.evaluate(async () => {
        const runtime = window as typeof window & { OpenPresenceComposer: { attachFiles(options: { files: File[]; composer: HTMLElement; timeoutMs: number }): Promise<boolean>; fillComposer(options: { composer: HTMLElement; value: string }): Promise<boolean> } };
        const composer = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
        const files = [new File([new Uint8Array([1])], "first.png", { type: "image/png" }), new File([new Uint8Array([2])], "second.png", { type: "image/png" })];
        const attached = await runtime.OpenPresenceComposer.attachFiles({ composer, files, timeoutMs: 350 });
        const disabledBeforeText = document.querySelector<HTMLButtonElement>('[data-testid="tweetButton"]')!.disabled;
        const readyAfterText = await runtime.OpenPresenceComposer.fillComposer({ composer, value: "Exact approved text" });
        return { attached, disabledBeforeText, readyAfterText };
      });
      expect(result).toEqual({ attached: true, disabledBeforeText: true, readyAfterText: true });
    } finally { await browser.close(); }
  });
});
