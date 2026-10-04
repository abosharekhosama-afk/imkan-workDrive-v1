"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { getSecurityCenter, revokeAdminSession } from "@/lib/api/enterprise";

type SecurityEvent = {
  id: string;
  userId?: string;
  eventType?: string;
  ipAddress?: string | null;
  resourceType?: string;
  resourceId?: string;
  createdAt: string;
  user?: { name?: string | null; email?: string | null } | null;
};

type SecurityCenter = {
  activeSessions?: number;
  revokedSessions?: number;
  activeDevices?: number;
  events?: SecurityEvent[];
};

function text(ar: boolean, en: string, arText: string) {
  return ar ? arText : en;
}

function formatWhen(value: string, ar: boolean) {
  try {
    return new Date(value).toLocaleString(ar ? "ar" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export default function AdminDevicesPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [data, setData] = useState<SecurityCenter | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setError("");
    void getSecurityCenter()
      .then((value) => setData(value as SecurityCenter))
      .catch(() =>
        setError(
          text(ar, "Unable to load devices and sessions.", "تعذر تحميل الأجهزة والجلسات."),
        ),
      );
  }, [ar]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (sessionId: string) => {
    setBusyId(sessionId);
    setNotice("");
    try {
      await revokeAdminSession(sessionId);
      setNotice(text(ar, "Session revoked.", "تم إلغاء الجلسة."));
      load();
    } catch {
      setError(text(ar, "Unable to revoke session.", "تعذر إلغاء الجلسة."));
    } finally {
      setBusyId(null);
    }
  };

  const stats = [
    {
      label: text(ar, "Active sessions", "الجلسات النشطة"),
      value: data?.activeSessions ?? "—",
      hint: text(ar, "Currently signed-in sessions", "جلسات تسجيل الدخول الحالية"),
      accent: "from-[#e8f1ff] to-white",
      ring: "ring-[#c5d8f8]",
    },
    {
      label: text(ar, "Revoked sessions", "الجلسات الملغاة"),
      value: data?.revokedSessions ?? "—",
      hint: text(ar, "Sessions ended by an admin", "جلسات أنهتها الإدارة"),
      accent: "from-[#fff1e8] to-white",
      ring: "ring-[#f5d2b8]",
    },
    {
      label: text(ar, "Active devices", "الأجهزة النشطة"),
      value: data?.activeDevices ?? "—",
      hint: text(ar, "Recognized devices in the org", "أجهزة معرّفة داخل المؤسسة"),
      accent: "from-[#e9f8ef] to-white",
      ring: "ring-[#bde5cb]",
    },
  ];

  const events = data?.events ?? [];

  return (
    <main
      className="h-full overflow-y-auto bg-[#f4f6f9] p-5 sm:p-7 lg:p-8"
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {text(ar, "Security", "الأمان")}
            </p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">
              {text(ar, "Manage Devices", "إدارة الأجهزة")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-slate-500">
              {text(
                ar,
                "Review active sessions and recent security events across the organization. Revoke any suspicious session immediately.",
                "راجع الجلسات النشطة وأحداث الأمان الأخيرة عبر المؤسسة. يمكنك إلغاء أي جلسة مشبوهة فوراً.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {text(ar, "Refresh", "تحديث")}
          </button>
        </header>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700">
            {notice}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className={`rounded-2xl border border-white/80 bg-gradient-to-br ${stat.accent} p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ring-1 ${stat.ring}`}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </div>
              <div className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-slate-900">
                {stat.value}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">{stat.hint}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                {text(ar, "Recent security events", "أحداث الأمان الأخيرة")}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {text(
                  ar,
                  "Login activity, device changes, and admin-driven session actions.",
                  "نشاط تسجيل الدخول وتغييرات الأجهزة وإجراءات الجلسات من الإدارة.",
                )}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600">
              {events.length} {text(ar, "events", "أحداث")}
            </span>
          </div>

          {!data ? (
            <div className="px-5 py-16 text-center text-[13px] text-slate-400">
              {text(ar, "Loading devices and sessions…", "جارٍ تحميل الأجهزة والجلسات…")}
            </div>
          ) : events.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8">
                <h3 className="text-[14px] font-semibold text-slate-800">
                  {text(ar, "No recent security events", "لا توجد أحداث أمان حديثة")}
                </h3>
                <p className="mt-2 text-[12px] leading-5 text-slate-500">
                  {text(
                    ar,
                    "When members sign in or sessions are revoked, activity will appear here.",
                    "عند تسجيل دخول الأعضاء أو إلغاء الجلسات ستظهر الأنشطة هنا.",
                  )}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map((event) => {
                const title =
                  event.user?.name ||
                  event.user?.email ||
                  event.userId ||
                  text(ar, "Unknown user", "مستخدم غير معروف");
                const canRevoke =
                  event.resourceType === "SESSION" && Boolean(event.resourceId);
                return (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-slate-50/70"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef3ff] text-[12px] font-bold text-[#2f61b7]">
                      {(title || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[13px] font-semibold text-slate-900">{title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                          {event.eventType || "—"}
                        </span>
                        <span>{event.ipAddress || text(ar, "No IP", "بدون IP")}</span>
                      </div>
                    </div>
                    <time className="text-[11px] text-slate-500">
                      {formatWhen(event.createdAt, ar)}
                    </time>
                    {canRevoke ? (
                      <button
                        type="button"
                        disabled={busyId === event.resourceId}
                        onClick={() => void revoke(String(event.resourceId))}
                        className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyId === event.resourceId
                          ? text(ar, "Revoking…", "جارٍ الإلغاء…")
                          : text(ar, "Revoke session", "إلغاء الجلسة")}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
