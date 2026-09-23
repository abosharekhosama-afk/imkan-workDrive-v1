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
