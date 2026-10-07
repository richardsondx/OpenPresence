import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { failInput } from "../lib/bridge";

describe("attachment diagnostics are observed evidence, not invented rejection", () => {
  it.each(["timeout", "notice", "pending", "old-media"])("reports %s without enabling or clicking publish", async scenario => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<section role="dialog"><div contenteditable="true"></div><input type="file"><div id="previews"></div><button data-testid="tweetButton" disabled>Post</button></section><div role="alert">Unrelated private page notice</div>');
      await page.evaluate(mode => {
        const scope = document.querySelector('section')!;
        const previews = document.querySelector('#previews')!;
        const image = '<img data-testid="mediaPreview"><button aria-label="Remove media">Remove</button>';
        if (mode === 'old-media') previews.innerHTML = image;
        document.querySelector('input')!.onchange = () => {
          if (mode === 'notice') previews.innerHTML = '<div role="alert">This file is too large.</div>';
          if (mode === 'pending') previews.innerHTML = image + '<div aria-busy="true">Uploading</div>';
        };
        scope.querySelector('button')!.onclick = () => { throw new Error('Must not submit'); };
      }, scenario);
      await page.addScriptTag({ path: "extension/composer.js" });
      const result = await page.evaluate(async () => {
        const w = window as typeof window & { OpenPresenceComposer: { attachFilesWithEvidence(options: object): Promise<{ok: boolean; diagnostics: unknown}> } };
        return w.OpenPresenceComposer.attachFilesWithEvidence({ files: [new File(['image'], 'approved.png', {type:'image/png'})], composer: document.querySelector('[contenteditable]'), timeoutMs:150 });
      });
      expect(result.ok).toBe(false);
      const parsed = failInput.parse({executorId:'test', code:'ASSET_UPLOAD_FAILED', message:'No submission', retryable:true, diagnostics:result.diagnostics});
      expect(parsed.diagnostics).toMatchObject({expectedFiles:1,beforeSubmission:true,stage:scenario==='old-media'?'composer_existing_media':'attachment_confirmation_timeout'});
      expect(parsed.diagnostics!.alerts).toEqual(scenario==='notice'?['This file is too large.']:[]);
      if (scenario==='pending') expect(parsed.diagnostics!.pendingUploadCount).toBe(1);
    } finally { await browser.close(); }
  });
  it("rejects unbounded notices", () => {
    expect(failInput.safeParse({executorId:'test',message:'No submission',diagnostics:{stage:'timeout',expectedFiles:1,previewCount:0,removeControlCount:0,pendingUploadCount:0,beforeSubmission:true,alerts:['x'.repeat(241)]}}).success).toBe(false);
  });
});
