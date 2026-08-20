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

    const attempts = [
      () => {
        const node = liveComposer(composer);
        if (!node) return;
        node.focus();
        try { root.document.execCommand("selectAll", false, null); } catch {}
        selectContents(node);
        try {
          node.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: rawExpected }));
        } catch {}
        root.document.execCommand("insertText", false, rawExpected);
      },
      () => {
        const node = liveComposer(composer);
        if (!node) return;
        node.focus();
        node.click();
        try { root.document.execCommand("selectAll", false, null); } catch {}
        try {
          node.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: rawExpected }));
        } catch {}
        root.document.execCommand("insertText", false, rawExpected);
      },
    ];

    for (const attempt of attempts) {
      clearComposer(liveComposer(composer));
      attempt();
      const node = liveComposer(composer);
      if (!node) continue;
      dispatchInput(node, rawExpected);
      // X's Draft.js editor can update the DOM before React receives the
      // input event. Visible text is not success until the controlled
      // submit button becomes enabled too.
      if (await waitFor(() => visibleText(liveComposer(composer)) === expectedNormalized && Boolean(enabledSubmitButton(submitSelector)))) return true;

      clearComposer(node);
    }

    // Some X releases handle a paste-shaped event more reliably than
    // execCommand. Keep it as a final fallback, with the same state check.
    const current = liveComposer(composer);
    if (!current) return false;
    clearComposer(current);
    current.focus();
    try {
      const transfer = new root.DataTransfer();
      transfer.setData("text/plain", rawExpected);
      current.dispatchEvent(new root.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    } catch {
      // ClipboardEvent/DataTransfer are not available in every embedded page.
    }
    try {
      current.dispatchEvent(new root.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: rawExpected }));
    } catch {}
    root.document.execCommand("insertText", false, rawExpected);
    dispatchInput(current, rawExpected);
    return waitFor(() => visibleText(liveComposer(composer)) === expectedNormalized && Boolean(enabledSubmitButton(submitSelector)));
  }

  root.OpenPresenceComposer = { fillComposer };
})(window);
