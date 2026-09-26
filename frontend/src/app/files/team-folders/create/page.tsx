"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "../../../../components/locale-provider";
import { createTeamFolder } from "../../../../lib/api/team-folders";

function CreateFolderIllustration() {
  return (
    <div className="relative h-[250px] w-[250px]" aria-hidden="true">
      <div className="absolute inset-x-2 bottom-3 h-[205px] rounded-[45%] bg-emerald-50" />
      <div className="absolute left-10 top-12 h-[150px] w-[175px] rounded-[16px] border-[4px] border-slate-500 bg-sky-50 shadow-sm">
        <div className="absolute -top-3 left-7 h-6 w-24 rounded-t-[10px] border-[4px] border-b-0 border-slate-500 bg-sky-50" />
        <div className="absolute left-[56px] top-[48px] h-8 w-8 rounded-full border-[4px] border-slate-500 bg-white" />
        <div className="absolute left-[28px] top-[88px] h-8 w-8 rounded-full border-[4px] border-slate-500 bg-white" />
        <div className="absolute right-[30px] top-[88px] h-8 w-8 rounded-full border-[4px] border-slate-500 bg-white" />
      </div>
      <div className="absolute right-8 top-8 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-blue-500 bg-amber-200 text-3xl font-light text-blue-600">+</div>
      <div className="absolute bottom-1 left-0 h-12 w-5 rounded-full border-[3px] border-slate-500 bg-emerald-100" />
      <div className="absolute bottom-0 right-1 h-16 w-6 rounded-full border-[3px] border-slate-500 bg-emerald-100" />
    </div>
  );
}

export default function CreateTeamFolderPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const teamFoldersBase = pathname.startsWith("/admin/team-folders") ? "/admin/team-folders" : "/files/team-folders";
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    setBusy(true);
    setError("");
    try {
      // Persist the selected Team Folder visibility in the real API.
      // Description is currently presentation-only because the TeamFolder model
      // has no description field.
      await createTeamFolder(cleanName, { isPublicToOrg: type === "public" });
      window.dispatchEvent(new Event("workdrive:team-folders-changed"));
      router.push(teamFoldersBase);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ar" ? "تعذر إنشاء مجلد الفريق." : "Unable to create the Team Folder."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-full min-w-0 flex-col bg-white">
      <header className="flex h-[68px] shrink-0 items-center justify-end border-b border-slate-100 px-6">
        <Link href={teamFoldersBase} className="text-[16px] font-medium text-slate-600 hover:text-slate-900">Esc&nbsp; ×</Link>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] overflow-auto max-[760px]:grid-cols-1">
        <div className="flex min-h-[250px] items-start justify-center border-e border-slate-100 bg-gradient-to-br from-emerald-50/80 via-white to-white pt-12 max-[760px]:hidden"><CreateFolderIllustration /></div>
        <main className="mx-auto w-full max-w-[900px] px-10 pb-16 pt-8 max-[760px]:px-5">
          <div className="max-w-[720px]">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-slate-900">{locale === "ar" ? "إنشاء مجلد فريق" : "Create Team Folder"}</h1>
            <p className="mt-2 text-[14px] leading-6 text-slate-600">{locale === "ar" ? "مجلدات الفريق مساحة مشتركة للأعضاء لتخزين الملفات والعمل عليها معًا." : "Team Folders are a shared space for members to store and collaborate on files together."}</p>

            <div className="mt-7 space-y-8">
              <label className="block text-[14px] font-medium text-slate-800">
                {locale === "ar" ? "الاسم" : "Name"}
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={locale === "ar" ? "مثال: قسم التسويق" : "E.g., Marketing Department"} className="mt-2 h-[38px] w-full rounded-full border border-slate-300 px-3 text-[14px] font-normal text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10" autoFocus disabled={busy} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} />
              </label>

              <fieldset>
                <legend className="text-[14px] font-medium text-slate-800">{locale === "ar" ? "نوع مجلد الفريق" : "Team Folder type"}</legend>
                <div className="mt-3 flex items-center gap-7 text-[14px] text-slate-700">
                  <label className="inline-flex cursor-pointer items-center gap-2"><input type="radio" name="team-folder-type" checked={type === "public"} onChange={() => setType("public")} disabled={busy} />{locale === "ar" ? "عام" : "Public"}</label>
                  <label className="inline-flex cursor-pointer items-center gap-2"><input type="radio" name="team-folder-type" checked={type === "private"} onChange={() => setType("private")} disabled={busy} />{locale === "ar" ? "خاص" : "Private"}</label>
                </div>
                <p className="mt-3 text-[14px] leading-6 text-slate-600">{locale === "ar" ? "يمكن لأعضاء مجلد الفريق الذين تمت إضافتهم التعاون في الملفات والمجلدات." : "Only the Team Folder members who have been added can collaborate on files and folders."}</p>
              </fieldset>

              <label className="block text-[14px] font-medium text-slate-800">
                {locale === "ar" ? "الوصف" : "Description"} <span className="font-normal text-slate-500">({locale === "ar" ? "اختياري" : "Optional"})</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={locale === "ar" ? "أضف وصفًا مختصرًا لمجلد الفريق" : "Add a brief description of the Team Folder"} className="mt-2 min-h-[82px] w-full resize-y rounded-2xl border border-slate-300 px-3 py-2.5 text-[14px] font-normal text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10" disabled={busy} />
              </label>

              {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-1">
                <Link href={teamFoldersBase} className="inline-flex h-[34px] items-center rounded-full border border-slate-300 bg-white px-4 text-[13px] font-medium text-slate-700 hover:bg-slate-50">{locale === "ar" ? "إلغاء" : "Cancel"}</Link>
                <button type="button" disabled={busy || !name.trim()} onClick={() => void submit()} className="inline-flex h-[34px] items-center rounded-full bg-[color:var(--wd-primary)] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? (locale === "ar" ? "جارٍ الإنشاء…" : "Creating…") : (locale === "ar" ? "إنشاء" : "Create")}</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}
