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

  function attachmentDiagnostics(scope, count, stage) {
    const previews = scope?.querySelectorAll?.('[data-testid*="mediaPreview"], [data-testid*="preview"], [aria-label*="Remove media"], [aria-label*="Remove photo"], [aria-label*="Remove image"], img[src^="blob:"], video[src^="blob:"]') || [];
    const controls = scope?.querySelectorAll?.('[aria-label*="Remove media"], [aria-label*="Remove photo"], [aria-label*="Remove image"]') || [];
    const pending = scope?.querySelectorAll?.('[aria-busy="true"], [data-testid*="progress"], [data-testid*="uploading"]') || [];
    // Read only visible, composer-scoped platform notices. Page content is
    // untrusted evidence, never an instruction or publication authority.
    const alerts = [...(scope?.querySelectorAll?.('[role="alert"]') || [])]
      .filter(node => node.getClientRects?.().length > 0)
      .map(visibleText).filter(Boolean).slice(0, 3).map(text => text.slice(0, 240));
    return { stage, expectedFiles: count, previewCount: previews.length, removeControlCount: controls.length, pendingUploadCount: pending.length, alerts, beforeSubmission: true };
  }

  async function attachFilesWithEvidence({ files, composer, submitSelector = '[data-testid*="tweetButton"], [data-testid*="postButton"], [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline_reply"], [role="button"][data-testid*="tweetButton"]', timeoutMs = 8_000 }) {
    if (!Array.isArray(files) || !files.length) return { ok: true };
    const scope = composerScope(composer, submitSelector);
    if (!scope) return { ok: false, diagnostics: attachmentDiagnostics(null, files.length, "composer_scope_missing") };
    // Never let an old draft's previews stand in for this approved upload.
    if (attachmentDiagnostics(scope, files.length, "before_handoff").removeControlCount > 0) {
      return { ok: false, diagnostics: attachmentDiagnostics(scope, files.length, "composer_existing_media") };
    }
    let input = mediaInput(scope);
    if (!input) {
      const button = mediaButton(scope);
      if (button) button.click();
      input = await waitFor(() => Boolean(mediaInput(scope)), timeoutMs).then(() => mediaInput(scope));
    }
    if (!input) return { ok: false, diagnostics: attachmentDiagnostics(scope, files.length, "file_input_missing") };
    const transfer = new root.DataTransfer();
    for (const file of files) transfer.items.add(file);
    try { input.files = transfer.files; } catch {
      try { Object.defineProperty(input, "files", { configurable: true, value: transfer.files }); } catch {
        return { ok: false, diagnostics: attachmentDiagnostics(scope, files.length, "file_handoff_failed") };
      }
    }
    if (input.files?.length !== files.length) return { ok: false, diagnostics: attachmentDiagnostics(scope, files.length, "file_handoff_failed") };
    input.dispatchEvent(new root.Event("change", { bubbles: true }));
    try { input.dispatchEvent(new root.InputEvent("input", { bubbles: true, inputType: "insertFromDrop" })); } catch {}
    // React may consume and clear FileList after handoff. Acceptance is the
    // exact per-file previews in this composer with no outstanding upload.
    // Submit readiness belongs to fillComposer, after approved text is filled.
    const ok = await waitFor(() => {
      const evidence = attachmentDiagnostics(scope, files.length, "attachment_wait");
      return evidence.removeControlCount === files.length && evidence.previewCount >= files.length && evidence.pendingUploadCount === 0;
    }, timeoutMs);
    return { ok: Boolean(ok), diagnostics: attachmentDiagnostics(scope, files.length, ok ? "attachments_ready" : "attachment_confirmation_timeout") };
  }

  async function attachFiles(options) {
    return (await attachFilesWithEvidence(options)).ok;
  }

  root.OpenPresenceComposer = { attachFiles, attachFilesWithEvidence, fillComposer };
})(window);
