"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../../components/locale-provider";
import { getOfficeNotificationPreferences, listNotifications, markAllNotificationsRead, markNotificationRead, updateOfficeNotificationPreferences, type NotificationRecord, type OfficeNotificationPreferences } from "../../lib/api/notifications";
import { formatDateLocalized } from "../../lib/localized";
import { Icons } from "../../components/layout/icons";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const { label, locale } = useLocale();
  const router = useRouter();
  const ar = locale === "ar";
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<OfficeNotificationPreferences | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  const load = async () => {
    try {
      setError("");
      setItems(await listNotifications());
    } catch {
      setError(label("error.generic"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); getOfficeNotificationPreferences().then(setPrefs).catch(() => undefined); }, [label]);

  const togglePref = async (key: keyof Pick<OfficeNotificationPreferences, "collaboration"|"templateAutomation"|"exports"|"compliance"|"externalStorage">) => {
    if (!prefs) return; const next = !prefs[key]; setPrefs({ ...prefs, [key]: next }); setPrefsBusy(true);
    try { setPrefs(await updateOfficeNotificationPreferences({ [key]: next })); } catch { setPrefs(prefs); } finally { setPrefsBusy(false); }
  };

  const read = async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const all = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-white p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto w-full max-w-[1040px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#1B66EA]">IMKAN WorkDrive</p>
            <h1 className="mt-1 text-[20px] font-semibold text-slate-900">{label("notifications.title")}</h1>
            <p className="mt-1 text-[11px] text-slate-500">
              {ar ? "كل تنبيهات مشاركة الملفات وسير العمل في مكان واحد." : "All file sharing and workflow alerts in one place."}
            </p>
          </div>
          {unread > 0 ? (
            <button type="button" className="wd-pill wd-pill-record" onClick={() => void all()}>
              {label("notifications.markAll")} · {unread}
            </button>
          ) : null}
        </div>

        {error ? <div className="wd-card mb-4 border-red-100 bg-red-50 p-4 text-[11px] text-red-600">{error}</div> : null}

        {prefs ? (
          <section className="wd-card mb-4 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="text-[13px] font-semibold text-slate-800">{ar ? "إشعارات IMKAN Office" : "IMKAN Office notifications"}</h2><p className="mt-1 text-[10px] text-slate-400">{ar ? "تحكم في أنواع تنبيهات Office والقوالب التي تريد استقبالها." : "Choose which Office and Template alerts you receive."}</p></div>
              {prefsBusy ? <span className="text-[10px] text-slate-400">{label("common.loading")}</span> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["collaboration", ar ? "التعاون والمزامنة" : "Collaboration & sync"],
                ["templateAutomation", ar ? "أتمتة القوالب" : "Template automation"],
                ["exports", ar ? "تصدير Office" : "Office exports"],
                ["compliance", ar ? "الأمان والامتثال" : "Security & compliance"],
                ["externalStorage", ar ? "التخزين الخارجي" : "External storage"],
              ].map(([key,title]) => { const k=key as keyof Pick<OfficeNotificationPreferences, "collaboration"|"templateAutomation"|"exports"|"compliance"|"externalStorage">; return (
                <button key={key} type="button" disabled={prefsBusy} onClick={() => void togglePref(k)} className="flex min-h-[42px] items-center justify-between rounded-md border border-slate-100 px-3 text-start hover:bg-slate-50">
                  <span className="text-[11px] font-medium text-slate-700">{title}</span><span className={`h-5 w-9 rounded-full p-0.5 transition ${prefs[k] ? "bg-[#1B66EA]" : "bg-slate-200"}`}><span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition ${prefs[k] ? "translate-x-4" : "translate-x-0"}`} /></span>
                </button>
              ); })}
            </div>
          </section>
        ) : null}

        <section className="wd-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-800">{ar ? "مركز الإشعارات" : "Notification center"}</h2>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {unread > 0 ? `${unread} ${label("notif.unreadCount")}` : (ar ? "لا توجد إشعارات غير مقروءة" : "No unread notifications")}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F6FB] text-slate-500"><Icons.bell size={15} /></span>
          </div>

          {loading ? (
            <div className="px-5 py-14 text-center text-[11px] text-slate-400">{label("common.loading")}</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F6FB] text-slate-400"><Icons.bell size={18} /></div>
              <h3 className="mt-4 text-[13px] font-semibold text-slate-700">{label("notifications.empty")}</h3>
              <p className="mt-1 text-[10.5px] text-slate-400">{ar ? "ستظهر التنبيهات الجديدة هنا." : "New alerts will appear here."}</p>
            </div>
          ) : (
            <div>
              {items.map((n) => (
                <article key={n.id} className={`flex items-start gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 ${n.readAt ? "bg-white" : "bg-[#F7F9FF]"} ${n.resourceType === "FILE" && n.resourceId ? "cursor-pointer" : ""}`} onClick={() => { if (n.resourceType === "FILE" && n.resourceId) router.push(`/files?openFileId=${n.resourceId}`); }}>
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.readAt ? "bg-slate-100 text-slate-400" : "bg-[#EEF4FF] text-[#1B66EA]"}`}>
                    <Icons.bell size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[12px] font-semibold text-slate-800">{n.title}</h3>
                      {!n.readAt ? <span className="rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[8.5px] font-semibold text-[#1B66EA]">{ar ? "جديد" : "New"}</span> : null}
                    </div>
                    {n.body ? <p className="mt-1 text-[10.5px] leading-5 text-slate-500">{n.body}</p> : null}
                    <time className="mt-1.5 block text-[9.5px] text-slate-400">{formatDateLocalized(n.createdAt, locale)}</time>
                  </div>
                  {!n.readAt ? (
                    <button type="button" className="wd-pill wd-pill-record shrink-0" onClick={() => void read(n.id)}>
                      {label("notifications.markRead")}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
