/* eslint-disable @typescript-eslint/no-explicit-any -- this file executes the extension's browser scripts in a deliberately dynamic DOM vm harness. */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type TestEventListener = (event: { type: string }) => void;

describe("Chrome extension composer and execution helpers", () => {
  let mockWindow: any;
  let mockDoc: any;
  let elements: any[];

  beforeEach(() => {
    elements = [];
    mockDoc = {
      querySelectorAll(selector: string) {
        return elements.filter((el) => {
          if (selector.includes('input[type="file"]') && el.tagName === "INPUT" && el.getAttribute("type") === "file") return true;
          if (selector.includes(el.getAttribute("data-testid"))) return true;
          return false;
        });
      },
      querySelector(selector: string) {
        return this.querySelectorAll(selector)[0] || null;
      },
      execCommand(command: string, _showUI?: boolean, value?: string) {
        return true;
      },
      createRange() {
        return {
          selectNodeContents() {},
        };
      },
      documentElement: {
        contains() { return true; },
      },
    };

    mockWindow = {
      document: mockDoc,
      getSelection() {
        return {
          removeAllRanges() {},
          addRange() {},
        };
      },
      InputEvent: class InputEvent {
        type: string;
        inputType?: string;
        data?: string;
        constructor(type: string, init?: any) {
          this.type = type;
          this.inputType = init?.inputType;
          this.data = init?.data;
        }
      },
      Event: class Event {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      },
      ClipboardEvent: class ClipboardEvent {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      },
      DataTransfer: class DataTransfer {
        data: Record<string, string> = {};
        files: unknown[] = [];
        items = { add: (file: unknown) => { this.files.push(file); } };
        setData(key: string, val: string) { this.data[key] = val; }
      },
      File: class File {
        name: string;
        type: string;
        constructor(_parts: unknown[], name: string, options: { type?: string } = {}) { this.name = name; this.type = options.type || ""; }
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };
    mockWindow.chrome = { runtime: { id: "test-extension", sendMessage: vi.fn() } };

    const executionCode = readFileSync(join(process.cwd(), "extension/execution.js"), "utf8");
    const composerCode = readFileSync(join(process.cwd(), "extension/composer.js"), "utf8");
    new Function("window", "root", executionCode)(mockWindow, mockWindow);
    new Function("window", "root", composerCode)(mockWindow, mockWindow);
  });

  function createElement(tag: string, attrs: Record<string, string> = {}) {
    const listeners: Record<string, TestEventListener[]> = {};
    const el: any = {
      tagName: tag.toUpperCase(),
      isConnected: true,
      innerText: "",
      disabled: false,
      attributes: { ...attrs },
      getAttribute(name: string) { return this.attributes[name] ?? null; },
      setAttribute(name: string, val: string) { this.attributes[name] = val; },
      addEventListener(event: string, fn: TestEventListener) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      dispatchEvent(event: any) {
        (listeners[event.type] || []).forEach((fn: TestEventListener) => fn(event));
      },
      focus() {},
      click() {},
    };
    elements.push(el);
    return el;
  }

  it("extracts approved text from execution publications and normalizes whitespace", () => {
    expect(mockWindow.OpenPresenceExecution.textForExecution({
      publication: { payload: { text: "  Excel. Still the fastest route.  " } },
    })).toBe("Excel. Still the fastest route.");

    expect(mockWindow.OpenPresenceExecution.textForExecution({
      publication: { publicExpression: { text: "  Fallback text.  " } },
    })).toBe("Fallback text.");

    expect(mockWindow.OpenPresenceExecution.textForExecution(null)).toBe("");
  });

  it("retrieves only the exact authorized image asset IDs from the Bridge", async () => {
    mockWindow.chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      asset: { assetId: "asset-1", mimeType: "image/png", name: "asset-1.png", data: Buffer.from("png-bytes").toString("base64") },
    });
    const assets = await mockWindow.OpenPresenceExecution.assetsForExecution({ id: "approved-execution", publication: { assetIds: ["asset-1", "asset-1"] } });
    expect(mockWindow.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockWindow.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "OPENPRESENCE_FETCH_ASSET", assetId: "asset-1", executionId: "approved-execution" });
    expect(assets).toHaveLength(1);
    expect(assets[0].assetId).toBe("asset-1");
    expect(assets[0].file).toMatchObject({ name: "asset-1.png", type: "image/png" });
  });

  it("fails closed when the Bridge returns an unsupported image format", async () => {
    mockWindow.chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      asset: { assetId: "asset-1", mimeType: "image/webp", name: "asset-1.webp", data: Buffer.from("webp-bytes").toString("base64") },
    });
    await expect(mockWindow.OpenPresenceExecution.assetsForExecution({ id: "approved-execution", publication: { assetIds: ["asset-1"] } })).rejects.toThrow("cannot upload image/webp");
  });

  it("reports a stale or disconnected extension with a concrete recovery action", async () => {
    mockWindow.chrome.runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(mockWindow.OpenPresenceExecution.assetsForExecution({ id: "approved-execution", publication: { assetIds: ["asset-1"] } })).rejects.toThrow("Reload the OpenPresence extension");
    mockWindow.chrome.runtime.sendMessage.mockRejectedValue(new Error("Extension context invalidated"));
    await expect(mockWindow.OpenPresenceExecution.assetsForExecution({ id: "approved-execution", publication: { assetIds: ["asset-1"] } })).rejects.toThrow("Extension context invalidated");
  });

  it("sets the X media input before any public submit", async () => {
    const scope = createElement("form");
    scope.matches = (selector: string) => selector.includes("form");
    const input = createElement("input", { type: "file" });
    const preview = createElement("div", { "data-testid": "mediaPreview-0" });
    const remove = createElement("button", { "aria-label": "Remove image" });
    const submit = createElement("button", { "data-testid": "tweetButton" });
    submit.matches = (selector: string) => selector.includes("tweetButton");
    scope.querySelector = (selector: string) => selector.includes('input[type="file"]') ? input : null;
    scope.querySelectorAll = (selector: string) => selector.includes('input[type="file"]') ? [input] : !input.files?.length ? [] : selector.includes("mediaPreview") ? [preview] : selector.includes("Remove image") ? [remove] : selector.includes("button") ? [submit] : [];
    const composer = createElement("div", { "data-testid": "tweetTextarea_0" });
    composer.parentElement = scope;
    const file = new mockWindow.File([new Uint8Array([1, 2, 3])], "asset.png", { type: "image/png" });
    const result = await mockWindow.OpenPresenceComposer.attachFiles({ composer, files: [file] });
    expect(result).toBe(true);
    expect(input.files).toHaveLength(1);
    expect(input.files[0]).toBe(file);
  });

  it("rejects nested preview nodes when X exposes fewer per-file controls than requested", async () => {
    const scope = createElement("form");
    scope.matches = (selector: string) => selector.includes("form");
    const input = createElement("input", { type: "file" });
    const previewWrapper = createElement("div", { "data-testid": "mediaPreview-0" });
    const previewChild = createElement("img", { "data-testid": "mediaPreview-image" });
    const remove = createElement("button", { "aria-label": "Remove image" });
    const submit = createElement("button", { "data-testid": "tweetButton" });
    submit.matches = (selector: string) => selector.includes("tweetButton");
    scope.querySelector = (selector: string) => selector.includes('input[type="file"]') ? input : null;
    scope.querySelectorAll = (selector: string) => selector.includes('input[type="file"]') ? [input] : !input.files?.length ? [] : selector.includes("mediaPreview") ? [previewWrapper, previewChild] : selector.includes("Remove image") ? [remove] : selector.includes("button") ? [submit] : [];
    const composer = createElement("div", { "data-testid": "tweetTextarea_0" });
    composer.parentElement = scope;
    const files = [
      new mockWindow.File([new Uint8Array([1])], "asset-1.png", { type: "image/png" }),
      new mockWindow.File([new Uint8Array([2])], "asset-2.png", { type: "image/png" }),
    ];
    await expect(mockWindow.OpenPresenceComposer.attachFiles({ composer, files, timeoutMs: 20 })).resolves.toBe(false);
  });

  it("successfully fills the composer when text contains newlines or extra spaces", async () => {
    const composer = createElement("div", { "data-testid": "tweetTextarea_0" });
    const submit = createElement("button", { "data-testid": "tweetButton", "aria-disabled": "true" });
    submit.disabled = true;

    composer.addEventListener("input", () => {
      submit.disabled = false;
      submit.setAttribute("aria-disabled", "false");
    });

    mockDoc.execCommand = (command: string, _showUI?: boolean, value?: string) => {
      if (command === "insertText" && value) {
        composer.innerText = value;
        composer.dispatchEvent(new mockWindow.InputEvent("input", { inputType: "insertText", data: value }));
        return true;
      }
      if (command === "delete") {
        composer.innerText = "";
        return true;
      }
      return true;
    };

    const approvedText = "Excel.\n\nStill the fastest route from messy data to a decision—right up until someone emails around twelve versions of the spreadsheet.";

    const result = await mockWindow.OpenPresenceComposer.fillComposer({
      composer,
      value: approvedText,
    });

    expect(result).toBe(true);
    expect(composer.innerText).toContain("Still the fastest route");
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute("aria-disabled")).toBe("false");
  });

  it("clears prior dirty text in the composer before inserting approved text", async () => {
    const composer = createElement("div", { "data-testid": "tweetTextarea_0" });
    composer.innerText = "Stale draft text left in the composer";

    const submit = createElement("button", { "data-testid": "tweetButtonInline_reply", "aria-disabled": "true" });
    submit.disabled = true;

    composer.addEventListener("input", () => {
      if (composer.innerText.includes("Approved reply")) {
        submit.disabled = false;
        submit.setAttribute("aria-disabled", "false");
      }
    });

    mockDoc.execCommand = (command: string, _showUI?: boolean, value?: string) => {
      if (command === "insertText" && value) {
        composer.innerText = value;
        composer.dispatchEvent(new mockWindow.InputEvent("input", { inputType: "insertText", data: value }));
        return true;
      }
      if (command === "delete") {
        composer.innerText = "";
        return true;
      }
      return true;
    };

    const result = await mockWindow.OpenPresenceComposer.fillComposer({
      composer,
      value: "Approved reply.",
      submitSelector: "[data-testid=\"tweetButtonInline_reply\"]",
    });

    expect(result).toBe(true);
    expect(composer.innerText).toBe("Approved reply.");
    expect(submit.disabled).toBe(false);
  });

  it("suppresses beforeunload listeners and onbeforeunload assignments", () => {
    const testWindow: any = {
      listeners: {} as Record<string, TestEventListener[]>,
      addEventListener(event: string, fn: TestEventListener) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(fn);
      },
      dispatchEvent(event: any) {
        (this.listeners[event.type] || []).forEach((fn: TestEventListener) => fn(event));
      },
    };

    const suppressCode = readFileSync(join(process.cwd(), "extension/suppress-beforeunload.js"), "utf8");
    new Function("window", "EventTarget", suppressCode)(testWindow, { prototype: testWindow });

    // Attempting to add a beforeunload handler via addEventListener should be ignored
    testWindow.addEventListener("beforeunload", () => {
      throw new Error("Should not be called");
    });

    // onbeforeunload assignments should be ignored
    testWindow.onbeforeunload = () => "Leave site?";
    expect(testWindow.onbeforeunload).toBe(null);

    // Dispatching a beforeunload event should stop immediate propagation and remove returnValue
    let stopped = false;
    const event = {
      type: "beforeunload",
      returnValue: "Changes you made may not be saved.",
      stopImmediatePropagation() { stopped = true; },
      stopPropagation() {},
    };
    testWindow.dispatchEvent(event);
    expect(stopped).toBe(true);
    expect(event.returnValue).toBeUndefined();
  });

  it("manifest.json includes suppress-beforeunload in MAIN world at document_start", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "extension/manifest.json"), "utf8"));
    const suppressScriptEntry = manifest.content_scripts?.find((entry: any) =>
      entry.js?.includes("suppress-beforeunload.js")
    );
    expect(suppressScriptEntry).toBeDefined();
    expect(suppressScriptEntry.world).toBe("MAIN");
    expect(suppressScriptEntry.run_at).toBe("document_start");
  });

  it("keeps Growth's browser capability contract executable for original posts and follows", () => {
    const channelSource = readFileSync(join(process.cwd(), "extension/channel-x.js"), "utf8");
    const backgroundSource = readFileSync(join(process.cwd(), "extension/background.js"), "utf8");
    expect(channelSource).toContain('["post", "reply", "quote", "repost", "like", "follow", "delete"]');
    expect(channelSource).toContain('https://x.com/i/user/${encodeURIComponent(targetId)}');
    expect(channelSource).toContain('window.location.href = "https://x.com/compose/post"');
    expect(channelSource).toContain('const composerUrl = window.location.pathname.includes("/compose/post")');
    expect(backgroundSource).toContain('const candidateExternalRef = result.publicProof?.externalRef');
    expect(backgroundSource).toContain('candidateExternalRef, domProof: result.publicProof, browserEvidence, observedAt');
    expect(backgroundSource).toContain('affordance === "follow"');
    expect(backgroundSource).toContain('affordance === "post"');
    expect(backgroundSource).toContain('const composerIsOpen = affordance === "post"');
    expect(channelSource).toContain('[role="status"]');
    expect(channelSource).toContain('DUPLICATE_PUBLICATION');
    expect(channelSource).toContain('affordance === "delete"');
    expect(channelSource).toContain('DELETE_NOT_VERIFIED');
    expect(channelSource).not.toContain("Extension active · browser tab");
    expect(channelSource).not.toContain("suppressScript");
    expect(channelSource).not.toContain('document.createElement("script")');
    expect(channelSource).toContain('connected: "connected"');
    expect(channelSource).toContain('identity_required: "verify account"');
    expect(channelSource).toContain("OPENPRESENCE_EXTENSION_STATUS");
    expect(backgroundSource).toContain("controlledTabIds");
    expect(backgroundSource).toContain('chrome.tabs.query({ windowId: session.windowId');
    expect(backgroundSource).toContain("message?.type === \"OPENPRESENCE_ACCOUNT_IDENTITY\"");
    expect(backgroundSource).toContain("OPENPRESENCE_CHANNEL_READY");
    expect(backgroundSource).toContain("OPENPRESENCE_FETCH_ASSET");
    expect(backgroundSource).toContain("x-openpresence-executor-id");
    expect(channelSource).toContain("UNSUPPORTED_ASSET");
    expect(channelSource).toContain("mediaAssets.length !== expectedAssetIds.length");
    expect(channelSource).toContain("ASSET_UPLOAD_FAILED");
    expect(channelSource).toContain("assetRefs:");
    expect(channelSource).toContain("permalink: ownReply.permalink");
    expect(channelSource).toContain("quotedTargetId: affordance === \"quote\"");
    expect(channelSource).toContain("PUBLIC_MEDIA_NOT_VERIFIED");
    expect(backgroundSource).toContain("sendSessionContextToTab");
    expect(backgroundSource).toContain("lastIdentityProbeAt");
    expect(backgroundSource).toContain("findExpectedXTab");
    expect(backgroundSource).toContain("adoptExpectedXTab");
    expect(backgroundSource).toContain("tabOwned");
    expect(backgroundSource).toContain('chrome.tabs.query({ url: ["https://x.com/*", "https://*.x.com/*"] })');
    expect(channelSource).toContain("identityReportInFlight");
    expect(channelSource).toContain("sendResponse({ ok: true })");
    expect(channelSource).toContain("X mounts the account menu/profile link after the initial document");
    expect(channelSource).toContain('sendMessage({ type: "OPENPRESENCE_CHANNEL_READY" })');
  });

  it("labels controlled Chrome tab groups with the Presence name", () => {
    const backgroundSource = readFileSync(join(process.cwd(), "extension/background.js"), "utf8");
    expect(backgroundSource).toContain('const tabGroupTitle = (presence) => String(presence?.name || "Presence").trim() || "Presence";');
    expect(backgroundSource).toContain('title: tabGroupTitle(presence)');
    expect(backgroundSource).toContain('title: tabGroupTitle(current.presence)');
    expect(backgroundSource).not.toContain('title: `OpenPresence · ${presence.name} · ${presence.channel}`');
  });

  it("labels the controlled channel tab with the active Presence name", () => {
    const channelSource = readFileSync(join(process.cwd(), "extension/channel-x.js"), "utf8");
    expect(channelSource).toContain("const syncTabTitle = () =>");
    expect(channelSource).toContain("document.title !== label");
    expect(channelSource).toContain("window.setInterval(syncTabTitle, 1_000)");
  });

  it("labels the OpenPresence app tab with the selected Presence name", () => {
    const appSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    const clientSource = readFileSync(join(process.cwd(), "app/client-page.tsx"), "utf8");
    const titleSource = `${appSource}\n${clientSource}`;
    expect(titleSource).toContain("document.title = presenceName;");
    expect(titleSource).not.toContain("document.title = `${presenceName} · OpenPresence`");
  });
});
