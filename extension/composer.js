(function (root) {
  function normalizeText(text) {
    return (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\u200B/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function visibleText(node) {
    return normalizeText(node?.innerText || node?.textContent);
  }

  function selectContents(node) {
    if (!node?.isConnected || !root.document.documentElement.contains(node)) return false;
    const selection = root.getSelection();
    if (!selection) return false;
    try {
      const range = root.document.createRange();
      range.selectNodeContents(node);
      // X may replace the editor during the same task. Never add a range
      // from a detached tree; that is the source of addRange() console errors.
      if (!node.isConnected || !root.document.documentElement.contains(node)) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      selection.removeAllRanges();
      return false;
    }
  }

  function clearComposer(node) {
    if (!node) return;
    node.focus();
    try { root.document.execCommand("selectAll", false, null); } catch {}
    selectContents(node);
    try { root.document.execCommand("delete", false, null); } catch {}
    dispatchInput(node, "");
  }

  function dispatchInput(node, expected) {
    try {
      node.dispatchEvent(new root.InputEvent("input", { bubbles: true, inputType: "insertText", data: expected }));
    } catch {
      node.dispatchEvent(new root.Event("input", { bubbles: true }));
    }
  }

  async function waitFor(predicate, timeout = 2_500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (predicate()) return true;
      await new Promise((resolve) => root.setTimeout(resolve, 100));
    }
    return false;
  }

  function enabledSubmitButton(selectors = '[data-testid*="tweetButton"], [data-testid*="postButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline_reply"], [role="button"][data-testid*="tweetButton"]') {
    const candidates = [...root.document.querySelectorAll(selectors)];
    const fallbackButtons = [...root.document.querySelectorAll('button, div[role="button"]')].filter((btn) => {
      const label = (btn.getAttribute("aria-label") || btn.innerText || "").trim().toLowerCase();
      return (label === "reply" || label === "post" || label.startsWith("reply to")) && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
    });
    const all = [...candidates, ...fallbackButtons];
    return all.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }

  function liveComposer(node) {
    if (node?.isConnected) return node;
    return root.document.querySelector('[data-testid="tweetTextarea_0"]');
  }

  async function fillComposer({ composer, value, submitSelector = '[data-testid*="tweetButton"], [data-testid*="postButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline_reply"], [role="button"][data-testid*="tweetButton"]' }) {
    const rawExpected = value.trim();
    if (!rawExpected) return false;
    const expectedNormalized = normalizeText(rawExpected);

    function tryExecCommand(node) {
      node.focus();
      try { root.document.execCommand("selectAll", false, null); } catch {}
      selectContents(node);
      try {
        node.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: rawExpected }));
      } catch {}
      root.document.execCommand("insertText", false, rawExpected);
    }

    function tryPaste(node) {
      node.focus();
      try { root.document.execCommand("selectAll", false, null); } catch {}
      try {
        const transfer = new root.DataTransfer();
        transfer.setData("text/plain", rawExpected);
        node.dispatchEvent(new root.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
      } catch {}
      try {
        node.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: rawExpected }));
      } catch {}
      root.document.execCommand("insertText", false, rawExpected);
    }

    function tryCharacterByCharacter(node) {
      // Last resort: type each character individually. This is slow but
      // mirrors real keyboard input and works with Draft.js editors that
      // ignore bulk insertText/paste events.
      node.focus();
      try { root.document.execCommand("selectAll", false, null); } catch {}
      selectContents(node);
      try { root.document.execCommand("delete", false, null); } catch {}
      for (const char of rawExpected) {
        try {
          node.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: char }));
        } catch {}
        try {
          node.dispatchEvent(new root.InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
        } catch {}
        root.document.execCommand("insertText", false, char);
      }
    }

    const strategies = [tryExecCommand, tryPaste, tryCharacterByCharacter];

    for (const strategy of strategies) {
      const node = liveComposer(composer);
      if (!node) continue;
      clearComposer(node);
      // Small delay to let X's editor settle after clearing
      await new Promise((resolve) => root.setTimeout(resolve, 100));
      strategy(node);
      const currentNode = liveComposer(composer);
      if (!currentNode) continue;
      dispatchInput(currentNode, rawExpected);
      // X's Draft.js editor can update the DOM before React receives the
      // input event. Visible text is not success until the controlled
      // submit button becomes enabled too.
      if (await waitFor(() => visibleText(liveComposer(composer)) === expectedNormalized && Boolean(enabledSubmitButton(submitSelector)))) return true;
    }

    return false;
  }

  function composerScope(composer, submitSelector) {
    if (!composer?.isConnected) return null;
    let current = composer;
    while (current && current !== root.document.documentElement) {
      if (current.matches?.('[role="dialog"], form, [data-testid*="tweetComposer"], [data-testid*="composer"]')) return current;
      if (current.querySelector?.(submitSelector) && current.querySelector?.('[contenteditable="true"], textarea')) return current;
      current = current.parentElement;
    }
    return null;
  }

  function mediaInput(scope) {
    return scope?.querySelector?.('input[type="file"]');
  }

  function mediaButton(scope) {
    return [...(scope?.querySelectorAll?.('button,[role="button"]') || [])].find((node) => {
      const label = `${node.getAttribute?.("aria-label") || ""} ${node.getAttribute?.("data-testid") || ""} ${visibleText(node)}`.toLowerCase();
      return /(add (photos|images|media)|media|attach)/i.test(label) && !node.disabled && node.getAttribute?.("aria-disabled") !== "true";
    });
  }

  function attachmentEvidence(scope, count, submitSelector) {
    if (!scope || count < 1) return false;
    const previews = scope.querySelectorAll?.('[data-testid*="mediaPreview"], [data-testid*="preview"], [aria-label*="Remove media"], [aria-label*="Remove photo"], [aria-label*="Remove image"], img[src^="blob:"], video[src^="blob:"]');
    const removeControls = scope.querySelectorAll?.('[aria-label*="Remove media"], [aria-label*="Remove photo"], [aria-label*="Remove image"]');
    const pendingUpload = scope.querySelectorAll?.('[aria-busy="true"], [data-testid*="progress"], [data-testid*="uploading"]');
    const submit = [...(scope.querySelectorAll?.('button,[role="button"]') || [])].find((node) => {
      const matches = submitSelector.split(",").some((selector) => node.matches?.(selector.trim()));
      return matches && !node.disabled && node.getAttribute?.("aria-disabled") !== "true";
    });
    // X may render several nested preview nodes for one file. The per-file
    // remove controls are the stable one-to-one evidence; generic preview
    // counts would let a wrapper and thumbnail masquerade as two uploads.
    return Boolean(submit && removeControls.length === count && pendingUpload.length === 0 && previews.length >= count);
  }

  async function attachFiles({ files, composer, submitSelector = '[data-testid*="tweetButton"], [data-testid*="postButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline_reply"], [role="button"][data-testid*="tweetButton"]', timeoutMs = 8_000 }) {
    if (!Array.isArray(files) || !files.length) return true;
    const scope = composerScope(composer, submitSelector);
    if (!scope) return false;
    let input = mediaInput(scope);
    if (!input) {
      const button = mediaButton(scope);
      if (button) button.click();
      input = await waitFor(() => Boolean(mediaInput(scope)), timeoutMs).then(() => mediaInput(scope));
    }
    if (!input) return false;
    const transfer = new root.DataTransfer();
    for (const file of files) transfer.items.add(file);
    try { input.files = transfer.files; } catch {
      try { Object.defineProperty(input, "files", { configurable: true, value: transfer.files }); } catch { return false; }
    }
    input.dispatchEvent(new root.Event("change", { bubbles: true }));
    try { input.dispatchEvent(new root.InputEvent("input", { bubbles: true, inputType: "insertFromDrop" })); } catch {}
    // The input is only the handoff. X must render the attachments in this
    // exact composer before text can be submitted; a page-wide input or a
    // cleared composer is never proof that the upload was accepted.
    return Boolean(await waitFor(() => input.files?.length === files.length && attachmentEvidence(scope, files.length, submitSelector), timeoutMs));
  }

  root.OpenPresenceComposer = { attachFiles, fillComposer };
})(window);
