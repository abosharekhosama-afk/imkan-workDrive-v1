"use client";

import { useEffect } from "react";
import { useLocale } from "@/components/locale-provider";

/**
 * Route-level error boundary for the IMKAN Office editors (Writer/Sheet/Show).
 * A failure while opening a document (template working copy, missing Office
 * session, unexpected payload) is surfaced here with a retry, instead of
 * replacing the whole app with the global "This page couldn't load" page.
 */
export default function OfficeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";

  useEffect(() => {
    // Kept for diagnostics: the user sees a recoverable state, not a dead page.
    console.error("[office-page]", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center text-slate-800">
      <h2 className="text-[15px] font-semibold">{ar ? "تعذر فتح مستند IMKAN Office" : "IMKAN Office could not open this document"}</h2>
      <p className="max-w-[520px] text-[12.5px] text-slate-600">
        {ar
          ? "حدث خطأ أثناء تحميل المستند. أعد المحاولة، وإذا تكرر الخطأ فأعد فتحه من القوالب أو من الملفات."
          : "Something went wrong while loading the document. Try again — if it keeps failing, reopen it from Templates or Files."}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[12.5px] font-semibold text-white"
        >
          {ar ? "إعادة المحاولة" : "Try again"}
        </button>
        <a
          href="/files/templates"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {ar ? "العودة إلى القوالب" : "Back to Templates"}
        </a>
        <a
          href="/files"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {ar ? "الملفات" : "Files"}
        </a>
      </div>
    </div>
  );
}
