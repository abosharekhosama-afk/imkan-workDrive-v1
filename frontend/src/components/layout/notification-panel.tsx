"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { listNotifications, markNotificationRead, type NotificationRecord } from "../../lib/api/notifications";
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
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  };

  const markAllRead = () => {
    notes.filter((n) => !n.readAt).forEach((n) => void markRead(n.id));
  };

  if (!open) return null;

  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <div
      ref={ref}
      className="fixed right-0 top-12 z-[80] w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <span className="text-[13px] font-semibold text-slate-800">
          {label("nav.notifications")}
        </span>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[11.5px] text-[#1B66EA] hover:underline"
            >
              {label("notif.markAllRead")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            aria-label="close"
          >
            <Icons.x size={15} />
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="p-3 text-center text-[13px] text-slate-400">
            {label("common.loading")}
          </div>
        ) : notes.length === 0 ? (
          <div className="p-4 text-center text-[13px] text-slate-400">
            {label("notif.empty")}
          </div>
        ) : (
          notes.map((n: NotificationRecord) => (
            <div
              key={n.id}
              className={`border-b border-slate-50 px-3 py-2.5 hover:bg-slate-50 ${
                n.readAt ? "" : "bg-[#EEF3FD]"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Icons.bell
                  size={16}
                  className={
                    "mt-0.5 shrink-0 " +
                    (n.readAt ? "text-slate-300" : "text-[#1B66EA]")
                  }
                />
                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] text-slate-800">{n.body ?? n.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-400">
                    {formatDateLocalized(n.createdAt, locale)}
                  </p>
                </div>
                {!n.readAt && (
                  <div className="shrink-0 rounded-full bg-[#1B66EA] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    New
                  </div>
                )}
              </div>
              {!n.readAt && (
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="text-[11.5px] text-slate-400 hover:text-slate-600"
                  >
                    {label("notif.markRead")}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {unread > 0 && (
        <div className="border-t border-slate-100 px-3 py-2 text-[12px] text-slate-500">
          {unread} {label("notif.unreadCount")}
        </div>
      )}
    </div>
  );
}