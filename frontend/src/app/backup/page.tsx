"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import {
  createBackupPolicy,
  getBackupOverview,
  listBackupPolicies,
  listBackupRunObjects,
  listBackupRuns,
  startFullBackup,
  type BackupObject,
  type BackupOverview,
  type BackupPolicy,
  type BackupRun,
} from "@/lib/api/backup";

function formatBytes(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function statusTone(status: string): string {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "RUNNING" || status === "PENDING") return "bg-sky-50 text-sky-700";
  if (status === "FAILED") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export default function BackupPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);

  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [policies, setPolicies] = useState<BackupPolicy[]>([]);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [objects, setObjects] = useState<BackupObject[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    setError("");
    try {
      const [ov, pol, runList] = await Promise.all([getBackupOverview(), listBackupPolicies(), listBackupRuns(40)]);
      setOverview(ov);
      setPolicies(pol);
      setRuns(runList);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Unable to load backup center", "تعذر تحميل مركز النسخ الاحتياطي"));
    }
  }, [ar]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, 8000);
    return () => window.clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!selectedRun) {
      setObjects([]);
      return;
    }
    void listBackupRunObjects(selectedRun)
      .then(setObjects)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load objects"));
  }, [selectedRun]);

  const onEnsurePolicy = async () => {
    setBusy(true);
    setError("");
    try {
      await createBackupPolicy({
        name: t("Default backup policy", "سياسة النسخ الافتراضية"),
        scope: "ALL",
        scheduleKind: "MANUAL",
        retentionDays: 30,
      });
      setMessage(t("Policy created", "تم إنشاء السياسة"));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not create policy", "تعذر إنشاء السياسة"));
    } finally {
      setBusy(false);
    }
  };

  const onStartFull = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const run = await startFullBackup(policies[0]?.id);
      setMessage(t(`Full backup started (${run.id.slice(0, 8)}…)`, `بدأ النسخ الكامل (${run.id.slice(0, 8)}…)`));
      setSelectedRun(run.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not start backup", "تعذر بدء النسخ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8" dir={ar ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            {t("Data protection", "حماية البيانات")}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold text-[#111827]">
            {t("Backup & Recovery", "النسخ الاحتياطي والاستعادة")}
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#4b5563]">
            {t(
              "Organization-scoped backups, isolated from the day-to-day Admin Console. Full snapshots index your files into a protected backup namespace with integrity digests.",
              "نسخ احتياطي على مستوى المنظمة، منفصل عن لوحة إدارة الفريق اليومية. اللقطات الكاملة تفهرس ملفاتك في مساحة نسخ محمية مع بصمات سلامة.",
            )}
          </p>
        </div>
        <Link href="/files" className="rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f9fafb]">
          {t("Back to files", "العودة إلى الملفات")}
        </Link>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{message}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t("Policies", "السياسات"), overview?.policies ?? "—"],
          [t("Runs", "عمليات النسخ"), overview?.runs ?? "—"],
          [
            t("Last success", "آخر نجاح"),
            overview?.lastSuccessfulRun?.finishedAt
              ? new Date(overview.lastSuccessfulRun.finishedAt).toLocaleString(ar ? "ar" : "en")
              : "—",
          ],
          [
            t("Active job", "مهمة نشطة"),
            overview?.activeRun ? overview.activeRun.status : t("None", "لا يوجد"),
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
            <div className="text-[11px] font-medium text-[#6b7280]">{label}</div>
            <div className="mt-2 truncate text-[18px] font-semibold text-[#111827]">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111827]">{t("Actions", "إجراءات")}</h2>
            <p className="mt-1 text-[12px] text-[#6b7280]">
              {t("Phase 1: full backup + policy management. Restore UI follows in the next phase.", "المرحلة 1: نسخ كامل وإدارة السياسات. واجهة الاستعادة في المرحلة التالية.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnsurePolicy()}
              className="rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-[12px] font-semibold text-[#374151] disabled:opacity-50"
            >
              {t("Create default policy", "إنشاء سياسة افتراضية")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onStartFull()}
              className="rounded-full bg-[#0b63e5] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {t("Run full backup now", "تشغيل نسخ كامل الآن")}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-[#111827]">{t("Policies", "السياسات")}</h2>
          <ul className="mt-4 space-y-3">
            {policies.length === 0 ? (
              <li className="text-[13px] text-[#9ca3af]">{t("No policies yet.", "لا توجد سياسات بعد.")}</li>
            ) : (
              policies.map((p) => (
                <li key={p.id} className="rounded-xl border border-[#eef0f3] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-[#111827]">{p.name}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.enabled ? t("Enabled", "مفعّلة") : t("Disabled", "متوقفة")}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#6b7280]">
                    {p.scope} · {p.scheduleKind}
                    {p.retentionDays != null ? ` · ${p.retentionDays}d` : ""}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-[#111827]">{t("Recent runs", "أحدث العمليات")}</h2>
          <ul className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
            {runs.length === 0 ? (
              <li className="text-[13px] text-[#9ca3af]">{t("No runs yet.", "لا توجد عمليات بعد.")}</li>
            ) : (
              runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRun(r.id)}
                    className={`flex w-full flex-col rounded-xl border px-3 py-3 text-start transition ${selectedRun === r.id ? "border-[#0b63e5] bg-[#f5f9ff]" : "border-[#eef0f3] hover:bg-[#fafafa]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[#111827]">{r.kind}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(r.status)}`}>{r.status}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[#6b7280]">
                      {r.filesCopied}/{r.filesTotal} {t("files", "ملف")} · {formatBytes(r.bytesCopied)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#9ca3af]">
                      {new Date(r.createdAt).toLocaleString(ar ? "ar" : "en")}
                    </div>
                    {r.errorMessage ? <div className="mt-1 text-[11px] text-rose-600">{r.errorMessage}</div> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {selectedRun ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[#111827]">
              {t("Snapshot contents", "محتوى اللقطة")}
            </h2>
            <button type="button" className="text-[12px] text-[#6b7280]" onClick={() => setSelectedRun(null)}>
              {t("Close", "إغلاق")}
            </button>
          </div>
          <div className="mt-4 max-h-[420px] overflow-auto">
            <table className="min-w-full text-start text-[12px]">
              <thead className="sticky top-0 bg-white text-[#6b7280]">
                <tr>
                  <th className="px-2 py-2 font-medium">{t("Path", "المسار")}</th>
                  <th className="px-2 py-2 font-medium">{t("Size", "الحجم")}</th>
                </tr>
              </thead>
              <tbody>
                {objects.map((o) => (
                  <tr key={o.id} className="border-t border-[#f0f1f3]">
                    <td className="px-2 py-2 text-[#111827]">{o.path}</td>
                    <td className="px-2 py-2 text-[#6b7280]">{formatBytes(o.size)}</td>
                  </tr>
                ))}
                {objects.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-2 py-6 text-center text-[#9ca3af]">
                      {t("No indexed objects yet (run may still be in progress).", "لا توجد عناصر مفهرسة بعد (قد تكون العملية لا تزال جارية).")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
