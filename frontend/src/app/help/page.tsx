"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "../../components/locale-provider";

type FaqItem = { q: string; a: string };

export default function HelpPage() {
  const { label } = useLocale();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      q: label("help.faq.files.q"),
      a: label("help.faq.files.a"),
    },
    {
      q: label("help.faq.share.q"),
      a: label("help.faq.share.a"),
    },
    {
      q: label("help.faq.workflows.q"),
      a: label("help.faq.workflows.a"),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1B66EA] text-lg font-bold text-white">?</span>
        <h1 className="text-2xl font-bold text-foreground">{label("help.title")}</h1>
        <p className="imkan-meta mt-1">IMKAN WorkDrive Help Center</p>
        <p className="mt-2 text-[14px] text-slate-500">{label("help.subtitle")}</p>
      </header>

      <section aria-labelledby="help-faq-heading" className="mb-10">
        <h2 id="help-faq-heading" className="mb-3 text-[15px] font-semibold text-foreground">{label("help.faqTitle")}</h2>
        <div className="space-y-2">
          {faqs.map((item, index) => {
            const open = openIndex === index;
            return (
              <div key={item.q} className="overflow-hidden rounded-xl border border-[#EDEDED] bg-white">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-[14px] font-medium text-foreground hover:bg-[#EEF3FE]"
                >
                  <span>{item.q}</span>
                  <span aria-hidden="true" className="text-[#1B66EA]">{open ? "−" : "+"}</span>
                </button>
                {open ? <p className="border-t border-[#EDEDED] px-4 py-3 text-[13.5px] leading-relaxed text-slate-600">{item.a}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="help-support-heading" className="rounded-xl border border-[#EDEDED] bg-[#EEF3FE]/50 p-5">
        <h2 id="help-support-heading" className="text-[15px] font-semibold text-foreground">{label("help.supportTitle")}</h2>
        <p className="mt-1 mb-4 text-[13.5px] text-slate-600">{label("help.supportDescription")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings" className="imkan-button">{label("help.contactSupport")}</Link>
          <a href="mailto:support@imkan.workdrive" className="imkan-button bg-white text-[#1B66EA] border border-[#1B66EA]">{label("help.sendFeedback")}</a>
        </div>
      </section>
    </main>
  );
}