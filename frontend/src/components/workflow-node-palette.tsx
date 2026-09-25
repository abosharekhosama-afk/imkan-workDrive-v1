"use client";

import { useMemo, useState } from "react";

export type WorkflowPaletteNode =
  | "trigger"
  | "action"
  | "condition"
  | "approval"
  | "http_request"
  | "custom_function"
  | "import_file"
  | "end";

type PaletteItem = {
  type: WorkflowPaletteNode;
  category: "core" | "integration" | "flow";
  icon: string;
  en: string;
  ar: string;
  descriptionEn: string;
  descriptionAr: string;
  disabled?: boolean;
  disabledReasonEn?: string;
  disabledReasonAr?: string;
};

const ITEMS: PaletteItem[] = [
  { type: "trigger", category: "core", icon: "▶", en: "Trigger", ar: "محفز", descriptionEn: "Configure how the workflow starts.", descriptionAr: "اضبط كيفية بدء سير العمل." },
  { type: "action", category: "flow", icon: "⚡", en: "Action", ar: "إجراء", descriptionEn: "Run a WorkDrive action on transition.", descriptionAr: "تنفيذ إجراء WorkDrive على الانتقال." },
  { type: "condition", category: "flow", icon: "◇", en: "Condition", ar: "شرط", descriptionEn: "Branch using file/workflow rules.", descriptionAr: "تفرع باستخدام قواعد الملف أو سير العمل." },
  { type: "approval", category: "flow", icon: "✓", en: "Approval", ar: "موافقة", descriptionEn: "Wait for a manual approval step.", descriptionAr: "انتظار خطوة موافقة يدوية." },
  { type: "http_request", category: "integration", icon: "↗", en: "HTTP Request", ar: "طلب HTTP", descriptionEn: "Call an external API using a connection.", descriptionAr: "استدعاء API خارجي عبر اتصال." },
  { type: "custom_function", category: "integration", icon: "ƒ", en: "Custom Function", ar: "دالة مخصصة", descriptionEn: "Run a published safe function.", descriptionAr: "تشغيل دالة آمنة منشورة." },
  { type: "import_file", category: "integration", icon: "☁", en: "Import External File", ar: "استيراد ملف خارجي", descriptionEn: "Read a file from Google Drive, Dropbox, or OneDrive.", descriptionAr: "قراءة ملف من Google Drive أو Dropbox أو OneDrive." },
  { type: "end", category: "core", icon: "■", en: "End", ar: "نهاية", descriptionEn: "Terminal workflow state.", descriptionAr: "حالة نهائية لسير العمل." },
];

export function WorkflowNodePalette({
  ar,
  onAdd,
  manualMode = false,
}: {
  ar: boolean;
  onAdd: (type: WorkflowPaletteNode) => void;
  manualMode?: boolean;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.map((item) => ({
      ...item,
      disabled: item.type === "trigger" && manualMode ? false : item.disabled,
    })).filter((item) => !q || `${item.en} ${item.ar} ${item.descriptionEn}`.toLowerCase().includes(q));
  }, [query, manualMode]);

  const grouped = useMemo(() => {
    const order: PaletteItem["category"][] = ["core", "flow", "integration"];
    return order.map((category) => ({ category, items: items.filter((item) => item.category === category) })).filter((group) => group.items.length);
  }, [items]);

  const label = (item: PaletteItem) => (ar ? item.ar : item.en);
  const description = (item: PaletteItem) => (ar ? item.descriptionAr : item.descriptionEn);

  return (
    <div className="workflow-node-palette flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{ar ? "عناصر سير العمل" : "Node palette"}</div>
        <p className="mt-1 text-[9px] leading-4 text-slate-500">{ar ? "انقر للإضافة أو اسحب إلى اللوحة." : "Click to add or drag onto the canvas."}</p>
        <label className="workflow-picker-search mt-2 block">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث في العناصر" : "Search nodes"} aria-label={ar ? "بحث في العناصر" : "Search nodes"} />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {grouped.map((group) => (
          <div key={group.category}>
            <div className="px-1 pb-1 text-[8.5px] font-semibold uppercase tracking-[.14em] text-slate-400">
              {group.category === "core" ? (ar ? "أساسي" : "Core") : group.category === "flow" ? (ar ? "تدفق" : "Flow") : (ar ? "تكامل" : "Integration")}
            </div>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  draggable={!item.disabled}
                  disabled={item.disabled}
                  onDragStart={(event) => {
                    if (item.disabled) return;
                    event.dataTransfer.setData("application/x-imkan-workflow-node", item.type);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => { if (!item.disabled) onAdd(item.type); }}
                  className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-start transition ${item.disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:border-[var(--wd-primary)] hover:bg-[var(--wd-primary-light)]"}`}
                  title={item.disabled ? (ar ? item.disabledReasonAr : item.disabledReasonEn) : undefined}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold text-slate-700">{label(item)}</span>
                    <span className="block text-[8px] leading-4 text-slate-400">{description(item)}</span>
                    {item.disabled ? <span className="mt-1 block text-[8px] text-amber-700">{ar ? item.disabledReasonAr : item.disabledReasonEn}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
