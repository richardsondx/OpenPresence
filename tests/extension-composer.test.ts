import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Chrome extension composer and execution helpers", () => {
  let mockWindow: any;
  let mockDoc: any;
  let elements: any[];

  beforeEach(() => {
    elements = [];
    mockDoc = {
      querySelectorAll(selector: string) {
        return elements.filter((el) => {
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
        data: any = {};
        setData(key: string, val: string) { this.data[key] = val; }
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    const executionCode = readFileSync(join(process.cwd(), "extension/execution.js"), "utf8");
    const composerCode = readFileSync(join(process.cwd(), "extension/composer.js"), "utf8");
    new Function("window", "root", executionCode)(mockWindow, mockWindow);
    new Function("window", "root", composerCode)(mockWindow, mockWindow);
  });

  function createElement(tag: string, attrs: Record<string, string> = {}) {
    const listeners: Record<string, Function[]> = {};
    const el: any = {
      tagName: tag.toUpperCase(),
      isConnected: true,
      innerText: "",
      disabled: false,
      attributes: { ...attrs },
      getAttribute(name: string) { return this.attributes[name] ?? null; },
      setAttribute(name: string, val: string) { this.attributes[name] = val; },
      addEventListener(event: string, fn: Function) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      dispatchEvent(event: any) {
        (listeners[event.type] || []).forEach((fn) => fn(event));
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
      listeners: {} as Record<string, Function[]>,
      addEventListener(event: string, fn: Function) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(fn);
      },
      dispatchEvent(event: any) {
        (this.listeners[event.type] || []).forEach((fn) => fn(event));
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
    expect(channelSource).toContain('["post", "reply", "quote", "repost", "like", "follow"]');
    expect(channelSource).toContain('https://x.com/i/user/${encodeURIComponent(targetId)}');
    expect(channelSource).toContain('window.location.href = "https://x.com/compose/post"');
    expect(backgroundSource).toContain('affordance === "follow"');
    expect(backgroundSource).toContain('affordance === "post"');
    expect(backgroundSource).toContain('const composerIsOpen = affordance === "post"');
    expect(channelSource).toContain('[role="status"]');
    expect(channelSource).toContain('DUPLICATE_PUBLICATION');
  });
});
