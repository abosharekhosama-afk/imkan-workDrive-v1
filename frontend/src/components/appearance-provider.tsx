"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAppearancePreferences, updateAppearancePreferences, type AppearancePreferences } from "../lib/api/auth";

export type Appearance = Pick<AppearancePreferences, "themeMode" | "themeColor" | "fontFamily" | "lighterSidebar">;

type AppearanceContextValue = Appearance & {
  ready: boolean;
  setAppearance: (patch: Partial<Appearance>) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const STORAGE_KEY = "workdrive_appearance";

const accent = {
  blue: ["#2C66DD", "#184091", "#254993", "#EFF6FF"],
  green: ["#16A085", "#087F69", "#08735F", "#EAF9F5"],
  red: ["#EF3340", "#C41F2A", "#A61B24", "#FFF0F1"],
  yellow: ["#F5B301", "#C68A00", "#946700", "#FFF8DE"],
} as const;

function readLocal(): Appearance | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    if (!parsed.themeMode || !parsed.themeColor || !parsed.fontFamily) return null;
    return {
      themeMode: parsed.themeMode,
      themeColor: parsed.themeColor,
      fontFamily: parsed.fontFamily,
      lighterSidebar: Boolean(parsed.lighterSidebar),
    } as Appearance;
  } catch { return null; }
}

function applyToDocument(value: Appearance) {
  const root = document.documentElement;
  const resolved = value.themeMode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : value.themeMode;
  root.dataset.theme = resolved;
  root.dataset.themeMode = value.themeMode;
  root.dataset.themeColor = value.themeColor;
  root.dataset.fontFamily = value.fontFamily;
  root.dataset.sidebarLight = value.lighterSidebar ? "true" : "false";
  const [primary, dark, ink, light] = accent[value.themeColor];
  root.style.setProperty("--user-accent-primary", primary);
  root.style.setProperty("--user-accent-dark", dark);
  root.style.setProperty("--user-accent-ink", ink);
  root.style.setProperty("--user-accent-light", light);
  root.style.setProperty("--user-font-family", JSON.stringify(value.fontFamily));
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>(() => readLocal() ?? {
    themeMode: "light", themeColor: "blue", fontFamily: "Zoho Puvi", lighterSidebar: false,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyToDocument(appearance);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)); } catch { /* noop */ }
  }, [appearance]);

  useEffect(() => {
    let live = true;
    const token = localStorage.getItem("workdrive_access_token");
    if (!token) { setReady(true); return; }
    getAppearancePreferences().then((remote) => {
      if (!live) return;
      setState({ themeMode: remote.themeMode, themeColor: remote.themeColor, fontFamily: remote.fontFamily, lighterSidebar: remote.lighterSidebar });
      setReady(true);
    }).catch(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (appearance.themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyToDocument(appearance);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [appearance]);

  const value = useMemo<AppearanceContextValue>(() => ({
    ...appearance,
    ready,
    async setAppearance(patch) {
      const next = { ...appearance, ...patch };
      setState(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        applyToDocument(next);
        const saved = await updateAppearancePreferences(patch);
        setState({ themeMode: saved.themeMode, themeColor: saved.themeColor, fontFamily: saved.fontFamily, lighterSidebar: saved.lighterSidebar });
      } catch (error) {
        setState(appearance);
        applyToDocument(appearance);
        throw error;
      }
    },
  }), [appearance, ready]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("AppearanceProvider is required");
  return value;
}
