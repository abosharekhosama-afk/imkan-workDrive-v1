"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "../locale-provider";
import { listNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications, type NotificationRecord } from "../../lib/api/notifications";
import { formatDateLocalized } from "../../lib/localized";
import { Icons } from "./icons";

export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { label, locale } = useLocale();
  const [notes, setNotes] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listNotifications()
      .then((r) => { if (!cancelled) setNotes(r); })
      .catch(() => { if (!cancelled) setNotes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = subscribeToNotifications((notification) => {
      setNotes((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)].slice(0, 100));
    }, () => { /* polling remains the fallback */ });
    const timer = window.setInterval(() => { listNotifications().then(setNotes).catch(() => undefined); }, 30000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const markRead = async (id: string) => {
    try { await markNotificationRead(id); } catch { /* non-fatal */ }
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const markAllRead = async () => {
    try { await markAllNotificationsRead(); } catch { /* non-fatal */ }
    setNotes((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  };

  if (!open) return null;
  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <div
      ref={ref}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="wd-menu fixed end-3 top-[52px] z-[120] w-[min(390px,calc(100vw-24px))] !p-0 overflow-hidden bg-[var(--wd-bg,#fff)] border border-[color:var(--wd-line,#e5e7eb)] text-[color:var(--wd-text,#212121)]"
      role="dialog"
      aria-label={label("nav.notifications")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--wd-line,#e5e7eb)] px-4 py-3 bg-[var(--wd-bg,#fff)]">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[color:var(--wd-text,#1e293b)]">{label("nav.notifications")}</div>
          <div className="mt-0.5 text-[10px] text-[color:var(--wd-text-muted,#94a3b8)]">
            {unread > 0 ? `${unread} ${label("notif.unreadCount")}` : label("notif.empty")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unread > 0 ? (
            <button type="button" onClick={() => void markAllRead()} className="text-[11px] font-medium text-[color:var(--wd-primary-ink,#1B66EA)] hover:underline">
              {label("notif.markAllRead")}
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="wd-icon-btn" aria-label="Close">
            <Icons.x size={15} />
          </button>
        </div>
      </div>

      <div className="max-h-[min(520px,65vh)] overflow-y-auto p-2 bg-[var(--wd-bg,#fff)]">
        {loading ? (
          <div className="px-3 py-10 text-center text-[11px] text-[color:var(--wd-text-muted,#94a3b8)]">{label("common.loading")}</div>
        ) : notes.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--wd-panel-2,#F3F6FB)] text-[color:var(--wd-text-muted,#94a3b8)]">
              <Icons.bell size={17} />
            </div>
            <p className="mt-3 text-[12px] font-semibold text-[color:var(--wd-text,#334155)]">{label("notif.empty")}</p>
            <p className="mt-1 text-[10.5px] text-[color:var(--wd-text-muted,#94a3b8)]">
              {locale === "ar" ? "ستظهر هنا تنبيهات مشاركة الملفات وسير العمل." : "File sharing and workflow alerts will appear here."}
            </p>
          </div>
        ) : (
          notes.slice(0, 20).map((n) => (
            <div
              key={n.id}
              className={`mb-1 last:mb-0 rounded-md px-3 py-3 transition hover:bg-[var(--wd-hover,#f8fafc)] ${n.readAt ? "" : "bg-[var(--wd-panel-2,#F5F8FF)]"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.readAt ? "bg-[var(--wd-panel-2,#f1f5f9)] text-[color:var(--wd-text-muted,#94a3b8)]" : "bg-[var(--wd-primary-light,#EEF4FF)] text-[color:var(--wd-primary-ink,#1B66EA)]"}`}>
                  <Icons.bell size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium leading-5 text-[color:var(--wd-text,#1e293b)]">{n.title}</p>
                  {n.body ? <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-5 text-[color:var(--wd-text-muted,#64748b)]">{n.body}</p> : null}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <time className="text-[9.5px] text-[color:var(--wd-text-muted,#94a3b8)]">{formatDateLocalized(n.createdAt, locale)}</time>
                    {!n.readAt ? (
                      <button type="button" onClick={() => void markRead(n.id)} className="text-[10px] font-medium text-[color:var(--wd-primary-ink,#1B66EA)] hover:underline">
                        {label("notif.markRead")}
                      </button>
                    ) : null}
                  </div>
                </div>
                {!n.readAt ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--wd-primary,#1B66EA)]" aria-label="New" /> : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[color:var(--wd-line,#e5e7eb)] p-2 bg-[var(--wd-bg,#fff)]">
        <Link
          href="/notifications"
          onClick={onClose}
          className="flex min-h-[34px] items-center justify-center rounded-md px-3 text-[11px] font-semibold text-[color:var(--wd-primary-ink,#1B66EA)] hover:bg-[var(--wd-hover,#F5F8FF)]"
        >
          {locale === "ar" ? "عرض كل الإشعارات" : "View all notifications"}
        </Link>
      </div>
    </div>
  );
}
