"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FileRecord, FolderRecord } from "../../lib/api/types";

export type InspectorTab = "details" | "activity";
export type InspectorResource =
  | { kind: "FILE"; file: FileRecord }
  | { kind: "FOLDER"; folder: FolderRecord };

type ShellContextValue = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (value: boolean) => void;
  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;
  selected: InspectorResource | null;
  select: (resource: InspectorResource | null, opts?: { open?: boolean }) => void;
  mobileInspectorOpen: boolean;
  setMobileInspectorOpen: (value: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

const SIDEBAR_KEY = "zoho.sidebar.collapsed";
const INSPECTOR_KEY = "zoho.inspector.open";
const INSPECTOR_TAB_KEY = "zoho.inspector.tab";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function readTab(): InspectorTab {
  try {
    return window.localStorage.getItem(INSPECTOR_TAB_KEY) === "activity" ? "activity" : "details";
  } catch {
    return "details";
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inspectorOpen, setInspectorOpenState] = useState(false);
  const [inspectorTab, setInspectorTabState] = useState<InspectorTab>("details");
  const [selected, setSelected] = useState<InspectorResource | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  useEffect(() => {
    setSidebarCollapsedState(readFlag(SIDEBAR_KEY));
    setInspectorOpenState(readFlag(INSPECTOR_KEY));
    setInspectorTabState(readTab());
  }, []);

  const setSidebarCollapsed = useCallback((value: boolean) => {
    setSidebarCollapsedState(value);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
    } catch { /* private mode — in-memory only */ }
  }, []);

  const setInspectorOpen = useCallback((value: boolean) => {
    setInspectorOpenState(value);
    try {
      window.localStorage.setItem(INSPECTOR_KEY, value ? "1" : "0");
    } catch { /* private mode */ }
  }, []);

  const setInspectorTab = useCallback((tab: InspectorTab) => {
    setInspectorTabState(tab);
    try {
      window.localStorage.setItem(INSPECTOR_TAB_KEY, tab);
    } catch { /* private mode */ }
  }, []);

  const select = useCallback((resource: InspectorResource | null, opts?: { open?: boolean }) => {
    setSelected(resource);
    if (resource && opts?.open !== false) {
      setInspectorOpenState(true);
      try {
        window.localStorage.setItem(INSPECTOR_KEY, "1");
      } catch { /* noop */ }
    }
  }, []);

  // Global event bridge: any FileBrowser row can dispatch
  // `new CustomEvent("workdrive:inspector-select", { detail })` to open the inspector
  // without prop-drilling through every page.
  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<InspectorResource | null>).detail;
      if (detail === null || (detail && typeof detail === "object" && "kind" in detail)) {
        setSelected(detail);
        if (detail) {
          setInspectorOpenState(true);
          try {
            window.localStorage.setItem(INSPECTOR_KEY, "1");
          } catch { /* noop */ }
        }
      }
    };
    window.addEventListener("workdrive:inspector-select", onSelect);
    return () => window.removeEventListener("workdrive:inspector-select", onSelect);
  }, []);

  const value = useMemo<ShellContextValue>(() => ({
    sidebarCollapsed, setSidebarCollapsed,
    mobileNavOpen, setMobileNavOpen,
    inspectorOpen, setInspectorOpen,
    inspectorTab, setInspectorTab,
    selected, select,
    mobileInspectorOpen, setMobileInspectorOpen,
  }), [sidebarCollapsed, setSidebarCollapsed, mobileNavOpen, inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, selected, select, mobileInspectorOpen]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("ShellProvider is required");
  return ctx;
}

/** Dispatch from anywhere (FileBrowser rows, grids, search) to open the inspector. */
export function openInspector(resource: InspectorResource | null) {
  window.dispatchEvent(new CustomEvent("workdrive:inspector-select", { detail: resource }));
}
