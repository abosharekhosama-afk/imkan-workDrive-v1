"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOfficeDocument, type OfficeType } from "@/lib/api/office";
import { useLocale } from "@/components/locale-provider";

export default function NewOfficeDocumentPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [busy, setBusy] = useState<OfficeType | "">("");
  const [error, setError] = useState("");

  const create = async (type: OfficeType) => {
    setBusy(type); setError("");
    const names: Record<OfficeType, string> = {
      WRITER: ar ? "مستند جديد" : "Untitled document",
      SHEET: ar ? "جدول بيانات جديد" : "Untitled spreadsheet",
      SHOW: ar ? "عرض تقديمي جديد" : "Untitled presentation",
    };
    try {
      const result = await createOfficeDocument({ name: names[type], type });
      const route = type === "WRITER" ? "writer" : type === "SHEET" ? "sheet" : "show";
      router.replace(`/office/${route}/${result.fileId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : (ar ? "تعذر إنشاء المستند." : "Unable to create the document."));
    } finally { setBusy(""); }
  };

  const cards: Array<{ type: OfficeType; icon: string; title: string; description: string }> = [
    { type: "WRITER", icon: "W", title: ar ? "مستند" : "Document", description: ar ? "أنشئ مستندًا نصيًا باستخدام IMKAN Writer." : "Create a text document with IMKAN Writer." },
    { type: "SHEET", icon: "S", title: ar ? "جدول بيانات" : "Spreadsheet", description: ar ? "أنشئ جدول بيانات باستخدام IMKAN Sheet." : "Create a spreadsheet with IMKAN Sheet." },
    { type: "SHOW", icon: "P", title: ar ? "عرض تقديمي" : "Presentation", description: ar ? "أنشئ عرضًا تقديميًا باستخدام IMKAN Show." : "Create a presentation with IMKAN Show." },
  ];

  return <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-slate-50 p-6 text-slate-800 md:p-10">
    <div className="mx-auto max-w-5xl">
      <button onClick={() => router.back()} className="mb-8 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-white">← {ar ? "رجوع" : "Back"}</button>
      <div className="mb-8"><div className="text-2xl font-semibold">IMKAN Office</div><p className="mt-2 text-sm text-slate-500">{ar ? "اختر التطبيق الذي تريد إنشاء مستند جديد فيه." : "Choose the native IMKAN Office application for your new file."}</p></div>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      <div className="grid gap-5 md:grid-cols-3">
        {cards.map(card => <button key={card.type} disabled={!!busy} onClick={() => void create(card.type)} className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:opacity-60">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">{card.icon}</div>
          <div className="text-base font-semibold">{card.title}</div><div className="mt-2 text-xs leading-5 text-slate-500">{card.description}</div>
          <div className="mt-6 text-xs font-medium text-[var(--wd-primary)]">{busy === card.type ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء →" : "Create →")}</div>
        </button>)}
      </div>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">{ar ? "هذه هي أول طبقة من IMKAN Office Native. الاستيراد من DOCX/XLSX/PPTX والتعاون اللحظي سيأتيان في المراحل التالية." : "This is the first native IMKAN Office foundation. DOCX/XLSX/PPTX import and real-time collaboration are scheduled for later phases."}</div>
    </div>
  </main>;
}
