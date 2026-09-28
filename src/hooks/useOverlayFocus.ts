import { useEffect, type RefObject } from "react";

const focusSelector = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

/** One modal focus boundary, shared by command and quick capture overlays. */
export function useOverlayFocus(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(focusSelector);
    (first ?? panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panel) return;
      const elements = [...panel.querySelectorAll<HTMLElement>(focusSelector)]
        .filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, panelRef]);
}
