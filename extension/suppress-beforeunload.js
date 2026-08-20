// Suppress "Leave site? Changes you made may not be saved." prompts from X/Twitter in automated tabs.
(function () {
  try {
    const originalEventTargetAdd = typeof EventTarget !== "undefined" && EventTarget.prototype ? EventTarget.prototype.addEventListener : null;
    const originalWindowAdd = window.addEventListener;

    // 1. Capture and stop beforeunload event at the root level using the native listener
    const internalHandler = (event) => {
      try {
        event.stopImmediatePropagation();
        event.stopPropagation();
        delete event.returnValue;
      } catch {}
    };

    if (originalEventTargetAdd) {
      try { originalEventTargetAdd.call(window, "beforeunload", internalHandler, true); } catch {}
    } else if (originalWindowAdd) {
      try { originalWindowAdd.call(window, "beforeunload", internalHandler, true); } catch {}
    }

    // 2. Prevent any subsequent listener from being registered for beforeunload on any EventTarget
    if (originalEventTargetAdd) {
      EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (typeof type === "string" && (type.toLowerCase() === "beforeunload" || type.toLowerCase() === "pagehide")) {
          return;
        }
        return originalEventTargetAdd.apply(this, arguments);
      };
    }

    if (originalWindowAdd) {
      window.addEventListener = function (type, listener, options) {
        if (typeof type === "string" && (type.toLowerCase() === "beforeunload" || type.toLowerCase() === "pagehide")) {
          return;
        }
        return originalWindowAdd.apply(this, arguments);
      };
    }

    // 3. Prevent setting onbeforeunload property
    try {
      Object.defineProperty(window, "onbeforeunload", {
        get: () => null,
        set: () => {},
        configurable: true,
      });
    } catch {
      window.onbeforeunload = null;
    }

    // 4. Prevent BeforeUnloadEvent returnValue from being set
    if (typeof BeforeUnloadEvent !== "undefined" && BeforeUnloadEvent.prototype) {
      try {
        Object.defineProperty(BeforeUnloadEvent.prototype, "returnValue", {
          get: () => undefined,
          set: () => {},
          configurable: true,
        });
      } catch {}
    }
  } catch {}
})();
