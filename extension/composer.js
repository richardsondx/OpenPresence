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

  root.OpenPresenceComposer = { fillComposer };
})(window);
