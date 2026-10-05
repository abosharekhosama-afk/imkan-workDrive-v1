"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { verifyPublicShare, type PublicShareResult } from "../../../lib/api/public-share";

function formatBytes(n?: number | null) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function PublicShareForm() {
  const { label, locale } = useLocale();
  const ar = locale === "ar";
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<PublicShareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestedData, setRequestedData] = useState<string[]>([]);
  const [userData, setUserData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void verifyPublicShare(token)
      .then((value) => {
        setRequestedData(value.request_user_data ?? []);
        if (value.name || value.resource_id) {
          setResult(value);
          setNeedsPassword(false);
        }
      })
      .catch((err: unknown) => {
        const status = err instanceof Error ? err.message : "";
        if (status === "401" || status === "403") setNeedsPassword(true);
        else setError(label("error.generic"));
      })
      .finally(() => setLoading(false));
  }, [token, label]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const value = await verifyPublicShare(token, password || undefined, Object.keys(userData).length ? userData : undefined);
      setRequestedData(value.request_user_data ?? []);
      setResult(value);
      setNeedsPassword(false);
    } catch {
      setError(label("share.password") + " — " + label("error.generic"));
      setNeedsPassword(true);
    } finally {
      setLoading(false);
    }
  }

  const resourceName = result?.name || (ar ? "ملف مشارك" : "Shared item");

  return (
    <div className="share-public-page min-h-screen bg-[var(--wd-canvas,#f4f6f8)] text-[var(--wd-text,#212121)]" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
      <header className="share-public-header flex h-14 items-center gap-3 border-b border-[color:var(--wd-line,#e5e7eb)] bg-[var(--wd-bg,#fff)] px-4 md:px-8">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--wd-primary,#2c66dd)] text-[13px] font-bold text-white">W</span>
        <span className="text-[15px] font-semibold">IMKAN WorkDrive</span>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-8 md:px-6">
        <div className="rounded-2xl border border-[color:var(--wd-line,#e5e7eb)] bg-[var(--wd-bg,#fff)] p-6 shadow-[0_8px_30px_rgba(15,23,42,.06)]">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--wd-primary,#2c66dd)]">{label("share.public.title")}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight">{resourceName}</h1>
          <p className="mt-2 text-[13px] text-slate-500">{label("share.public.subtitle")}</p>

          {result ? (
            <div className="mt-5 grid gap-3 rounded-xl bg-[var(--wd-hover,#f5f7fa)] p-4 text-[13px] sm:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">{label("share.public.fileDetails")}</div>
                <div className="mt-0.5 font-medium">{result.resource_type === "FOLDER" ? (ar ? "مجلد" : "Folder") : (ar ? "ملف" : "File")}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">{label("share.public.expires")}</div>
                <div className="mt-0.5 font-medium">{result.expires_at ? new Date(result.expires_at).toLocaleString(locale === "ar" ? "ar" : "en") : label("share.public.noExpiry")}</div>
              </div>
              {result.can_download != null ? (
                <div>
                  <div className="text-[11px] text-slate-500">{label("share.showDownload")}</div>
                  <div className="mt-0.5 font-medium">{result.can_download ? (ar ? "مسموح" : "Allowed") : (ar ? "غير مسموح" : "Not allowed")}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {(needsPassword || !result) ? (
            <form className="mt-6 flex flex-col gap-3" onSubmit={onSubmit}>
              {!token ? (
                <label className="flex flex-col gap-1 text-[13px]">
                  Token
                  <input className="imkan-input" value={token} onChange={(e) => setToken(e.target.value)} required />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-[13px]">
                {label("share.password")}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="imkan-input" placeholder={needsPassword ? label("share.public.protected") : ""} />
              </label>
              {requestedData.length ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-sm font-medium">{label("share.requestUserData")}</div>
                  {requestedData.map((key) => (
                    <label key={key} className="mb-2 flex flex-col gap-1 text-[13px]">
                      {key === "name" ? (ar ? "الاسم" : "Name") : key === "email" ? (ar ? "البريد" : "Email") : key === "company" ? (ar ? "الشركة" : "Company") : (ar ? "الهاتف" : "Phone")}
                      <input className="imkan-input" value={userData[key] ?? ""} onChange={(e) => setUserData((c) => ({ ...c, [key]: e.target.value }))} required />
                    </label>
                  ))}
                </div>
              ) : null}
              <button type="submit" className="imkan-button mt-1" disabled={loading}>
                {loading ? "…" : label("share.verify")}
              </button>
            </form>
          ) : null}

          {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}

          {result ? (
            <div className="mt-6">
              {result.resource_type === "FILE" ? (
                result.download_url ? (
                  <a href={result.download_url} className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--wd-primary,#2c66dd)] px-6 text-[13px] font-semibold text-white hover:opacity-95">
                    {label("share.public.openFile")}
                  </a>
                ) : (
                  <p className="text-[13px] text-slate-500">{ar ? "لا يتوفر رابط تنزيل لهذا الملف." : "No download link is available for this file."}</p>
                )
              ) : (
                <div className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 px-4 py-3 text-[13px] font-semibold">{label("share.folderContents")}</div>
                  {result.items?.length ? (
                    <div className="divide-y divide-slate-100">
                      {result.items.map((item) => (
                        <div key={`${item.resource_type}:${item.resource_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{item.name}</div>
                            <div className="truncate text-[11px] text-slate-500">{item.path ?? item.resource_type}{item.size != null ? ` · ${formatBytes(item.size)}` : ""}</div>
                          </div>
                          {item.resource_type === "FILE" && item.download_url ? (
                            <a href={item.download_url} className="shrink-0 text-[12px] font-semibold text-[color:var(--wd-primary,#2c66dd)] underline">{label("files.download")}</a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-6 text-[13px] text-slate-500">{label("shared.noSharedItems")}</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function PublicSharePage() {
  return (
    <Suspense>
      <PublicShareForm />
    </Suspense>
  );
}
