"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "../../../components/locale-provider";
import {
  listSessions,
  logoutAllSessions,
  revokeSession,
  type SessionRecord,
  listSecurityEvents,
  type SecurityEventRecord,
} from "../../../lib/api/settings";

/** Map backend event codes to human-readable labels. */
function formatSecurityEvent(eventType: string, ar: boolean): string {
  const key = String(eventType || "").toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, [string, string]> = {
    LOGIN_SUCCESS: ["Successful sign-in", "تسجيل دخول ناجح"],
    LOGIN_FAILURE: ["Failed sign-in attempt", "محاولة تسجيل دخول فاشلة"],
    LOGIN_FAILED: ["Failed sign-in attempt", "محاولة تسجيل دخول فاشلة"],
    LOGOUT: ["Signed out", "تسجيل خروج"],
    LOGOUT_ALL: ["Signed out from all other sessions", "تسجيل خروج من كل الجلسات الأخرى"],
    PASSWORD_CHANGE: ["Password changed", "تم تغيير كلمة المرور"],
    PASSWORD_CHANGED: ["Password changed", "تم تغيير كلمة المرور"],
    SESSION_REVOKE: ["Session revoked", "تم إلغاء جلسة"],
    SESSION_REVOKED: ["Session revoked", "تم إلغاء جلسة"],
    PROFILE_UPDATE: ["Profile updated", "تم تحديث الملف الشخصي"],
    MFA_ENABLED: ["Two-factor authentication enabled", "تفعيل المصادقة الثنائية"],
    MFA_DISABLED: ["Two-factor authentication disabled", "إيقاف المصادقة الثنائية"],
    DEVICE_TRUSTED: ["Device trusted", "تم الوثوق بالجهاز"],
    DEVICE_REVOKED: ["Device access revoked", "إلغاء وصول جهاز"],
    TOKEN_REFRESH: ["Session refreshed", "تجديد الجلسة"],
    SUSPICIOUS_LOGIN: ["Suspicious sign-in detected", "تسجيل دخول مشبوه"],
    ACCOUNT_LOCKED: ["Account locked", "تم قفل الحساب"],
    ACCOUNT_UNLOCKED: ["Account unlocked", "تم فتح الحساب"],
  };
  const pair = map[key];
  if (pair) return ar ? pair[1] : pair[0];
  // Fallback: readable words from CODE_LIKE_THIS
  const readable = key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return readable || eventType || "—";
}

function formatSeverity(severity: string, ar: boolean): { label: string; tone: string } {
  const s = String(severity || "").toUpperCase();
  if (s === "HIGH" || s === "CRITICAL") {
    return { label: ar ? "مرتفع" : "High", tone: "danger" };
  }
  if (s === "MEDIUM" || s === "WARN" || s === "WARNING") {
    return { label: ar ? "متوسط" : "Medium", tone: "warn" };
  }
  return { label: ar ? "عادي" : "Info", tone: "info" };
}

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Web";
  const ua = userAgent;
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Mobile|Android|iPhone/i.test(ua)) return "Mobile browser";
  return ua.length > 48 ? `${ua.slice(0, 48)}…` : ua;
}

