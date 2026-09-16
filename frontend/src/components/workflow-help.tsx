"use client";

import { useState } from "react";
import { useLocale } from "./locale-provider";
import { WORKFLOW_HELP, type WorkflowHelpKey } from "./workflow-help-registry";

export function WorkflowHelp({ compact = false, title, description, tips, helpKey }: { compact?: boolean; title?: string; description?: string; tips?: string[]; helpKey?: WorkflowHelpKey }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const entry = helpKey ? WORKFLOW_HELP[helpKey][ar ? "ar" : "en"] : null;
  const helpTitle = title ?? entry?.title ?? (ar ? "كيف تعمل مساحة سير العمل؟" : "How does this workflow area work?");
  const helpDescription = description ?? entry?.description ?? (ar ? "تعرف على وظيفة هذه الواجهة قبل إعدادها." : "Learn what this area does before configuring it.");
  const helpTips = tips ?? entry?.tips ?? [];
  return <>
    <button type="button" onClick={() => setOpen(true)} className={`${compact ? "wd-icon-btn h-9 w-9" : "wd-pill wd-pill-record"} workflow-help-button`} aria-label={ar ? "مساعدة" : "Help"}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold">?</span>{!compact && <span>{ar ? "مساعدة" : "Help"}</span>}
    </button>
    {open ? <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={() => setOpen(false)}>
      <div className="w-[min(620px,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#1B66EA]">{ar ? "دليل سريع" : "Quick guide"}</div><h2 className="mt-1 text-[17px] font-semibold text-slate-900">{helpTitle}</h2><p className="mt-1 text-[10.5px] leading-5 text-slate-500">{helpDescription}</p></div><button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          {(entry?.steps ?? [ar ? "راجع الحقول والحالات والانتقالات ثم فعّل بعد المراجعة." : "Review fields, states and transitions before activation."]).map((step, i) => <div key={i} className="wd-card p-4"><div className="text-[12px] font-semibold text-slate-900">{i + 1}. {ar ? "خطوة" : "Step"}</div><p className="mt-1.5 text-[11px] leading-5 text-slate-600">{step}</p></div>)}
          {helpTips.length ? <div className="sm:col-span-2 wd-card p-4"><div className="text-[10px] font-semibold text-[#1B66EA]">{ar ? "نصائح" : "Tips"}</div><ul className="mt-2 space-y-1.5 text-[10.5px] leading-5 text-slate-600">{helpTips.map((tip, i) => <li key={i}>• {tip}</li>)}</ul></div> : null}</div>
      </div>
    </div> : null}
  </>;
}
