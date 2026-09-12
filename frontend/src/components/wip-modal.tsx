"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";

/** Global "under development" notice. Any component can call `openWip(label)`. */
export function openWip(feature: string) {
  window.dispatchEvent(new CustomEvent("workdrive:wip", { detail: { feature } }));
}

export function WipHost() {
  const { label, locale } = useLocale();
  const [feature, setFeature] = useState<string | null>(null);

  useEffect(() => {
    const onWip = (e: Event) => {
      const detail = (e as CustomEvent<{ feature?: string }>).detail;
      setFeature(detail?.feature ?? "");
    };
    window.addEventListener("workdrive:wip", onWip);
    return () => window.removeEventListener("workdrive:wip", onWip);
  }, []);

  if (feature === null) return null;

  const title = locale === "ar" ? "قيد التطوير" : "Under development";
  const body =
    locale === "ar"
      ? `ميزة "${feature}" قيد التطوير حالياً وستتوفر قريباً.`
      : `"${feature}" is under development and will be available soon.`;
  const closeText = locale === "ar" ? "إغلاق" : "Close";

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={() => setFeature(null)} aria-hidden="true" />
      <div className="relative w-[min(26rem,92vw)] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <div aria-hidden="true" className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF3FE] text-[#1B66EA]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-1.5 text-[13.5px] leading-6 text-slate-500">{body}</p>
          <button
            type="button"
            onClick={() => setFeature(null)}
            className="mt-5 w-full rounded-xl bg-[#1B66EA] px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-[#1558D6]"
          >
            {closeText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function WipGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
