"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import { FileTypeIcon, fileIconKind } from "../../../../components/file-icon";
import { Icons } from "../../../../components/layout/icons";
import { getFileDetails, type FileDetailsResponse } from "../../../../lib/api/files";
import { getFileActivities, getPreviewUrl, type FileActivityRecord } from "../../../../lib/api/preview";
import { getVersionHistory, getVersionDownloadUrlById, restoreVersionById, uploadNewVersion, type VersionRecord } from "../../../../lib/api/versions";
import { getFolder } from "../../../../lib/api/folders";
import { formatBytes } from "../../../../lib/api/quota";

type Tab = "general" | "versions" | "activity" | "access";
type FolderLike = { id: string; name: string; parentId?: string | null; ownerName?: string | null; ownerEmail?: string | null; updatedAt?: string | null; itemCount?: number | null };

function dateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; }
}
function dateOnly(value: string, locale: string) {
  try { return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(value)); } catch { return value; }
}
function timeOnly(value: string, locale: string) {
  try { return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); } catch { return value; }
}
function relative(value: string, locale: string) {
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const delta = (new Date(value).getTime() - Date.now()) / 1000;
    if (Math.abs(delta) < 60) return rtf.format(Math.round(delta), "second");
    const minutes = delta / 60; if (Math.abs(minutes) < 60) return rtf.format(Math.round(minutes), "minute");
    const hours = minutes / 60; if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour");
    return rtf.format(Math.round(hours / 24), "day");
  } catch { return dateTime(value, locale); }
}
function activityText(action: string, locale: string) {
  const ar: Record<string, string> = { PREVIEW: "شاهد هذا الملف", DOWNLOAD: "نزّل هذا الملف", COMMENT: "أضاف تعليقًا", SHARE: "شارك هذا الملف", UNSHARE: "ألغى المشاركة", UPLOAD_VERSION: "رفع إصدارًا جديدًا", RESTORE_VERSION: "استعاد إصدارًا", UPDATE: "حدّث هذا الملف", CREATE: "أنشأ هذا الملف", DELETE: "حذف هذا الملف" };
  const en: Record<string, string> = { PREVIEW: "Viewed this file", DOWNLOAD: "Downloaded this file", COMMENT: "Commented on this file", SHARE: "Shared this file", UNSHARE: "Unshared this file", UPLOAD_VERSION: "Uploaded a new version", RESTORE_VERSION: "Restored a version", UPDATE: "Updated this file", CREATE: "Created this file", DELETE: "Deleted this file" };
  return (locale === "ar" ? ar : en)[action] || action;
}

