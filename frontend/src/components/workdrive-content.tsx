"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "./locale-provider";
import { WorkdriveNav } from "./workdrive-nav";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { clearSession, logout as apiLogout, listMemberships, switchOrganization as apiSwitchOrganization, type OrganizationMembershipSummary } from "../lib/api/auth";

export function WorkdriveContent({ children }: { children: ReactNode }) {
  const { label, locale, setLocale } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [orgName, setOrgName] = useState("IMKAN Workspace");
  const [memberships, setMemberships] = useState<OrganizationMembershipSummary[]>([]);
  const [switchingOrg, setSwitchingOrg] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      if (raw) {
        const u = JSON.parse(raw);
        setRole(u.role || "");
        setUserName(u.name || u.email || "");
        setOrgName(u.organizationName || "IMKAN Workspace");
      }
      const token = localStorage.getItem("workdrive_access_token");
      if (token) {
        listMemberships(token).then((items) => setMemberships(items)).catch(() => setMemberships([]));
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
  async function switchOrg(organizationId: string) {
    if (switchingOrg) return;
    const token = localStorage.getItem("workdrive_access_token");
    if (!token) return;
    setSwitchingOrg(true);
    try {
      const result = await apiSwitchOrganization(token, organizationId);
      localStorage.setItem("workdrive_access_token", result.access_token);
      localStorage.setItem("workdrive_user", JSON.stringify(result.user));
      const selected = memberships.find((m) => m.organizationId === organizationId);
      setOrgName(selected?.organization.name || result.user.org_id);
      window.location.reload();
    } catch {
      // Keep the current organization active if switching fails.
    } finally {
      setSwitchingOrg(false);
    }
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
            {isRTL && <button className="zoho-avatar zoho-avatar-rtl" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={userName || "الحساب"}>{initials}</button>}
            {open && (
              <div className="zoho-profile-menu">
                <div className="zoho-profile-name">{userName || "User"}</div>
                <div className="zoho-profile-rule" />
                <Link href="/settings">{label("nav.settings")}</Link>
                <Link href="/notifications">{label("nav.notifications")}</Link>
                {(role === "ADMIN" || role === "SUPER_ADMIN") ? <Link href="/admin">{label("nav.admin")}</Link> : null}
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
          <div className="zoho-team-switch" style={{ position: "relative" }}>
            <span className="zoho-team-avatar">{(orgName || "I").slice(0, 1).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgName}</strong>
              <small>My WorkDrive</small>
            </span>
            <details style={{ marginInlineStart: "auto" }}>
              <summary className="chevron" aria-label="Switch organization">⌄</summary>
              <div className="zoho-profile-menu" style={{ top: "100%", insetInlineStart: 0, minWidth: 240 }}>
                {memberships.map((m) => (
                  <button key={m.id} disabled={switchingOrg} onClick={() => void switchOrg(m.organizationId)} style={{ display: "block", width: "100%", textAlign: "start", padding: "8px 10px", border: 0, background: "transparent", cursor: "pointer" }}>
                    <strong>{m.organization.name}</strong><br /><small>{m.role}</small>
                  </button>
                ))}
              </div>
            </details>
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