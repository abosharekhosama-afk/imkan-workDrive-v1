"use client";

import { useEffect, useState } from "react";
import { ApiError, getApiBaseUrl } from "../../../lib/api/client";
import { useLocale } from "../../../components/locale-provider";

type Info = {
  name: string;
  description: string | null;
  organizationName: string;
  collectName: boolean;
  collectEmail: boolean;
  collectPhone: boolean;
  maxFiles: number | null;
  maxFileSizeBytes: string | null;
};

type UploadInit = {
  submissionId: string;
  upload_url?: string;
  uploadUrl?: string;
  upload_id?: string;
  uploadId?: string;
  headers?: Record<string, string>;
};

async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw || "Request failed";
    try {
      const parsed = JSON.parse(raw) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message) message = parsed.message;
    } catch { /* keep the raw response */ }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export default function PublicCollectionPage({ params }: { params: { token: string } }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const text = (en: string, arabic: string) => (ar ? arabic : en);
  const [info, setInfo] = useState<Info | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void publicRequest<Info>(`/collections/public/${encodeURIComponent(params.token)}`)
      .then(setInfo)
      .catch((error) => setMessage(error instanceof Error ? error.message : text("Collection unavailable", "رابط التجميع غير متاح")));
  }, [params.token]);

  const maxBytes = info?.maxFileSizeBytes ? Number(info.maxFileSizeBytes) : null;
  const identityReady = !info || ((!info.collectName || name.trim()) && (!info.collectEmail || email.trim()) && (!info.collectPhone || phone.trim()));

  function addFiles(incoming: File[]) {
    if (!info) return;
    const next = [...files];
    for (const file of incoming) {
      if (maxBytes && file.size > maxBytes) {
        setMessage(text(`${file.name} is larger than the allowed size.`, `${file.name} أكبر من الحجم المسموح.`));
        continue;
      }
      if (info.maxFiles && next.length >= info.maxFiles) {
        setMessage(text("The file limit for this collection has been reached.", "تم الوصول إلى حد الملفات لهذا التجميع."));
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  async function submit() {
    if (!files.length || !identityReady) return;
    setBusy(true);
    setMessage("");
    try {
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const init = await publicRequest<UploadInit>(`/collections/public/${encodeURIComponent(params.token)}/upload-request`, {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            sha256,
            submitterName: name,
            submitterEmail: email,
            submitterPhone: phone,
          }),
        });
        const url = init.upload_url ?? init.uploadUrl;
        if (!url) throw new Error(text("Upload URL was not returned", "لم يُرجع رابط الرفع"));
        const put = await fetch(url, {
          method: "PUT",
          headers: init.headers ?? { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error(text(`Upload failed for ${file.name}`, `فشل رفع ${file.name}`));
        await publicRequest(`/collections/public/${encodeURIComponent(params.token)}/complete`, {
          method: "POST",
          body: JSON.stringify({ submissionId: init.submissionId, uploadId: init.upload_id ?? init.uploadId }),
        });
      }
      setFiles([]);
      setMessage(text("Your files were submitted successfully.", "تم إرسال ملفاتك بنجاح."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text("Submission failed", "فشل الإرسال"));
    } finally {
      setBusy(false);
    }
  }

  if (!info) {
    return <main className="mx-auto max-w-xl p-8" dir={ar ? "rtl" : "ltr"}><section className="wd-card p-6">{message || text("Loading collection…", "جارٍ تحميل التجميع…")}</section></main>;
  }

  const limit = [
    info.maxFiles ? text(`Up to ${info.maxFiles} files`, `حتى ${info.maxFiles} ملفات`) : null,
    maxBytes ? text(`Each file up to ${Math.ceil(maxBytes / (1024 * 1024))} MB`, `كل ملف حتى ${Math.ceil(maxBytes / (1024 * 1024))} ميجابايت`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-xl p-6 md:py-12" dir={ar ? "rtl" : "ltr"}>
      <section className="wd-card p-6 md:p-8">
        <p className="text-sm text-slate-500">{info.organizationName}</p>
        <h1 className="mt-2 text-2xl font-semibold">{info.name}</h1>
        {info.description ? <p className="mt-2 text-slate-600">{info.description}</p> : null}
        {limit ? <p className="mt-2 text-[12px] text-slate-500">{limit}</p> : null}
        <div className="mt-6 grid gap-4">
          {info.collectName ? <label className="grid gap-1 text-sm">{text("Your name", "اسمك")}<input className="wd-input" value={name} onChange={(event) => setName(event.target.value)} required /></label> : null}
          {info.collectPhone ? <label className="grid gap-1 text-sm">{text("Phone", "الهاتف")}<input type="tel" className="wd-input" value={phone} onChange={(event) => setPhone(event.target.value)} required /></label> : null}
          {info.collectEmail ? <label className="grid gap-1 text-sm">{text("Email", "البريد")}<input type="email" className="wd-input" value={email} onChange={(event) => setEmail(event.target.value)} required /></label> : null}
          <div
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => { event.preventDefault(); setDragOver(false); addFiles(Array.from(event.dataTransfer.files)); }}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center ${dragOver ? "border-[color:var(--wd-primary)] bg-[#f4fbf8]" : "border-slate-200 bg-slate-50"}`}
          >
            <p className="text-sm font-medium text-slate-700">{text("Drop files here", "أفلت الملفات هنا")}</p>
            <p className="mt-1 text-[12px] text-slate-500">{text("or choose them from your device", "أو اخترها من جهازك")}</p>
            <label className="mt-3 inline-flex cursor-pointer rounded-full bg-[color:var(--wd-primary)] px-4 py-2 text-[13px] font-semibold text-white">
              {text("Choose files", "اختيار الملفات")}
              <input type="file" multiple className="sr-only" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
            </label>
          </div>
          {files.length > 0 ? <ul className="space-y-1 text-sm text-slate-700">{files.map((file) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name} — {Math.ceil(file.size / 1024)} KB</li>)}</ul> : null}
          <button className="wd-primary-button" disabled={busy || !files.length || !identityReady} onClick={() => void submit()}>{busy ? text("Uploading…", "جارٍ الرفع…") : text("Submit files", "إرسال الملفات")}</button>
          {message ? <p role="status" className="text-sm">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
