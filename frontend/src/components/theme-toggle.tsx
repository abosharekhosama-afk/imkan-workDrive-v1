"use client";

import { useLocale } from "./locale-provider";
import { useAppearance } from "./appearance-provider";

/** Compact WorkDrive theme toggle. The selected mode is persisted for the signed-in user. */
export function ThemeToggle() {
  const { label } = useLocale();
  const { themeMode, setAppearance } = useAppearance();
  const isDark = themeMode === "dark";
  const title = isDark ? label("theme.toLight") : label("theme.toDark");
  return (
    <button type="button" className="zoho-icon-btn" onClick={() => void setAppearance({ themeMode: isDark ? "light" : "dark" })}
      aria-label={title} title={title} aria-pressed={isDark}>
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
      )}
    </button>
  );
}
