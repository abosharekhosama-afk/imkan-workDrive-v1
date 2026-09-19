"use client";

import { getPreviewMimeCategory } from "@/lib/api/preview";
import { OfficeViewer } from "@/components/preview/office-viewer";
import { useLocale } from "@/components/locale-provider";

export function TemplatePreview({
  url,
  name,
  mimeType,
  extension,
  className = "h-full",
}: {
  url?: string | null;
  name: string;
  mimeType?: string | null;
  extension?: string | null;
  className?: string;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const mime = mimeType || "application/octet-stream";
  const fileName = extension && !name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? `${name}.${extension}` : name;
  const category = getPreviewMimeCategory(mime, fileName);

  if (!url) return <Fallback name={name} text={ar ? "لا تتوفر معاينة لهذا النوع." : "Preview is unavailable for this type."} />;

  if (category === "office") {
    return <OfficeViewer url={url} fileName={fileName} onDownload={() => window.open(url, "_blank", "noopener,noreferrer")} />;
  }
  if (category === "image") {
    return <div className={`flex items-center justify-center overflow-auto bg-slate-100 p-4 ${className}`}><img src={url} alt={name} className="max-h-full max-w-full object-contain shadow-sm" /></div>;
  }
  if (category === "pdf") {
    return <iframe title={name} src={url} className={`w-full border-0 bg-slate-100 ${className}`} />;
  }
  if (category === "text") {
    return <iframe title={name} src={url} className={`w-full border-0 bg-white ${className}`} sandbox="allow-same-origin" />;
  }

  return <Fallback name={name} text={ar ? "يمكنك استخدام القالب لإنشاء نسخة جديدة، لكن لا يمكن عرض هذا النوع مباشرة هنا." : "You can use the template to create a new copy, but this type cannot be rendered directly here."} />;
}

function Fallback({ name, text }: { name: string; text: string }) {
  return <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-8 text-center text-slate-500"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">📄</div><div className="max-w-md text-[12px] font-medium text-slate-700">{name}</div><div className="max-w-md text-[11px] leading-5">{text}</div></div>;
}
