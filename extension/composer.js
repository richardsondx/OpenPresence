(function (root) {
  function visibleText(node) {
    return node?.innerText?.trim().replace(/\s+/g, " ") || "";
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

  function dispatchInput(node, expected) {
    try {
      node.dispatchEvent(new root.InputEvent("input", { bubbles: true, inputType: "insertText", data: expected }));
    } catch {
      node.dispatchEvent(new root.Event("input", { bubbles: true }));
    }
  }

  async function waitFor(predicate, timeout = 1_500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (predicate()) return true;
      await new Promise((resolve) => root.setTimeout(resolve, 100));
    }
    return false;
  }

  function enabledSubmitButton(selectors) {
    return [...root.document.querySelectorAll(selectors)]
      .find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }

  function liveComposer(node) {
    if (node?.isConnected) return node;
    return root.document.querySelector('[data-testid="tweetTextarea_0"]');
  }

  async function fillComposer({ composer, value, submitSelector = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]' }) {
    const expected = value.trim();
    if (!expected) return false;
    const attempts = [
      () => {
        const node = liveComposer(composer);
        if (!node) return;
        node.focus();
        selectContents(node);
        root.document.execCommand("insertText", false, expected);
      },
      () => {
        const node = liveComposer(composer);
        if (!node) return;
        node.focus();
        node.click();
        root.document.execCommand("insertText", false, expected);
      },
    ];

    for (const attempt of attempts) {
      attempt();
      const node = liveComposer(composer);
      if (!node) continue;
      dispatchInput(node, expected);
      // X's Draft.js editor can update the DOM before React receives the
      // input event. Visible text is not success until the controlled
      // submit button becomes enabled too.
      if (await waitFor(() => visibleText(liveComposer(composer)) === expected && Boolean(enabledSubmitButton(submitSelector)))) return true;

      const current = liveComposer(composer);
      if (!current) continue;
      current.focus();
      selectContents(current);
      root.document.execCommand("delete", false);
      dispatchInput(current, "");
    }

    // Some X releases handle a paste-shaped event more reliably than
    // execCommand. Keep it as a final fallback, with the same state check.
    const current = liveComposer(composer);
    if (!current) return false;
    current.focus();
    selectContents(current);
    try {
      const transfer = new root.DataTransfer();
      transfer.setData("text/plain", expected);
      current.dispatchEvent(new root.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    } catch {
      // ClipboardEvent/DataTransfer are not available in every embedded page.
    }
    dispatchInput(current, expected);
    return waitFor(() => visibleText(liveComposer(composer)) === expected && Boolean(enabledSubmitButton(submitSelector)));
  }

  root.OpenPresenceComposer = { fillComposer };
})(window);
