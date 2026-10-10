"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../components/locale-provider";
import { getAppearancePreferences, me } from "../../lib/api/auth";
import { AccountAvatar, rememberAccountProfile } from "../../components/account-avatar";
import { updateProfile } from "../../lib/api/settings";
import { getToken } from "../../lib/api/jwt";

export default function SettingsPage() {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [organization, setOrganization] = useState("");
  const [joinedAt, setJoinedAt] = useState<string | null>(null);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const token = getToken();
    if (!token) return;
    const [u, profile] = await Promise.all([me(token), getAppearancePreferences().catch(() => null)]);
    setName(u.name ?? "");
    setEmail(u.email);
    setRole(profile?.role || u.role);
    setAvatarUrl(profile?.avatarUrl ?? u.avatarUrl ?? null);
    setUserId(u.id);
    setOrganization(profile?.organizationName ?? "");
    setJoinedAt(profile?.joinedAt ?? null);
    setLastLoginAt(profile?.lastLoginAt ?? null);
    rememberAccountProfile({
      name: u.name,
      email: u.email,
      avatarUrl: profile?.avatarUrl ?? u.avatarUrl ?? null,
      role: profile?.role || u.role,
      organizationName: profile?.organizationName,
    });
  }

  useEffect(() => {
    void load().catch(() => setError(label("settings.error")));
  }, [label]);

  async function save() {
    try {
      setError("");
      setMessage("");
      const u = await updateProfile({ name });
      setName(u.name ?? "");
      rememberAccountProfile({ name: u.name, avatarUrl: u.avatarUrl ?? avatarUrl });
      setMessage(label("settings.saved"));
    } catch {
      setError(label("settings.error"));
    }
  }

  return (
    <section className="imkan-page imkan-settings-page account-page">
      <header className="imkan-page-header">
        <div>
          <p className="imkan-meta">IMKAN WorkDrive</p>
          <h1 className="imkan-title">{ar ? "حسابي" : "My Account"}</h1>
          <p className="mt-1 text-[13px] text-[color:var(--wd-text-muted,#64748b)]">
            {ar ? "إدارة بيانات ملفك الشخصي في مساحة العمل." : "Manage your profile details in the workspace."}
          </p>
        </div>
      </header>

      {message ? <div className="imkan-alert">{message}</div> : null}
      {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}

      <div className="imkan-settings-grid" style={{ gridTemplateColumns: "1fr", maxWidth: 720 }}>
        <section className="imkan-panel imkan-settings-card imkan-settings-account">
          <h2 className="imkan-panel-title">{ar ? "الملف الشخصي" : "Profile"}</h2>
          <div className="imkan-account-card">
            <AccountAvatar
              name={name || email}
              email={email}
              avatarUrl={avatarUrl}
              size={96}
              editable
              changeLabel={label("settings.changePhoto")}
              removeLabel={label("settings.removePhoto")}
              onChange={async (next) => {
                const saved = await updateProfile({ avatarUrl: next });
                setAvatarUrl(saved.avatarUrl ?? null);
                rememberAccountProfile({ name: saved.name ?? name, avatarUrl: saved.avatarUrl ?? null });
                setMessage(label("settings.saved"));
              }}
            />
            <div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.name")}</label>
                <input className="imkan-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.email")}</label>
                <input className="imkan-input" value={email} disabled />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.role")}</label>
                <input className="imkan-input" value={role} disabled />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.organization")}</label>
                <input className="imkan-input" value={organization} disabled />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.userId")}</label>
                <input className="imkan-input" value={userId} disabled />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.memberSince")}</label>
                <input className="imkan-input" value={joinedAt ? new Date(joinedAt).toLocaleDateString(ar ? "ar" : "en") : ""} disabled />
              </div>
              <div className="imkan-field">
                <label className="imkan-label">{label("settings.lastLogin")}</label>
                <input className="imkan-input" value={lastLoginAt ? new Date(lastLoginAt).toLocaleString(ar ? "ar" : "en") : ""} disabled />
              </div>
              <div className="imkan-field-actions">
                <button type="button" className="imkan-button" onClick={() => void save()}>
                  {label("settings.save")}
                </button>
              </div>
            </div>
          </div>
        </section>

        <Link
          href="/settings/security"
          className="imkan-panel imkan-settings-card block no-underline transition hover:border-[color:var(--wd-primary,#2C66DD)]"
          style={{ border: "1px solid var(--wd-line,#e5e7eb)", borderRadius: 12 }}
        >
          <div className="flex items-start gap-4 p-1">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px]"
              style={{ background: "var(--wd-panel-2,#f1f5f9)", color: "var(--wd-text,#334155)" }}
              aria-hidden
            >
              🛡️
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="imkan-panel-title !mb-1" style={{ margin: 0 }}>
                {ar ? "الأمان والجلسات" : "Security & sessions"}
              </h2>
              <p className="text-[13px] leading-5 text-[color:var(--wd-text-muted,#64748b)]">
                {ar
                  ? "عرض الجلسات النشطة وسجل الحماية، وإلغاء أي جلسة غير موثوقة."
                  : "Review active sessions and the security log, and revoke any untrusted session."}
              </p>
            </div>
            <span className="text-[18px] text-[color:var(--wd-text-muted,#94a3b8)]" aria-hidden>
              ›
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
