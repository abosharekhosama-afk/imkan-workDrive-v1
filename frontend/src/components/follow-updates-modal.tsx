"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { followResource, listFollows, unfollowResource, updateFollowPreferences, type FollowPreferences, type FollowRecord } from "../lib/api/follows";
import type { ResourceType } from "../lib/api/types";

export type FollowTarget = { type: ResourceType; id: string; name: string };
type NotificationMode = "bell" | "email" | "both";

export function FollowUpdatesModal({ targets, onClose, onChanged }: { targets: FollowTarget[]; onClose: () => void; onChanged?: (messageKey?: "follow.started" | "follow.stopped", name?: string) => void }) {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const [mode, setMode] = useState<NotificationMode>("both");
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
        const bell = selected.every((r) => r.notifyBell);
        const email = selected.every((r) => r.notifyEmail);
        setMode(bell && email ? "both" : email ? "email" : "bell");
      }
    }).catch(() => undefined).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [keys.join("|")]);

  async function save() {
    setBusy(true); setError(null);
    try {
      const preferences: FollowPreferences = { notifyBell: mode !== "email", notifyEmail: mode !== "bell" };
      await Promise.all(targets.map((target) => existing.has(`${target.type}:${target.id}`)
        ? updateFollowPreferences(target.type, target.id, preferences)
        : followResource(target.type, target.id, preferences)));
      onChanged?.("follow.started", targets.length === 1 ? targets[0].name : undefined);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : label("error.generic")); }
    finally { setBusy(false); }
  }
  async function unfollow() {
    setBusy(true); setError(null);
    try {
      await Promise.all(targets.map((target) => unfollowResource(target.type, target.id)));
      onChanged?.("follow.stopped", targets.length === 1 ? targets[0].name : undefined); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : label("error.generic")); }
    finally { setBusy(false); }
  }

  const options: { value: NotificationMode; title: string; detail: string }[] = [
    { value: "bell", title: ar ? "إشعارات داخل المنتج" : "Bell notifications (within product)", detail: ar ? "إشعارات داخل WorkDrive" : "Get notifications in WorkDrive" },
    { value: "email", title: ar ? "إشعارات البريد الإلكتروني" : "Email notifications", detail: ar ? "استلام التحديثات عبر البريد الإلكتروني" : "Receive updates by email" },
    { value: "both", title: ar ? "إشعارات الجرس والبريد الإلكتروني" : "Both bell and email notifications", detail: ar ? "استلام الإشعارات داخل المنتج وعبر البريد" : "Get updates in product and by email" },
  ];
  return (
    <Modal title={<span className="flex min-w-0 items-center gap-5"><span className="shrink-0">{ar ? "متابعة التحديثات" : "Follow updates"}</span>{targets.length === 1 ? <span className="max-w-[260px] truncate text-[13px] font-normal text-slate-600">{targets[0].name}</span> : null}</span>} onClose={onClose} className="w-full max-w-[592px]" footer={
      <div className="flex w-full items-center justify-between gap-3">
        <div>{allExisting ? <button type="button" disabled={busy} onClick={() => void unfollow()} className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-50">{ar ? "إيقاف المتابعة" : "Stop Following"}</button> : null}</div>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={onClose} className="imkan-button-secondary">{ar ? "إلغاء" : "Cancel"}</button><button type="button" disabled={busy || loading} onClick={() => void save()} className="imkan-button">{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : allExisting ? (ar ? "حفظ" : "Save") : (ar ? "بدء المتابعة" : "Start Following")}</button></div>
      </div>
    }>
      <div className="space-y-5">
        {targets.length > 1 ? <div className="text-[13px] font-medium text-slate-700">{ar ? `${targets.length} عناصر محددة` : `${targets.length} selected items`}</div> : null}
        <div className="flex gap-3 rounded-xl bg-[#f5f6f7] px-4 py-4 text-[12px] leading-[1.55] text-slate-600">
          <span className="mt-0.5 shrink-0 text-[17px] text-slate-700" aria-hidden="true">ⓘ</span>
          <p>{ar ? "احصل على إشعارات فورية عندما يُجري أحدهم تغييرات على الملف. ستظهر الملفات والمجلدات التي تتابعها في قسم Labels ضمن تصنيف «Following»." : <>Get instant notifications when someone makes changes to the file. Files and folders you follow will be listed in the Labels section under the label "Following". <a href="https://help.zoho.com/portal/en/kb/workdrive" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Learn more about following files and folders</a></>}</p>
        </div>
        <fieldset>
          <legend className="mb-3 text-[13px] font-medium text-slate-700">{ar ? "اختر تفضيلات الإشعارات" : "Choose your notification preference"}</legend>
          <div className="space-y-3">
            {options.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 text-[13px] text-slate-700">
              <input type="radio" name="follow-notification-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-0.5 h-4 w-4 accent-blue-600" />
              <span>{option.title}</span>
            </label>)}
          </div>
        </fieldset>
        {loading ? <div className="text-[11px] text-slate-500">{ar ? "جارٍ تحميل التفضيلات…" : "Loading preferences…"}</div> : null}
        {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div> : null}
      </div>
    </Modal>
  );
}