export default function FileInformationPage() {
  const { locale } = useLocale();
  const params = useParams<{ fileId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const resourceId = decodeURIComponent(params.fileId);
  const requestedTab = search.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(requestedTab === "versions" || requestedTab === "activity" || requestedTab === "access" ? requestedTab : "general");
  const [file, setFile] = useState<FileDetailsResponse | null>(null);
  const [folder, setFolder] = useState<FolderLike | null>(null);
  const [activities, setActivities] = useState<FileActivityRecord[]>([]);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionBusy, setVersionBusy] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [openVersionMenu, setOpenVersionMenu] = useState<string | null>(null);
  const [accessExpanded, setAccessExpanded] = useState(true);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const details = await getFileDetails(resourceId);
      setFile(details); setFolder(null);
      const [activityRows, versionRows] = await Promise.all([
        getFileActivities(resourceId, 200).catch(() => []),
        getVersionHistory(resourceId).catch(() => []),
      ]);
      setActivities(activityRows); setVersions(versionRows);
      if (details.mimeType?.startsWith("image/")) {
        getPreviewUrl(resourceId).then((r) => setPreviewUrl(r.preview_url)).catch(() => setPreviewUrl(null));
      } else setPreviewUrl(null);
    } catch {
      try {
        const row = await getFolder(resourceId);
        setFolder(row); setFile(null); setActivities([]); setVersions([]); setPreviewUrl(null);
      } catch {
        setError(locale === "ar" ? "تعذر تحميل تفاصيل العنصر." : "Unable to load item details.");
      }
    } finally { setLoading(false); }
  }, [resourceId, locale]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const next = search.get("tab") as Tab | null;
    if (next === "versions" || next === "activity" || next === "access" || next === "general") setTab(next);
  }, [search]);

  const isFile = Boolean(file);
  const name = file?.name ?? folder?.name ?? "—";
  const kind = fileIconKind(isFile ? "file" : "folder", file?.mimeType ?? null, name);
  const views = activities.filter((a) => a.action === "PREVIEW").length;
  const downloads = activities.filter((a) => a.action === "DOWNLOAD").length;
  const comments = activities.filter((a) => a.action === "COMMENT").length;
  const storageUsed = versions.reduce((total, version) => total + (Number.isFinite(version.size) ? version.size : 0), 0) || file?.size || 0;
  const actors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; views: number; downloads: number }>();
    for (const a of activities) {
      const id = a.user_id || "unknown";
      const sameAsOwner = Boolean(file?.owner?.id && file.owner.id === a.user_id);
      const current = map.get(id) ?? { id, name: sameAsOwner ? (file?.owner.name || file?.owner.email || "You") : (locale === "ar" ? "مستخدم" : "User"), email: sameAsOwner ? (file?.owner.email || "") : "", views: 0, downloads: 0 };
      if (a.action === "PREVIEW") current.views += 1;
      if (a.action === "DOWNLOAD") current.downloads += 1;
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads));
  }, [activities, file, locale]);

  function changeTab(next: Tab) {
    setTab(next);
    router.replace(`/files/details/${encodeURIComponent(resourceId)}?tab=${next}`, { scroll: false });
  }

  async function handleUploadNewVersion(selected: File | undefined) {
    if (!selected || !isFile) return;
    setUploadBusy(true);
    try { await uploadNewVersion(resourceId, selected); await load(); changeTab("versions"); }
    catch { setError(locale === "ar" ? "تعذر رفع الإصدار الجديد." : "Unable to upload the new version."); }
    finally { setUploadBusy(false); if (uploadRef.current) uploadRef.current.value = ""; }
  }

  async function previewVersion(version: VersionRecord) {
    setVersionBusy(version.id);
    try { const result = await getVersionDownloadUrlById(resourceId, version.id); window.open(result.download_url, "_blank", "noopener,noreferrer"); }
    catch { /* keep the page stable if the version is no longer available */ }
    finally { setVersionBusy(null); setOpenVersionMenu(null); }
  }

  async function restoreVersion(version: VersionRecord) {
    setVersionBusy(version.id);
    try { await restoreVersionById(resourceId, version.id); await load(); }
    catch { setError(locale === "ar" ? "تعذر استعادة الإصدار." : "Unable to restore this version."); }
    finally { setVersionBusy(null); setOpenVersionMenu(null); }
  }

  if (loading) return <main className="imkan-file-details-page"><div className="imkan-file-details-loading">{locale === "ar" ? "جارٍ تحميل التفاصيل…" : "Loading details…"}</div></main>;
  if (error && !file && !folder) return <main className="imkan-file-details-page"><div className="imkan-file-details-error"><p>{error}</p><button type="button" onClick={() => void load()}>{locale === "ar" ? "إعادة المحاولة" : "Reload"}</button></div></main>;

  const title = name;
  const typeText = isFile ? (file?.mimeType || file?.extension || (locale === "ar" ? "ملف" : "File")) : (locale === "ar" ? "مجلد" : "Folder");
  const owner = file?.owner.name || file?.owner.email || folder?.ownerName || folder?.ownerEmail || "—";
  const location = file?.location?.name || (locale === "ar" ? "مجلداتي" : "My Folders");
  const createdAt = file?.createdAt || folder?.updatedAt;
  const modifiedAt = file?.updatedAt || folder?.updatedAt;
  const permalink = typeof window !== "undefined" ? `${window.location.origin}/files/details/${resourceId}` : `/files/details/${resourceId}`;
  const currentVersion = versions.find((version) => version.isCurrent);

  return (
    <main className="imkan-file-details-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="imkan-file-details-head">
        <div className="imkan-file-details-title">
          <div className="imkan-file-details-icon"><FileTypeIcon kind={kind} size={24} /></div>
          <div className="min-w-0"><h1 title={title}>{title}</h1><button type="button" onClick={() => router.push(file?.location?.id ? `/files/${file.location.id}` : "/files")}><Icons.folder size={13} /> {location}</button></div>
        </div>
        <button type="button" className="imkan-file-details-close" onClick={() => router.back()} aria-label={locale === "ar" ? "إغلاق" : "Close"}><Icons.x size={20} /></button>
      </header>

      <nav className="imkan-file-details-tabs" role="tablist" aria-label={locale === "ar" ? "خصائص الملف" : "File properties"}>
        {([
          ["general", "info", locale === "ar" ? "المعلومات العامة" : "General Info"],
          ["versions", "history", locale === "ar" ? "الإصدارات" : "Versions"],
          ["activity", "spark", locale === "ar" ? "النشاط" : "Activity"],
          ["access", "link", locale === "ar" ? "إحصائيات الوصول" : "Access Stats"],
        ] as const).map(([item, icon, text]) => {
          const Icon = Icons[icon];
          return <button key={item} type="button" role="tab" aria-selected={tab === item} disabled={item === "versions" && !isFile} onClick={() => changeTab(item)} className={tab === item ? "active" : ""}><Icon size={20} /><span>{text}</span></button>;
        })}
      </nav>

      <section className="imkan-file-details-body">
        {error ? <div className="imkan-file-details-inline-error">{error}</div> : null}

        {tab === "general" ? (
          <div className="imkan-general-info">
            <div className="imkan-general-info-details">
              <InfoRow label={locale === "ar" ? "نوع الملف" : "File Format"} value={typeText} />
              <InfoRow label={locale === "ar" ? "أنشأه" : "Created by"} value={`${owner} · ${dateTime(createdAt, locale)}`} />
              <InfoRow label={locale === "ar" ? "تم التعديل بواسطة" : "Modified by"} value={`${owner} · ${dateTime(modifiedAt, locale)}`} />
              {isFile ? <InfoRow label={locale === "ar" ? "الحجم" : "Size"} value={formatBytes(file?.size ?? 0)} /> : <InfoRow label={locale === "ar" ? "العناصر" : "Items"} value={String(folder?.itemCount ?? 0)} />}
              <InfoRow label={locale === "ar" ? "المساحة المستخدمة" : "Storage Used"} value={formatBytes(storageUsed)} />
              <InfoRow label={locale === "ar" ? "الرابط الدائم" : "Permalink"} value={permalink} link />
            </div>
            <div className="imkan-general-preview">
              {previewUrl ? <img src={previewUrl} alt="" /> : <div className="imkan-general-preview-placeholder"><FileTypeIcon kind={kind} size={48} /></div>}
            </div>
            <div className="imkan-general-metrics">
              <span><Icons.inbox size={14} /> {comments} {locale === "ar" ? "تعليقات" : "Comments"}</span>
              <span><Icons.eye size={14} /> {views} {locale === "ar" ? "مشاهدات" : "Views"}</span>
              <span><Icons.download size={14} /> {downloads} {locale === "ar" ? "تنزيلات" : "Downloads"}</span>
            </div>
          </div>
        ) : null}

        {tab === "versions" ? (
          <div className="imkan-details-section">
            <div className="imkan-details-section-head">
              <div><h2>{locale === "ar" ? "إصدارات الملف" : "File Versions"}</h2><p>{locale === "ar" ? "عرض وإدارة جميع الإصدارات المحفوظة لهذا الملف." : "View and manage every saved version of this file."}</p></div>
              <div className="imkan-details-section-actions"><span className="imkan-current-version">{locale === "ar" ? `الإصدار الحالي ${currentVersion ? `v${currentVersion.versionNumber}` : "—"}` : `Current ${currentVersion ? `v${currentVersion.versionNumber}` : "—"}`}</span><input ref={uploadRef} type="file" hidden onChange={(event) => void handleUploadNewVersion(event.target.files?.[0])} /><button type="button" className="imkan-primary-small" disabled={uploadBusy} onClick={() => uploadRef.current?.click()}><Icons.upload size={14} /> {uploadBusy ? (locale === "ar" ? "جارٍ الرفع…" : "Uploading…") : (locale === "ar" ? "رفع إصدار جديد" : "Upload new version")}</button></div>
            </div>
            <div className="imkan-version-list">
              {versions.map((version) => (
                <div className={`imkan-version-row ${version.isCurrent ? "current" : ""}`} key={version.id}>
                  <div className="imkan-version-badge"><Icons.history size={17} /></div>
                  <div className="imkan-version-main"><div className="imkan-version-title"><strong>v{version.versionNumber}</strong>{version.isCurrent ? <span>{locale === "ar" ? "الإصدار الحالي" : "Current version"}</span> : null}</div><p>{version.uploadedBy?.name || version.uploadedBy?.email || owner} · {dateTime(version.createdAt, locale)}</p></div>
                  <div className="imkan-version-size">{formatBytes(version.size)}</div>
                  <div className="imkan-version-actions"><button type="button" className="imkan-icon-action" aria-label={locale === "ar" ? "إجراءات الإصدار" : "Version actions"} onClick={() => setOpenVersionMenu((value) => value === version.id ? null : version.id)}><Icons.dots size={18} /></button>{openVersionMenu === version.id ? <div className="imkan-version-menu"><button type="button" disabled={versionBusy === version.id} onClick={() => void previewVersion(version)}><Icons.eye size={14} /> {locale === "ar" ? "معاينة" : "Preview"}</button><button type="button" disabled={versionBusy === version.id} onClick={() => void previewVersion(version)}><Icons.download size={14} /> {locale === "ar" ? "تنزيل" : "Download"}</button>{!version.isCurrent ? <button type="button" disabled={versionBusy === version.id} onClick={() => void restoreVersion(version)}><Icons.history size={14} /> {locale === "ar" ? "استعادة كإصدار حالي" : "Restore as current"}</button> : null}</div> : null}</div>
                </div>
              ))}
              {versions.length === 0 ? <div className="imkan-details-empty"><Icons.history size={28} /><p>{locale === "ar" ? "لا توجد إصدارات محفوظة بعد." : "No saved versions yet."}</p></div> : null}
            </div>
          </div>
        ) : null}

        {tab === "activity" ? (
          <div className="imkan-details-section">
            <div className="imkan-details-section-head"><div><h2>{locale === "ar" ? "النشاط" : "Activity"}</h2><p>{locale === "ar" ? "سجل جميع الأنشطة التي تمت على هذا الملف." : "A chronological record of activity on this file."}</p></div></div>
            <ol className="imkan-activity-list">
              {activities.map((activity) => { const sameAsOwner = Boolean(file?.owner?.id && file.owner.id === activity.user_id); const actorName = sameAsOwner ? (file?.owner.name || file?.owner.email || (locale === "ar" ? "أنت" : "You")) : (locale === "ar" ? "مستخدم" : "User"); return <li key={activity.id}><div className="imkan-activity-date"><strong>{dateOnly(activity.created_at, locale)}</strong><span>{timeOnly(activity.created_at, locale)}</span></div><div className="imkan-activity-line"><span className="imkan-activity-dot"><Icons.eye size={13} /></span></div><div className="imkan-activity-card"><div className="imkan-activity-avatar">{actorName.slice(0,1).toUpperCase()}</div><div><strong>{sameAsOwner ? (locale === "ar" ? "أنت" : "You") : actorName}</strong><p>{activityText(activity.action, locale)}</p><time>{dateTime(activity.created_at, locale)} · {relative(activity.created_at, locale)}</time></div></div></li>; })}
              {activities.length === 0 ? <li className="imkan-details-empty"><Icons.spark size={28} /><p>{locale === "ar" ? "لا يوجد نشاط مسجل لهذا الملف بعد." : "No activity has been recorded for this file yet."}</p></li> : null}
            </ol>
          </div>
        ) : null}

        {tab === "access" ? (
          <div className="imkan-details-section">
            <div className="imkan-details-section-head"><div><h2>{locale === "ar" ? "إحصائيات الوصول" : "Access Stats"}</h2><p>{locale === "ar" ? "اعرف من وصل إلى الملف وما الإجراءات التي قام بها." : "See who accessed the file and what they did."}</p></div></div>
            <div className="imkan-access-overall"><div><strong>{actors.length}</strong><span>{locale === "ar" ? "عضو فريق" : "Team members"}</span><small>0 {locale === "ar" ? "مستخدم خارجي" : "external users"}</small></div><div><strong><Icons.eye size={17} /> {views}</strong><span>{locale === "ar" ? "مشاهدات" : "Views"}</span></div><div><strong><Icons.download size={17} /> {downloads}</strong><span>{locale === "ar" ? "تنزيلات" : "Downloads"}</span></div></div>
            <div className="imkan-access-card"><button type="button" className="imkan-access-card-head" onClick={() => setAccessExpanded((value) => !value)}><span><Icons.link size={17} /> <strong>Permalink</strong></span><span className="imkan-access-card-totals">{views} {locale === "ar" ? "مشاهدة" : "Views"} <i /> {downloads} {locale === "ar" ? "تنزيل" : "Downloads"}</span><Icons.chevD size={17} className={accessExpanded ? "rotate-180" : ""} /></button>{accessExpanded ? <div className="imkan-access-expanded"><div className="imkan-access-table-head"><span>{locale === "ar" ? "تم الوصول بواسطة والوقت" : "Accessed by & time"}</span><span>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</span><span>{locale === "ar" ? "المشاهدات" : "Views"}</span><span>{locale === "ar" ? "التنزيلات" : "Downloads"}</span></div>{actors.map((actor) => <div className="imkan-access-row" key={actor.id}><div className="imkan-access-user"><span className="imkan-access-avatar">{actor.name.slice(0,1).toUpperCase()}</span><div><strong>{actor.name}</strong><small>{locale === "ar" ? "تم الوصول إلى الملف" : "Accessed this file"}</small></div></div><span>{actor.email || "—"}</span><strong>{actor.views}</strong><strong>{actor.downloads}</strong></div>)}{actors.length === 0 ? <div className="imkan-access-empty">{locale === "ar" ? "لم يتم تسجيل وصول إلى هذا الرابط بعد." : "No access has been recorded for this link yet."}</div> : null}</div> : null}</div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return <div className="imkan-info-row"><span>{label}</span>{link ? <a href={value} title={value}>{value}</a> : <strong title={value}>{value}</strong>}</div>;
}
