"use client";

import { useEffect } from "react";

export function KeyboardShortcutsRuntime() {
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;

      if (key === "/" && !ctrl && !shift) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:focus-search"));
        return;
      }
      if (shift && key.toLowerCase() === "f" && !ctrl) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:create-folder"));
        return;
      }
      if (ctrl && shift && key.toLowerCase() === "f") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:upload-file"));
        return;
      }
      if (ctrl && shift && key.toLowerCase() === "u") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:upload-folder"));
        return;
      }
      if (shift && !ctrl) {
        const map: Record<string, string> = { t: "document", s: "sheet", p: "show", m: "markdown" };
        const kind = map[key.toLowerCase()];
        if (kind) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("workdrive:create-item", { detail: { kind } }));
          return;
        }
      }
      if (key.toLowerCase() === "v" && !ctrl && !shift) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:toggle-view"));
        return;
      }
      if (key.toLowerCase() === "o" && !ctrl && !shift) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:open-sort"));
        return;
      }
      if (key.toLowerCase() === "g" && !ctrl && !shift) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:open-filter"));
        return;
      }
      if (ctrl && key.toLowerCase() === "a") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:select-all"));
        return;
      }
      if (key === "Escape") {
        window.dispatchEvent(new CustomEvent("workdrive:deselect-all"));
        return;
      }
      if (ctrl && key.toLowerCase() === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("workdrive:create-team-folder"));
        return;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
