"use client";

import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { useLocale } from "./locale-provider";
import { getDlpLabels, type DlpLabel } from "../lib/api/enterprise";
import { addDlpLabel } from "../lib/api/files";

type Target = { type: "FILE" | "FOLDER"; id: string; name: string };

/**
 * Assign a manual DLP classification label to a file so policy actions
 * (block share/download, warn, watermark) apply immediately.
 */
export function DlpClassifyModal({
  target,
  onClose,
  onChanged,
}: {
  target: Target;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [labels, setLabels] = useState<DlpLabel[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void getDlpLabels()
      .then((rows) => {
        if (!live) return;
        // Manual labels only for explicit assignment
        setLabels(rows.filter((l) => l.manualOnly !== false || true).filter((l) => l.manualOnly !== false ? true : l.manualOnly === true));
        // Prefer manual-only; if API marks automatic, still allow listing all for admin override display
        const manual = rows.filter((l) => l.manualOnly);
        setLabels(manual.length ? manual : rows);
      })
      .catch(() => {
        if (live) setError(ar ? "تعذر تحميل التصنيفات." : "Unable to load classification labels.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [ar]);

  async function assign(labelId: string) {
    if (target.type !== "FILE") {
      setError(ar ? "التصنيف يُطبَّق على الملفات فقط." : "Classification applies to files only.");
      return;
    }
    setBusy(labelId);
    setError("");
    try {
      await addDlpLabel(target.id, labelId);
      onChanged?.();
      onClose();
    } catch {
      setError(ar ? "تعذر تعيين التصنيف. تأكد أنه تصنيف يدوي." : "Unable to assign classification. Ensure the label is manual-only.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      title={ar ? `إضافة تصنيف — ${target.name}` : `Add classification — ${target.name}`}
      onClose={onClose}
      closeLabel={ar ? "إغلاق" : "Close"}
    >
      <div className="space-y-3 p-1">
        <p className="text-[12px] leading-5 text-slate-600">
          {ar
            ? "اختر تصنيفاً يدوياً لتطبيق سياسات منع فقدان البيانات (منع المشاركة/التنزيل أو التحذير)."
            : "Choose a manual classification label to enforce DLP policy actions (block share/download or warn)."}
        </p>
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}
        {loading ? (
          <div className="py-8 text-center text-[12px] text-slate-500">{ar ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : labels.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-500">
            {ar ? "لا توجد تصنيفات يدوية. أنشئ تصنيفاً من لوحة منع فقدان البيانات." : "No manual labels yet. Create one in Data Loss Prevention."}
          </div>
        ) : (
          <ul className="max-h-[320px] space-y-1 overflow-y-auto">
            {labels.map((label) => (
              <li key={label.id}>
                <button
                  type="button"
                  disabled={busy === label.id || target.type !== "FILE"}
                  onClick={() => void assign(label.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-start hover:border-[color:var(--wd-primary)] hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: label.color || "#2c66dd" }} />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13px]">{label.name}</strong>
                    {label.description ? <span className="block truncate text-[11px] text-slate-500">{label.description}</span> : null}
                  </span>
                  <span className="text-[11px] text-slate-400">{busy === label.id ? (ar ? "…" : "…") : (ar ? "تعيين" : "Assign")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
