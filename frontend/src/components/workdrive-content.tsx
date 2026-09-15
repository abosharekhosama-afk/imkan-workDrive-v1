"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "./locale-provider";
import { WorkdriveNav } from "./workdrive-nav";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { clearSession, logout as apiLogout } from "../lib/api/auth";

export function WorkdriveContent({ children }: { children: ReactNode }) {
  const { label, locale, setLocale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (raw) {
        const u = JSON.parse(raw);
        setRole(u.role || "");
        setUserName(u.name || u.email || "");
      }
    } catch {}
  }, []);
  if (pathname.startsWith("/auth/")) {
    return <>{children}</>;
  }
  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/files?query=${encodeURIComponent(query.trim())}`);
  }
  async function doLogout() {
    const token = localStorage.getItem("workdrive_access_token");
    try {
      if (token) await apiLogout(token);
    } catch {}
    finally {
      clearSession();
      router.replace("/auth/login");
    }
  }
  const initials = (userName || "U").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  function toggleLocale() { setLocale(locale === "en" ? "ar" : "en"); }
  const isRTL = locale === "ar";
  const localeBtnLabel = locale === "en" ? "locale.arabic" : "locale.english";
  const localeBtnText = locale === "en" ? "ع" : "En";

  return (
    <div className="zoho-app-shell">
      <header className="zoho-topbar">
        <div className={`zoho-topbar-inner ${isRTL ? "rtl" : ""}`}>
          {!isRTL && (
            <Link href="/files" className="zoho-logo">
              <span className="zoho-logo-mark">I</span>
              <span>IMKAN</span>
            </Link>
          )}
          <div className="zoho-top-actions">
            {isRTL && (
              <>
                <button className="zoho-icon-btn imkan-locale-btn" onClick={toggleLocale} aria-label={label(localeBtnLabel)} title={label(localeBtnLabel)}>{localeBtnText}</button>
                <Link className="zoho-icon-btn" aria-label={label("notifications.title")} href="/notifications">♧</Link>
                <button className="zoho-icon-btn" aria-label="Help">?</button>
              </>
            )}
            {!isRTL && (
              <>
                <button className="zoho-icon-btn" aria-label="Help">?</button>
                <Link className="zoho-icon-btn" aria-label={label("notifications.title")} href="/notifications">♧</Link>
                <button className="zoho-icon-btn imkan-locale-btn" onClick={toggleLocale} aria-label={label(localeBtnLabel)} title={label(localeBtnLabel)}>{localeBtnText}</button>
              </>
            )}
            <button className="zoho-avatar" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{initials}</button>
            {open && (
              <div className="zoho-profile-menu">
                <div className="zoho-profile-name">{userName || "User"}</div>
                <div className="zoho-profile-rule" />
                <Link href="/settings">{label("nav.settings")}</Link>
                <Link href="/notifications">{label("nav.notifications")}</Link>
                {role === "ADMIN" ? <Link href="/admin">{label("nav.admin")}</Link> : null}
                <button onClick={doLogout}>{label("nav.signOut")}</button>
              </div>
            )}
          </div>
          {isRTL && (
            <Link href="/files" className="zoho-logo">
              <span className="zoho-logo-mark">I</span>
              <span>IMKAN</span>
            </Link>
          )}
        </div>
      </header>
      <div className="zoho-main-shell">
        <aside className="zoho-sidebar">
          <div className="zoho-team-switch">
            <span className="zoho-team-avatar">I</span>
            <span>
              <strong>IMKAN Workspace</strong>
              <small>My WorkDrive</small>
            </span>
            <span className="chevron">⌄</span>
          </div>
          <WorkdriveNav />
          <div className="zoho-admin-link">Admin Console</div>
        </aside>
        <main className="zoho-main">
          <div className="zoho-commandbar">
            <div className="zoho-command-search">
              <span>⌕</span>
              <form onSubmit={onSearch}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files and folders" aria-label="Search files and folders" />
              </form>
              <kbd>⌘ K</kbd>
            </div>
            <div className="zoho-command-actions">
              <button className="zoho-ghost-btn" aria-label="Create" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))}>＋ New</button>
              <button className="zoho-icon-btn">⋮</button>
            </div>
          </div>
          <div className="zoho-content">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function WorkdriveLocaleAnnouncer() {
  const { locale } = useLocale();
  return <span className="sr-only">{locale}</span>;
}