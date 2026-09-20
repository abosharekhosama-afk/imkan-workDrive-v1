"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getOnlyOfficeEditorConfig } from "@/lib/api/files";
import { getTemplate, updateTemplateFromFile } from "@/lib/api/templates";
import { useLocale } from "@/components/locale-provider";

type DocsApi = { DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void } };
declare global { interface Window { DocsAPI?: DocsApi } }

function text(ar: boolean, en: string, value: string) { return ar ? value : en; }

export default function OfficeEditorPage() {
  const params = useParams<{ fileId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const fileId = params.fileId;
  const templateId = search.get("templateId");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function open() {
      try {
        setLoading(true); setError("");
        const result = await getOnlyOfficeEditorConfig(fileId);
        if (cancelled) return;
        const loadEditor = () => {
          if (cancelled || !window.DocsAPI) return;
          try {
            editorRef.current?.destroyEditor?.();
            editorRef.current = new window.DocsAPI.DocEditor("onlyoffice-editor", result.config);
            setReady(true);
            setLoading(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : text(ar, "Unable to start editor.", "تعذر تشغيل المحرر."));
            setLoading(false);
          }
        };
        if (window.DocsAPI) loadEditor();
        else {
          const existing = document.querySelector<HTMLScriptElement>('script[data-onlyoffice="true"]');
          if (existing) { existing.addEventListener("load", loadEditor, { once: true }); scriptRef.current = existing; }
          else {
            const script = document.createElement("script");
            script.src = `${result.onlyoffice_url}/web-apps/apps/api/documents/api.js`;
            script.async = true; script.dataset.onlyoffice = "true";
            script.onload = loadEditor;
            script.onerror = () => { setError(text(ar, "ONLYOFFICE Docs could not be reached.", "تعذر الوصول إلى خادم ONLYOFFICE Docs.")); setLoading(false); };
            document.head.appendChild(script); scriptRef.current = script;
          }
        }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : text(ar, "Unable to open editor.", "تعذر فتح المحرر.")); setLoading(false); }
      }
    }
    void open();
    return () => { cancelled = true; editorRef.current?.destroyEditor?.(); editorRef.current = null; };
  }, [fileId, ar]);

  const publish = async () => {
    if (!templateId) return;
    setPublishing(true); setError("");
    try {
      const template = await getTemplate(templateId);
      await updateTemplateFromFile(templateId, { fileId, name: template.name, description: template.description ?? undefined, categoryId: template.category?.id ?? null });
      router.push("/files/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : text(ar, "Unable to publish changes.", "تعذر اعتماد التغييرات."));
    } finally { setPublishing(false); }
  };

  return <div className="fixed inset-0 flex flex-col bg-slate-100">
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-lg px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100">← {text(ar, "Back", "رجوع")}</button>
        {templateId && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">{text(ar, "Template editing mode", "وضع تعديل القالب")}</span>}
      </div>
      <div className="flex items-center gap-2">
        {templateId && <button type="button" disabled={!ready || publishing} onClick={() => void publish()} className="rounded-lg bg-[var(--wd-primary)] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50">{publishing ? text(ar, "Publishing…", "جارٍ الاعتماد…") : text(ar, "Publish to template", "اعتماد التغييرات على القالب")}</button>}
      </div>
    </header>
    {error && <div className="m-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-5 text-red-700">{error}<div className="mt-1 text-[11px]">{text(ar, "Set ONLYOFFICE_URL on the backend and make sure the Document Server can reach the backend/storage URLs.", "تأكد من ضبط ONLYOFFICE_URL في الـ Backend وأن خادم Document Server يستطيع الوصول إلى الـ Backend وروابط التخزين.")}</div></div>}
    <div className="relative min-h-0 flex-1">
      {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100"><div className="rounded-xl bg-white px-5 py-4 text-[12px] text-slate-600 shadow-sm">{text(ar, "Loading online editor…", "جارٍ تحميل المحرر…")}</div></div>}
      <div id="onlyoffice-editor" className="h-full w-full" />
    </div>
  </div>;
}
