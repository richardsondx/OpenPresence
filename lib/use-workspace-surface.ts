"use client";

import { useEffect, type RefObject } from "react";

/** Mobile sheets keep keyboard focus inside; desktop inspectors allow navigation. */
export function useWorkspaceSurface(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void, modalBelow = 1100) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surface = ref.current;
    if (!surface) return;
    const focusable = () => Array.from(surface.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || window.innerWidth >= modalBelow) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !surface.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [active, modalBelow, onClose, ref]);
}
