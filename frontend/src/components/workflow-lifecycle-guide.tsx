"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function WorkflowLifecycleGuide({
  ar,
  mode,
  resourceType,
  name,
  trigger,
  states,
  active = false,
  compact = false,
  children,
}: {
  ar: boolean;
  mode: "MANUAL" | "AUTOMATIC";
  resourceType: "FILE" | "FOLDER";
  name?: string;
  trigger?: string;
  states: Array<{ name: string; terminal?: boolean }>;
  active?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const first = states[0]?.name || (ar ? "الخطوة الأولى" : "First step");
  const rest = states.slice(1);
  const triggerLabels: Record<string, string> = {
    upload: ar ? "رفع ملف" : "a file is uploaded",
    create: ar ? "إنشاء ملف أو مجلد" : "a file or folder is created",
    move: ar ? "نقل ملف أو مجلد" : "a file or folder is moved",
    copy: ar ? "نسخ ملف أو مجلد" : "a file or folder is copied",
    rename: ar ? "إعادة تسمية ملف" : "a file is renamed",
    delete: ar ? "نقل ملف إلى السلة" : "a file is moved to trash",
    properties_updated: ar ? "تحديث الخصائص" : "properties are updated",
    ready: ar ? "تعليم الملف كجاهز" : "a file is marked as ready",
  };
  const triggerText = triggerLabels[trigger || ""] || trigger || (ar ? "الحدث المحدد في الإعدادات" : "the configured event");
  const resource = resourceType === "FILE" ? (ar ? "الملف" : "file") : (ar ? "المجلد" : "folder");

  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4" : "p-5"}`} dir={ar ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#1B66EA]">{ar ? "كيف يعمل سير العمل" : "How this workflow works"}</div>
        <h3 className="mt-1 text-[14px] font-semibold text-slate-900">{name || (ar ? "سير العمل" : "Workflow")}</h3>
        <p className="mt-1 max-w-[760px] text-[10.5px] leading-5 text-slate-500">
          {mode === "MANUAL"
            ? (ar ? `يبدأ المستخدم هذا السير من قائمة إجراءات ${resource}.` : `A user starts this workflow from the ${resource} actions menu.`)
            : (ar ? `يبدأ تلقائياً عندما يحدث ${triggerText}.` : `It starts automatically when ${triggerText} happens.`)}
        </p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[8.5px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {active ? (ar ? "فعال" : "Active") : (ar ? "مسودة" : "Draft")}
      </span>
    </div>

    <div className="mt-4 overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-2">
        <div className="rounded-xl border border-[#BFD4FF] bg-[#F7FAFF] px-3 py-2.5">
          <div className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#1B66EA]">{mode === "MANUAL" ? (ar ? "ابدأ" : "Start") : (ar ? "المحفز" : "Trigger")}</div>
          <div className="mt-1 text-[10.5px] font-semibold text-slate-800">{mode === "MANUAL" ? (ar ? "من قائمة إجراءات المورد" : "From resource actions") : triggerText}</div>
        </div>
        {states.map((state, i) => <div key={`${state.name}-${i}`} className="flex items-center gap-2">
          <span className="text-slate-300">→</span>
          <div className={`rounded-xl border px-3 py-2.5 ${state.terminal ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
            <div className="text-[8px] font-semibold uppercase tracking-[.12em] text-slate-400">{state.terminal ? (ar ? "نهاية" : "End") : (ar ? `الخطوة ${i + 1}` : `Step ${i + 1}`)}</div>
            <div className="mt-1 text-[10.5px] font-semibold text-slate-800">{state.name}</div>
          </div>
        </div>)}
      </div>
    </div>

    <div className="mt-4 grid gap-2 md:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="text-[8.5px] font-semibold uppercase tracking-[.12em] text-slate-400">{ar ? "كيف يبدأ؟" : "How it starts"}</div>
        <p className="mt-1.5 text-[9.5px] leading-4 text-slate-600">{mode === "MANUAL" ? (ar ? `حدد ${resource} ثم افتح ⋮ ← Workflows واختر هذا السير.` : `Select the ${resource}, open ⋮ → Workflows, then choose this workflow.`) : (ar ? `لا تحتاج إلى تشغيله يدوياً؛ سيبدأ عند تحقق المحفز.` : "You do not need to start it manually; it runs when the trigger matches.")}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="text-[8.5px] font-semibold uppercase tracking-[.12em] text-slate-400">{ar ? "ماذا يحدث أولاً؟" : "What happens first"}</div>
        <p className="mt-1.5 text-[9.5px] leading-4 text-slate-600">{ar ? `ينتقل التشغيل إلى «${first}» ثم ينفذ الإجراءات والانتقالات المحددة.` : `The run enters “${first}” and follows its configured actions and transitions.`}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="text-[8.5px] font-semibold uppercase tracking-[.12em] text-slate-400">{ar ? "ماذا بعد ذلك؟" : "What happens next"}</div>
        <p className="mt-1.5 text-[9.5px] leading-4 text-slate-600">{rest.length ? (ar ? `بعدها ينتقل بين ${rest.length} حالة حتى يصل إلى النهاية أو يتوقف بانتظار إجراء.` : `It moves through ${rest.length} more state${rest.length === 1 ? "" : "s"} until completion or a waiting task.`) : (ar ? "ستظهر هنا الخطوة التالية بعد إضافة حالات وانتقالات." : "The next step will appear here after you add states and transitions.")}</p>
      </div>
    </div>
    {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
  </section>;
}

export function WorkflowStartHint({ ar, mode, resourceType, onClose }: { ar: boolean; mode: "MANUAL" | "AUTOMATIC"; resourceType: "FILE" | "FOLDER"; onClose?: () => void }) {
  const resource = resourceType === "FILE" ? (ar ? "الملف" : "file") : (ar ? "المجلد" : "folder");
  return <div className="rounded-xl border border-[#BFD4FF] bg-[#F7FAFF] p-3.5" dir={ar ? "rtl" : "ltr"}>
    <div className="flex items-start gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EAF1FF] text-[#1B66EA]">i</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold text-slate-800">{mode === "MANUAL" ? (ar ? "كيف تبدأ هذا السير؟" : "How to start this workflow") : (ar ? "كيف يبدأ هذا السير؟" : "How this workflow starts")}</div>
        <p className="mt-1 text-[9.5px] leading-5 text-slate-600">{mode === "MANUAL" ? (ar ? `حدد ${resource} من Files، ثم افتح قائمة ⋮ واختر Workflows ثم اسم السير. بعد ذلك أدخل المشاركين واضغط Start.` : `In Files, select the ${resource}, open ⋮ → Workflows, choose this workflow, enter any required participants, then press Start.`) : (ar ? "لا تحتاج إلى تشغيله يدوياً. عند تحقق المحفز والشروط، سيبدأ التشغيل تلقائياً." : "You do not start it manually. When the trigger and conditions match, a run starts automatically.")}</p>
        {onClose && <button type="button" onClick={onClose} className="mt-2 text-[9px] font-semibold text-[#1B66EA]">{ar ? "إخفاء" : "Dismiss"}</button>}
      </div>
    </div>
  </div>;
}