export default function SecuritySettingsPage() {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, ev] = await Promise.all([listSessions(), listSecurityEvents()]);
      setSessions(s);
      setSecurityEvents(ev);
      setError("");
    } catch {
      setError(label("settings.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [label]);

  async function revoke(id: string) {
    try {
      await revokeSession(id);
      await load();
    } catch {
      setError(label("settings.error"));
    }
  }

  async function all() {
    try {
      await logoutAllSessions();
      window.location.href = "/auth/login";
    } catch {
      setError(label("settings.error"));
    }
  }

  return (
    <section className="imkan-page imkan-settings-page account-security-page">
      <header className="imkan-page-header" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div className="min-w-0 flex-1">
          <Link
            href="/settings"
            className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--wd-text-muted,#64748b)] no-underline hover:text-[color:var(--wd-text,#212121)]"
          >
            {ar ? "← حسابي" : "← My Account"}
          </Link>
          <h1 className="imkan-title">{ar ? "الأمان والجلسات" : "Security & sessions"}</h1>
          <p className="mt-1 text-[13px] text-[color:var(--wd-text-muted,#64748b)]">
            {ar
              ? "راجع أين سجّلت الدخول مؤخراً وما هي أحداث الحماية المرتبطة بحسابك."
              : "See where you are signed in and the security events linked to your account."}
          </p>
        </div>
      </header>

      {error ? <div className="imkan-alert imkan-alert-danger">{error}</div> : null}

      <div className="flex flex-col gap-5" style={{ maxWidth: 920 }}>
        <section
          className="imkan-panel imkan-settings-card"
          style={{ border: "1px solid var(--wd-line,#e5e7eb)", borderRadius: 14, padding: 20, background: "var(--wd-bg,#fff)" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="imkan-panel-title" style={{ margin: 0 }}>
                {ar ? "الجلسات النشطة" : "Active sessions"}
              </h2>
              <p className="mt-1 text-[12px] text-[color:var(--wd-text-muted,#64748b)]">
                {ar ? "كل جهاز أو متصفح ما زال متصلاً بحسابك." : "Every device or browser still connected to your account."}
              </p>
            </div>
            {sessions.length > 1 ? (
              <button type="button" className="imkan-button-destructive" onClick={() => void all()}>
                {label("settings.logoutAll")}
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="imkan-muted">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
          ) : sessions.length === 0 ? (
            <p className="imkan-muted">{label("settings.noSessions")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
                  style={{
                    borderColor: "var(--wd-line,#e5e7eb)",
                    background: session.isCurrent ? "var(--wd-panel-2,#f8fafc)" : "var(--wd-bg,#fff)",
                  }}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px]"
                    style={{ background: "var(--wd-hover,#f1f5f9)" }}
                    aria-hidden
                  >
                    💻
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[color:var(--wd-text,#1e293b)]">
                      <span>{deviceLabel(session.userAgent)}</span>
                      {session.isCurrent ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--wd-primary-light,#eef4ff)", color: "var(--wd-primary-ink,#1b66ea)" }}
                        >
                          {ar ? "هذه الجلسة" : "This device"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--wd-text-muted,#64748b)]">
                      <span>
                        {ar ? "آخر نشاط: " : "Last active: "}
                        {session.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString(ar ? "ar" : "en") : "—"}
                      </span>
                      <span>IP: {session.ipAddress || "—"}</span>
                      <span>
                        {ar ? "تنتهي: " : "Expires: "}
                        {session.expiresAt ? new Date(session.expiresAt).toLocaleString(ar ? "ar" : "en") : "—"}
                      </span>
                    </div>
                  </div>
                  {!session.isCurrent ? (
                    <button type="button" className="imkan-button-secondary" onClick={() => void revoke(session.id)}>
                      {label("settings.revoke")}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="imkan-panel imkan-settings-card"
          style={{ border: "1px solid var(--wd-line,#e5e7eb)", borderRadius: 14, padding: 20, background: "var(--wd-bg,#fff)" }}
        >
          <h2 className="imkan-panel-title" style={{ margin: 0 }}>
            {ar ? "سجل الحماية" : "Security log"}
          </h2>
          <p className="mt-1 mb-4 text-[12px] text-[color:var(--wd-text-muted,#64748b)]">
            {ar ? "أحداث الدخول والحماية المرتبطة بحسابك." : "Sign-in and protection events linked to your account."}
          </p>

          {loading ? (
            <p className="imkan-muted">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
          ) : securityEvents.length === 0 ? (
            <p className="imkan-muted">{ar ? "لا توجد أحداث حماية بعد." : "No security events yet."}</p>
          ) : (
            <div className="overflow-x-auto w-full max-w-full">
              <table className="imkan-table w-full" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-start text-[11px] font-semibold text-[color:var(--wd-text-muted,#64748b)]">
                      {ar ? "الحدث" : "Event"}
                    </th>
                    <th className="px-3 py-2 text-start text-[11px] font-semibold text-[color:var(--wd-text-muted,#64748b)]">
                      {ar ? "الأهمية" : "Severity"}
                    </th>
                    <th className="px-3 py-2 text-start text-[11px] font-semibold text-[color:var(--wd-text-muted,#64748b)]">IP</th>
                    <th className="px-3 py-2 text-start text-[11px] font-semibold text-[color:var(--wd-text-muted,#64748b)]">
                      {ar ? "الوقت" : "Time"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {securityEvents.map((event) => {
                    const sev = formatSeverity(event.severity, ar);
                    return (
                      <tr key={event.id} className="imkan-table-row">
                        <td className="px-3 py-2.5 text-[13px] text-[color:var(--wd-text,#1e293b)]">
                          {formatSecurityEvent(event.eventType, ar)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={
                              sev.tone === "danger"
                                ? { background: "rgba(220,38,38,.12)", color: "#dc2626" }
                                : sev.tone === "warn"
                                  ? { background: "rgba(217,119,6,.12)", color: "#d97706" }
                                  : { background: "var(--wd-panel-2,#f1f5f9)", color: "var(--wd-text-muted,#64748b)" }
                            }
                          >
                            {sev.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-[color:var(--wd-text-muted,#64748b)]">
                          {event.ipAddress || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-[color:var(--wd-text-muted,#64748b)] whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleString(ar ? "ar" : "en")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
