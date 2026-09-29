"use client";
import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])", "[contenteditable='true']",
].join(",");

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("inert") && el.getAttribute("aria-hidden") !== "true");
}

/**
 * Keeps Tab and Shift+Tab inside `ref` while `active`, as `aria-modal` promises (design gap
 * "focus trap", ENG-51). Focus that escapes (a click on the scrim, say) is pulled back in.
 * Returning focus on close stays with the component, which knows what opened it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusableIn(root);
      if (items.length === 0) { e.preventDefault(); root.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      const inside = cur instanceof Node && root.contains(cur);
      if (e.shiftKey && (cur === first || cur === root || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (cur === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !root.contains(e.target)) (focusableIn(root)[0] ?? root).focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("focusin", onFocusIn); };
  }, [ref, active]);
}
