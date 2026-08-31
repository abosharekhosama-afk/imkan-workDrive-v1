"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { directionFor, isLocale, t, type Locale, type MessageKey } from "../i18n";

/** Persisted locale choice: survives refresh, navigation and browser restarts. */
export const LOCALE_STORAGE_KEY = "workdrive_locale";

function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode may block storage — the in-memory choice still applies.
  }
  // Cookie mirror so any server-side rendering pass can read the active locale.
  document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function readStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value ?? undefined) ? (value as Locale) : null;
  } catch {
    // SSR or blocked storage: fall back to the provided initial locale.
    return null;
  }
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  label: (key: MessageKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  // Server renders with the env default (hydration-safe); the persisted user
  // choice is applied right after mount — and pre-paint via the inline script
  // in layout.tsx which sets <html lang/dir> before the first paint.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== locale) {
      setLocaleState(stored);
      return;
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale: (next: Locale) => {
        if (isLocale(next)) {
          persistLocale(next);
          setLocaleState(next);
        }
      },
      label: (key: MessageKey) => t(locale, key),
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("LocaleProvider is required");
  }
  return context;
}
