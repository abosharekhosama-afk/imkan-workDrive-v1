"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { followResource, listFollows, unfollowResource, updateFollowPreferences, type FollowPreferences, type FollowRecord } from "../lib/api/follows";
import type { ResourceType } from "../lib/api/types";

export type FollowTarget = { type: ResourceType; id: string; name: string };

export function FollowUpdatesModal({ targets, onClose, onChanged }: { targets: FollowTarget[]; onClose: () => void; onChanged?: () => void }) {
  const { locale } = useLocale();
  const [bell, setBell] = useState(true);
  const [email, setEmail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<Map<string, FollowRecord>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const keys = useMemo(() => targets.map((t) => `${t.type}:${t.id}`), [targets]);
  const allExisting = targets.length > 0 && targets.every((t) => existing.has(`${t.type}:${t.id}`));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listFollows().then((rows) => {
      if (cancelled) return;
      const next = new Map(rows.map((row) => [`${row.resourceType}:${row.resourceId}`, row]));
      setExisting(next);
      const selected = targets.map((t) => next.get(`${t.type}:${t.id}`)).filter(Boolean) as FollowRecord[];
      if (selected.length) {
        setBell(selected.every((r) => r.notifyBell));
        setEmail(selected.every((r) => r.notifyEmail));
      }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [keys.join("|")]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const preferences: FollowPreferences = { notifyBell: bell, notifyEmail: email };
      await Promise.all(targets.map((target) => existing.has(`${target.type}:${target.id}`)
        ? updateFollowPreferences(target.type, target.id, preferences)
        : followResource(target.type, target.id, preferences)));
      onChanged?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ar" ? "تعذر حفظ المتابعة" : "Could not save follow settings"));
    } finally { setBusy(false); }
  }

  async function unfollow() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(targets.map((target) => unfollowResource(target.type, target.id)));
      onChanged?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ar" ? "تعذر إيقاف المتابعة" : "Could not unfollow"));
    } finally { setBusy(false); }
  }

  const title = locale === "ar" ? "متابعة التحديثات" : "Follow Updates";
  const description = targets.length === 1
    ? (locale === "ar" ? `ستتلقى إشعارات عند تحديث «${targets[0].name}».` : `Get notified when “${targets[0].name}” is updated.`)
    : (locale === "ar" ? `تطبيق إعدادات المتابعة على ${targets.length} عناصر.` : `Apply follow settings to ${targets.length} selected items.`);

  return (
    <Modal title={title} onClose={onClose} className="w-full max-w-[520px]" footer={
      <div className="flex w-full items-center justify-between gap-2">
        <div>{allExisting ? <button type="button" disabled={busy} onClick={() => void unfollow()} className="text-[12px] font-medium text-red-600 disabled:opacity-50">{locale === "ar" ? "إيقاف المتابعة" : "Unfollow"}</button> : null}</div>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="imkan-button-secondary">{locale === "ar" ? "إلغاء" : "Cancel"}</button><button type="button" disabled={busy || loading || (!bell && !email)} onClick={() => void save()} className="imkan-button">{busy ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : allExisting ? (locale === "ar" ? "تحديث الإعدادات" : "Update settings") : (locale === "ar" ? "بدء المتابعة" : "Start following")}</button></div>
      </div>
    }>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-600">{description}</div>
        <div>
          <div className="mb-2 text-[12px] font-semibold text-slate-800">{locale === "ar" ? "طريقة الإشعار" : "Notification preference"}</div>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={bell} onChange={(e) => setBell(e.target.checked)} /><span><span className="block text-[12px] font-medium text-slate-800">{locale === "ar" ? "إشعارات داخل النظام" : "Bell notifications"}</span><span className="block text-[10px] text-slate-500">{locale === "ar" ? "تظهر فورًا في جرس الإشعارات." : "Show instant notifications in WorkDrive."}</span></span></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><span><span className="block text-[12px] font-medium text-slate-800">{locale === "ar" ? "البريد الإلكتروني" : "Email notifications"}</span><span className="block text-[10px] text-slate-500">{locale === "ar" ? "يرسل البريد عند توفر إعداد بريد المؤسسة." : "Send email when the organization's email service is configured."}</span></span></label>
          </div>
        </div>
        {loading ? <div className="text-[11px] text-slate-500">{locale === "ar" ? "جارٍ تحميل إعدادات المتابعة…" : "Loading follow settings…"}</div> : null}
        {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
