"use client";

import { useState } from "react";

export function WorkflowConceptGuide({ ar, compact = false }: { ar: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return <section className="rounded-2xl border border-[#DCE7F8] bg-[#F8FBFF]" dir={ar ? "rtl" : "ltr"}>
    <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#1B66EA] shadow-sm">?</span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-slate-900">{ar ? "كيف تعمل منظومة الأتمتة؟" : "How the automation system works"}</div>
          <div className="mt-0.5 text-[9.5px] leading-4 text-slate-500">{ar ? "Workflow يحدد متى وماذا يحدث، Connection يحدد بأي حساب خارجي، وCustom Function يضيف منطقاً مخصصاً." : "Workflow decides when and what happens, Connection provides the external account, and Custom Function adds reusable custom logic."}</div>
        </div>
      </div>
      <span className="text-[11px] text-slate-400">{open ? "⌃" : "⌄"}</span>
    </button>
    {open && <div className="border-t border-[#DCE7F8] px-4 pb-4 pt-3">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#1B66EA]">1 · Workflow</div><div className="mt-1 text-[10.5px] font-semibold text-slate-800">{ar ? "متى يبدأ؟ وما الذي يحدث؟" : "When does it start and what happens?"}</div><p className="mt-1 text-[9px] leading-4 text-slate-500">{ar ? "Trigger → State → Condition → Action → State التالية." : "Trigger → State → Condition → Action → next state."}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-emerald-600">2 · Connection</div><div className="mt-1 text-[10.5px] font-semibold text-slate-800">{ar ? "بأي حساب يتم الوصول للخدمة؟" : "Which external account is used?"}</div><p className="mt-1 text-[9px] leading-4 text-slate-500">{ar ? "OAuth محفوظ وآمن؛ لا تضع Access Token داخل Workflow." : "Secure OAuth authorization; never put an access token inside a workflow."}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-violet-600">3 · Custom Function</div><div className="mt-1 text-[10.5px] font-semibold text-slate-800">{ar ? "متى أحتاج منطقاً مخصصاً؟" : "When do I need custom logic?"}</div><p className="mt-1 text-[9px] leading-4 text-slate-500">{ar ? "استخدمها عندما لا يكفي Action جاهز، مع عمليات SAFE محددة." : "Use it when a built-in action is not enough, using controlled SAFE operations."}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px] font-medium text-slate-600">
        {[
          ar ? "حدث" : "Event", ar ? "محفز" : "Trigger", ar ? "حالة" : "State", ar ? "شرط" : "Condition", ar ? "إجراء" : "Action", ar ? "اتصال" : "Connection", ar ? "نتيجة" : "Result"
        ].map((x, i) => <span key={x} className="flex items-center gap-1.5"><span className={`rounded-lg px-2 py-1 ${i === 5 ? "bg-emerald-50 text-emerald-700" : "bg-white border border-slate-200"}`}>{x}</span>{i < 6 && <span className="text-slate-300">→</span>}</span>)}
      </div>
    </div>}
  </section>;
}

export function ConnectionUseHint({ ar }: { ar: boolean }) {
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3" dir={ar ? "rtl" : "ltr"}>
    <div className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">↗</span><div><div className="text-[10px] font-semibold text-emerald-900">{ar ? "لماذا أختار Connection هنا؟" : "Why select a Connection here?"}</div><p className="mt-1 text-[9px] leading-4 text-emerald-800">{ar ? "هذا الطلب سيستخدم OAuth الخاص بالاتصال على الخادم تلقائياً. اكتب فقط مسار API والطلب؛ لا تضع Token." : "This request uses the connection's OAuth authorization server-side. Enter the API path and request only; do not add a token."}</p></div></div>
  </div>;
}

export type WorkflowRecipe = "REVIEW_FILE" | "NOTIFY_UPLOAD" | "EXTERNAL_API" | "CUSTOM_FUNCTION";

export const WORKFLOW_RECIPES: Array<{
  id: WorkflowRecipe;
  icon: string;
  en: string;
  ar: string;
  enDescription: string;
  arDescription: string;
}> = [
  {
    id: "REVIEW_FILE",
    icon: "✓",
    en: "File review",
    ar: "مراجعة ملف",
    enDescription: "Upload → Review → Completed. Start with the workflow structure and add approval details later.",
    arDescription: "رفع → مراجعة → مكتمل. ابدأ ببنية سير العمل ثم أضف تفاصيل الموافقة لاحقاً.",
  },
  {
    id: "NOTIFY_UPLOAD",
    icon: "◔",
    en: "Notify after upload",
    ar: "إشعار بعد الرفع",
    enDescription: "Upload → Completed with a real WorkDrive notification action.",
    arDescription: "رفع → مكتمل مع إجراء إشعار حقيقي داخل WorkDrive.",
  },
  {
    id: "EXTERNAL_API",
    icon: "↗",
    en: "External API",
    ar: "API خارجي",
    enDescription: "Upload → API request. You choose an ACTIVE Connection and the API path.",
    arDescription: "رفع → طلب API. تختار Connection نشطاً ومسار الـAPI.",
  },
  {
    id: "CUSTOM_FUNCTION",
    icon: "ƒ",
    en: "Custom Function",
    ar: "Custom Function",
    enDescription: "Upload → reusable safe function. Create/publish the function, then attach it here.",
    arDescription: "رفع → دالة آمنة قابلة لإعادة الاستخدام. أنشئ الدالة وانشرها ثم اربطها هنا.",
  },
];

export function WorkflowRecipePicker({ ar, value, onChange }: { ar: boolean; value: WorkflowRecipe; onChange: (value: WorkflowRecipe) => void }) {
  return <div dir={ar ? "rtl" : "ltr"}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div>
        <div className="text-[10.5px] font-semibold text-slate-800">{ar ? "اختر نقطة بداية" : "Choose a starting recipe"}</div>
        <div className="mt-0.5 text-[9px] text-slate-500">{ar ? "هذه قوالب إعداد فعلية، وليست تنفيذات وهمية. يمكنك تعديل كل خطوة في المصمم." : "These are real starting configurations, not fake executions. You can edit every step in the builder."}</div>
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {WORKFLOW_RECIPES.map((recipe) => {
        const active = value === recipe.id;
        return <button key={recipe.id} type="button" onClick={() => onChange(recipe.id)} className={`rounded-xl border p-3 text-start transition ${active ? "border-[var(--wd-primary)] bg-[var(--wd-primary-light)] ring-2 ring-[var(--wd-primary)]/10" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
          <div className="flex items-start gap-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold ${active ? "bg-white text-[var(--wd-primary)]" : "bg-slate-100 text-slate-500"}`}>{recipe.icon}</span>
            <span className="min-w-0"><span className="block text-[10.5px] font-semibold text-slate-900">{ar ? recipe.ar : recipe.en}</span><span className="mt-1 block text-[9px] leading-4 text-slate-500">{ar ? recipe.arDescription : recipe.enDescription}</span></span>
          </div>
        </button>;
      })}
    </div>
  </div>;
}

export function WorkflowNextSteps({ ar, workflowId, recipe }: { ar: boolean; workflowId: string; recipe?: WorkflowRecipe }) {
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4" dir={ar ? "rtl" : "ltr"}>
    <div className="text-[10.5px] font-semibold text-emerald-900">{ar ? "تم حفظ سير العمل. ما الخطوة التالية؟" : "Workflow saved. What should you do next?"}</div>
    <p className="mt-1 text-[9.5px] leading-5 text-emerald-800">{recipe === "EXTERNAL_API" ? (ar ? "تحقق من Connection ثم نفّذ التشغيل من مورد حقيقي. ستظهر النتيجة في سجل التشغيل." : "Verify the Connection, then run the workflow from a real resource. The result will appear in run history.") : recipe === "CUSTOM_FUNCTION" ? (ar ? "تأكد من نشر الدالة الآمنة ثم استخدمها في الإجراء. راجع سجل التشغيل بعد التنفيذ." : "Make sure the safe function is published, then use it in the action. Review run history after execution.") : (ar ? "فعّل سير العمل ثم ابدأه من مورد حقيقي. راجع سجل التشغيل والمهام الناتجة." : "Activate the workflow, then start it from a real resource. Review run history and generated tasks.")}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={`/files/workflows/runs?workflowId=${encodeURIComponent(workflowId)}`} className="wd-pill wd-pill-record">{ar ? "سجل التشغيل" : "Run history"}</a>
      <a href="/files/workflows/functions" className="wd-pill wd-pill-record">{ar ? "Custom Functions" : "Custom Functions"}</a>
      <a href="/files/connections" className="wd-pill wd-pill-record">{ar ? "Connections" : "Connections"}</a>
    </div>
  </div>;
}
