"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "./locale-provider";
import { WorkdriveNav } from "./workdrive-nav";
import { OrgSwitcher } from "./org-switcher";
import { GlobalSearch } from "./global-search";
import { StorageIndicator } from "./storage-indicator";
import { ThemeToggle } from "./theme-toggle";
import { GlobalPreviewHost } from "./global-preview-host";
import { clearSession, logout as apiLogout } from "../lib/api/auth";

/** Enterprise shell: sticky top bar (brand, org switcher, instant search,
 *  quick actions, account), collapsible sidebar, global full-screen previews. */
export function WorkdriveContent({ children }: { children: ReactNode }) {
  const { label, locale, setLocale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [orgName, setOrgName] = useState("");
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (!raw) return;
      const u = JSON.parse(raw) as { role?: string; name?: string; email?: string; organizationName?: string };
      setRole(u.role ?? "");
      setUserName(u.name || u.email || "");
      setOrgName(u.organizationName ?? "");
    } catch {
      // Corrupted session cache — defaults are safe.
    }
  }, []);

  useEffect(() => {
    setAccountOpen(false);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  if (pathname.startsWith("/auth/")) {
    return <>{children}</>;
  }

  async function doLogout() {
    const token = localStorage.getItem("workdrive_access_token");
    try {
      if (token) await apiLogout(token);
    } catch {
      // Network errors must not trap the user in a dead session.
    } finally {
      clearSession();
      router.replace("/auth/login");
    }
  }
  function triggerUpload() {
    window.dispatchEvent(new Event("workdrive:trigger-upload"));
    setDrawerOpen(false);
  }
  function triggerNewFolder() {
    window.dispatchEvent(new Event("workdrive:new-folder"));
    setDrawerOpen(false);
  }
  function toggleLocale() {
    setLocale(locale === "en" ? "ar" : "en");
  }

  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const initials = (userName || "U").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`zoho-app-shell${drawerOpen ? " sidebar-open" : ""}`}>
      <header className="zoho-topbar">
        <div className="zoho-topbar-inner flex items-center justify-between w-full px-0">
          <div className="zoho-topbar-start flex items-center gap-2 me-auto min-w-0 flex-1">
            <button
              type="button"
              className="zoho-icon-btn zoho-drawer-toggle mobile-sidebar-toggle shrink-0"
              onClick={() => setDrawerOpen((value) => !value)}
              aria-expanded={drawerOpen}
              aria-controls="wd-sidebar"
              aria-label={label("nav.workspace")}
              title={label("nav.workspace")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex-1 min-w-0"><GlobalSearch /></div>
          </div>
          <div className="zoho-top-actions ms-auto shrink-0 items-center gap-2">
            <button type="button" className="wd-btn wd-btn-ghost zoho-quick-new" onClick={triggerNewFolder} title={label("quick.new")}>＋ {label("quick.new")}</button>
            <button type="button" className="wd-btn wd-btn-primary zoho-quick-upload" onClick={triggerUpload} title={label("quick.upload")}>⬆ {label("quick.upload")}</button>
            <StorageIndicator />
            <ThemeToggle />
            <Link href="/notifications" className="zoho-icon-btn" aria-label={label("nav.notifications")} title={label("nav.notifications")}>♧</Link>
            <button type="button" className="zoho-icon-btn imkan-locale-btn" onClick={toggleLocale} aria-label={label(locale === "en" ? "locale.arabic" : "locale.english")} title={label(locale === "en" ? "locale.arabic" : "locale.english")}>
              {locale === "en" ? "ع" : "En"}
            </button>
            <div className="zoho-account" ref={accountRef}>
              <button type="button" className="zoho-avatar" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen} aria-haspopup="menu" aria-label={userName || label("brand.workspace")}>
                {initials}
              </button>
              {accountOpen ? (
                <div className="zoho-profile-menu" role="menu">
                  <div className="zoho-profile-name">{userName || "User"}</div>
                  <div className="zoho-profile-rule" />
                  <Link role="menuitem" href="/settings" onClick={() => setAccountOpen(false)}>{label("nav.settings")}</Link>
                  <Link role="menuitem" href="/notifications" onClick={() => setAccountOpen(false)}>{label("nav.notifications")}</Link>
                  {isAdmin ? <Link role="menuitem" href="/admin" onClick={() => setAccountOpen(false)}>{label("nav.admin")}</Link> : null}
                  <div className="zoho-profile-rule" />
                  <button type="button" role="menuitem" onClick={() => void doLogout()}>{label("nav.signOut")}</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className="zoho-main-shell">
        {drawerOpen ? <div className="zoho-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" /> : null}
        <aside id="wd-sidebar" className="zoho-sidebar">
          <div className="zoho-sidebar-head">
            <OrgSwitcher organizationName={orgName || label("brand.workspace")} userRole={role} />
          </div>
          <WorkdriveNav onNavigate={() => setDrawerOpen(false)} />
        </aside>
        <main className="zoho-main">
          <div className="zoho-content">{children}</div>
        </main>
      </div>
      <GlobalPreviewHost />
    </div>
  );
}

export function WorkdriveLocaleAnnouncer() {
  const { locale } = useLocale();
  return <span className="sr-only">{locale}</span>;
}

