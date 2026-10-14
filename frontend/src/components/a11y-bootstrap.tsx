"use client";

import { useEffect } from "react";

const STORAGE_KEY = "imkan_a11y_controls_v1";

type A11y = {
  increasedContrast?: boolean;
  contrastLevel?: 1 | 2 | 3;
  underlineActions?: boolean;
  readingMask?: boolean;
  zoomLevel?: number;
  displayFontSize?: number;
  textSpacing?: "compact" | "default" | "moderate" | "widen";
  emphasizeFocus?: boolean;
  customCursor?: boolean;
  highlightCritical?: boolean;
  toggleLabelStatus?: boolean;
  toastStyle?: string;
  successToast?: string;
  warningToast?: string;
  timeoutDuration?: number;
};

export function applyA11ySettings(a: A11y) {
  const root = document.documentElement;
  if (a.displayFontSize != null) root.style.setProperty("--a11y-font-scale", `${a.displayFontSize / 100}`);
  if (a.increasedContrast != null) root.classList.toggle("a11y-contrast", a.increasedContrast);
  if (a.underlineActions != null) root.classList.toggle("a11y-underline-actions", a.underlineActions);
  if (a.readingMask != null) root.classList.toggle("a11y-reading-mask", a.readingMask);
  if (a.emphasizeFocus != null) root.classList.toggle("a11y-focus-ring", a.emphasizeFocus);
  if (a.customCursor != null) root.classList.toggle("a11y-custom-cursor", a.customCursor);
  if (a.highlightCritical != null) root.classList.toggle("a11y-highlight-critical", a.highlightCritical);
  if (a.textSpacing) root.dataset.a11ySpacing = a.textSpacing;
  if (a.contrastLevel != null) root.dataset.a11yContrastLevel = String(a.contrastLevel);
  if (a.zoomLevel != null) document.body.style.zoom = a.zoomLevel !== 100 ? `${a.zoomLevel}%` : "";
  if (a.toggleLabelStatus != null) root.classList.toggle("a11y-toggle-labels", a.toggleLabelStatus);
  if (a.toastStyle) root.dataset.a11yToastStyle = a.toastStyle;
  if (a.successToast) root.dataset.a11ySuccessToast = a.successToast;
  if (a.warningToast) root.dataset.a11yWarningToast = a.warningToast;
  if (a.timeoutDuration != null) root.dataset.a11yTimeout = String(a.timeoutDuration);
}

export function A11yBootstrap() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyA11ySettings(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  return null;
}
