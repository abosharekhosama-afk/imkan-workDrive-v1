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
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={compact ? "wf-primary-button h-9 w-9 !min-h-9 !p-0" : "wf-primary-button"}
      aria-label={ar ? "مساعدة" : "Help"}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[12px] font-bold leading-none">?</span>
      {!compact && <span>{ar ? "مساعدة" : "Help"}</span>}
    </button>
    {open ? (
      /* Same modal surface as every Files-UI dialog (.imkan-modal-backdrop / .imkan-modal-surface). */
      <div
        className="imkan-modal-backdrop z-[220] p-4"
        role="presentation"
        onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      >
        <div role="dialog" aria-modal="true" aria-label={helpTitle} className="imkan-modal-surface max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--wd-line)] px-4 py-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--wd-primary-ink)]">{ar ? "دليل سريع" : "Quick guide"}</div>
              <h2 className="imkan-heading mt-1">{helpTitle}</h2>
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--wd-text-muted)]">{helpDescription}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="wf-icon-button shrink-0" aria-label={ar ? "إغلاق" : "Close"}>×</button>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {(entry?.steps ?? [ar ? "راجع الحقول والحالات والانتقالات ثم فعّل بعد المراجعة." : "Review fields, states and transitions before activation."]).map((step, i) => (
              <div key={i} className="wf-card p-4">
                <div className="text-[13px] font-bold text-[color:var(--wd-text)]">{i + 1}. {ar ? "خطوة" : "Step"}</div>
                <p className="mt-1.5 text-[12.5px] text-[color:var(--wd-text-muted)]">{step}</p>
              </div>
            ))}
            {helpTips.length ? (
              <div className="wf-card p-4">
                <div className="text-[12px] font-bold text-[color:var(--wd-primary-ink)]">{ar ? "نصائح" : "Tips"}</div>
                <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-5 text-[color:var(--wd-text-muted)]">{helpTips.map((tip, i) => <li key={i}>• {tip}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
  </>;
}
