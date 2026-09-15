"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "workdrive_theme";

export function readStoredTheme(storage: Pick<Storage, "getItem"> | null | undefined): Theme {
  if (!storage) return "light";
  try {
    return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Zoho WorkDrive style sun/moon theme toggle persisted in localStorage. */
export function ThemeToggle() {
  const { label } = useLocale();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : readStoredTheme(window.localStorage));
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — theme stays active for this session only.
    }
  }

  const isDark = theme === "dark";
  const title = isDark ? label("theme.toLight") : label("theme.toDark");

  return (
    <button
      type="button"
      className="zoho-icon-btn"
      onClick={() => apply(isDark ? "light" : "dark")}
      aria-label={title}
      title={title}
      aria-pressed={isDark}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
