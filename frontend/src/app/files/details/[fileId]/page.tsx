"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import { FileTypeIcon, fileIconKind } from "../../../../components/file-icon";
import { getFileDetails, type FileDetailsResponse } from "../../../../lib/api/files";
import { getFileActivities, type FileActivityRecord } from "../../../../lib/api/preview";
import { getVersionHistory, type VersionRecord } from "../../../../lib/api/versions";
import { getFolder } from "../../../../lib/api/folders";
import { formatBytes } from "../../../../lib/api/quota";
import { getVersionDownloadUrlById } from "../../../../lib/api/versions";

type Tab = "general" | "versions" | "activity" | "access";
type FolderLike = { id: string; name: string; parentId?: string | null; ownerName?: string | null; ownerEmail?: string | null; updatedAt?: string | null; itemCount?: number | null };

function dateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; }
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

export default function FileInformationPage() {
  const { label, locale } = useLocale();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      try {
        const row = await getFolder(resourceId);
        setFolder(row); setFile(null); setActivities([]); setVersions([]);
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
  const actors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; avatarUrl?: string | null; views: number; downloads: number }>();
    for (const a of activities) {
      const actor = a.actor;
      if (!actor) continue;
      const id = actor.id || a.user_id || "unknown";
      const current = map.get(id) ?? { id, name: actor.name || actor.email, email: actor.email, avatarUrl: actor.avatarUrl, views: 0, downloads: 0 };
      if (a.action === "PREVIEW") current.views += 1;
      if (a.action === "DOWNLOAD") current.downloads += 1;
      map.set(id, current);
    }
    return [...map.values()].sort((a,b) => (b.views+b.downloads)-(a.views+a.downloads));
  }, [activities]);

  function changeTab(next: Tab) {
    setTab(next);
    router.replace(`/files/details/${encodeURIComponent(resourceId)}?tab=${next}`, { scroll: false });
  }

  if (loading) return <main className="zoho-file-info-page"><div className="zoho-file-info-loading">{label("common.loading")}</div></main>;
  if (error) return <main className="zoho-file-info-page"><div className="zoho-file-info-error">{error}<button onClick={() => void load()}>{locale === "ar" ? "إعادة المحاولة" : "Reload"}</button></div></main>;

  const title = isFile ? (file?.name ?? name) : name;
  const typeText = isFile ? (file?.mimeType || file?.extension || label("files.type.file")) : (locale === "ar" ? "مجلد" : "Folder");
  const owner = file?.owner.name || file?.owner.email || folder?.ownerName || folder?.ownerEmail || "—";
  const location = file?.location?.name || (locale === "ar" ? "مجلداتي" : "My Folders");

  return (
    <main className="zoho-file-info-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="zoho-file-info-head">
        <div className="zoho-file-info-title-wrap">
          <FileTypeIcon kind={kind} size={25} />
          <div><h1>{title}</h1><button type="button" onClick={() => router.push(file?.location?.id ? `/files/${file.location.id}` : "/files")} className="zoho-file-info-location">⌂ {location}</button></div>
        </div>
        <button type="button" className="zoho-file-info-close" onClick={() => router.back()} aria-label={locale === "ar" ? "إغلاق" : "Close"}>×</button>
      </header>

      <nav className="zoho-file-info-tabs" role="tablist">
        {(["general","versions","activity","access"] as Tab[]).map((item) => {
          const labels: Record<Tab,string> = { general: locale === "ar" ? "المعلومات العامة" : "General Info", versions: locale === "ar" ? "الإصدارات" : "Versions", activity: locale === "ar" ? "النشاط" : "Activity", access: locale === "ar" ? "إحصائيات الوصول" : "Access Stats" };
          return <button key={item} role="tab" aria-selected={tab === item} disabled={item === "versions" && !isFile} onClick={() => changeTab(item)} className={tab === item ? "active" : ""}>{item === "general" ? "ⓘ" : item === "versions" ? "◷" : item === "activity" ? "⌁" : "⌘"}<span>{labels[item]}</span></button>;
        })}
      </nav>

      <section className="zoho-file-info-body">
        {tab === "general" ? (
          <div className="zoho-general-grid">
            <div className="zoho-general-facts">
              <InfoRow label={locale === "ar" ? "النوع" : "Type"} value={typeText} />
              <InfoRow label={locale === "ar" ? "أنشأه" : "Created by"} value={owner} />
              <InfoRow label={locale === "ar" ? "آخر تعديل" : "Modified by"} value={file?.updatedAt ? `${owner} ${locale === "ar" ? "في" : "on"} ${dateTime(file.updatedAt, locale)}` : folder?.updatedAt ? dateTime(folder.updatedAt, locale) : "—"} />
              <InfoRow label={locale === "ar" ? "الموقع" : "Location"} value={location} />
              {isFile ? <InfoRow label={locale === "ar" ? "المساحة المستخدمة" : "Storage Used"} value={formatBytes(file?.size ?? 0)} /> : <InfoRow label={locale === "ar" ? "العناصر" : "Items"} value={String(folder?.itemCount ?? 0)} />}
              <InfoRow label={locale === "ar" ? "الرابط الدائم" : "Permalink"} value={`${window.location.origin}/files/details/${resourceId}`} link />
            </div>
            <div className="zoho-general-preview"><div><FileTypeIcon kind={kind} size={42} /></div></div>
            <div className="zoho-general-metrics"><span>▢ {comments} {locale === "ar" ? "تعليقات" : "Comments"}</span><span>◉ {views} {locale === "ar" ? "مشاهدة" : "Views"}</span><span>⇩ {downloads} {locale === "ar" ? "تنزيل" : "Downloads"}</span></div>
          </div>
        ) : null}

        {tab === "versions" ? (
          <div className="zoho-info-content">
            <div className="zoho-section-heading"><div><h2>{locale === "ar" ? "إصدارات الملف" : "File versions"}</h2><p>{versions.length} {locale === "ar" ? "إصدار" : "versions"}</p></div><span className="zoho-current-badge">{locale === "ar" ? `الحالي v${versions.find(v=>v.isCurrent)?.versionNumber ?? "—"}` : `Current v${versions.find(v=>v.isCurrent)?.versionNumber ?? "—"}`}</span></div>
            <div className="zoho-versions-table-wrap"><table className="zoho-info-table"><thead><tr><th>{locale === "ar" ? "الإصدار" : "Version"}</th><th>{locale === "ar" ? "التاريخ" : "Date"}</th><th>{locale === "ar" ? "بواسطة" : "Modified by"}</th><th>{locale === "ar" ? "الحجم" : "Size"}</th><th></th></tr></thead><tbody>{versions.map(v => <tr key={v.id}><td><strong>v{v.versionNumber}</strong>{v.isCurrent ? <span className="zoho-mini-badge">{locale === "ar" ? "الحالي" : "Current"}</span> : null}</td><td>{dateTime(v.createdAt, locale)}</td><td>{v.uploadedBy?.name || v.uploadedBy?.email || "—"}</td><td>{formatBytes(v.size)}</td><td><div className="zoho-row-actions"><button onClick={async()=>{try{const u=await getVersionDownloadUrlById(resourceId,v.id); window.open(u.download_url,"_blank","noopener")}catch{}}}>{locale === "ar" ? "عرض" : "View"}</button>{!v.isCurrent ? <button onClick={async()=>{try{await (await import("../../../../lib/api/versions")).restoreVersionById(resourceId,v.id); await load()}catch{}}}>{locale === "ar" ? "استعادة" : "Restore"}</button> : null}</div></td></tr>)}</tbody></table></div>
          </div>
        ) : null}

        {tab === "activity" ? (
          <div className="zoho-info-content"><div className="zoho-section-heading"><div><h2>{locale === "ar" ? "النشاط" : "Activity"}</h2><p>{locale === "ar" ? "سجل نشاط هذا الملف" : "Timeline of activity on this file"}</p></div></div><ol className="zoho-activity-timeline">{activities.map(a => <li key={a.id}><span className="zoho-timeline-dot">{a.action === "DOWNLOAD" ? "⇩" : a.action === "PREVIEW" ? "◉" : a.action === "DELETE" ? "×" : "+"}</span><div><strong>{a.actor?.name || a.actor?.email || (locale === "ar" ? "أنت" : "You")}</strong><p>{activityText(a.action, locale)}</p><time>{dateTime(a.created_at, locale)} · {relative(a.created_at, locale)}</time></div></li>)}</ol>{activities.length === 0 ? <div className="zoho-empty">{locale === "ar" ? "لا يوجد نشاط بعد." : "No activity yet."}</div> : null}</div>
        ) : null}

        {tab === "access" ? (
          <div className="zoho-info-content"><div className="zoho-section-heading"><div><h2>{locale === "ar" ? "إحصائيات الوصول" : "Access Stats"}</h2><p>{locale === "ar" ? "من شاهد أو نزّل الملف" : "Who viewed or downloaded this file"}</p></div></div><div className="zoho-access-overall"><div><strong>◉ {views}</strong><span>{locale === "ar" ? "مشاهدة" : "Views"}</span></div><div><strong>⇩ {downloads}</strong><span>{locale === "ar" ? "تنزيل" : "Downloads"}</span></div><div><strong>{actors.length}</strong><span>{locale === "ar" ? "أعضاء" : "Team members"}</span></div></div><div className="zoho-access-card"><div className="zoho-access-card-head"><strong>⌘ {locale === "ar" ? "الرابط الدائم" : "Permalink"}</strong><span>{views} {locale === "ar" ? "مشاهدة" : "Views"} · {downloads} {locale === "ar" ? "تنزيل" : "Downloads"}</span></div><div className="zoho-access-table-head"><span>{locale === "ar" ? "تم الوصول بواسطة والوقت" : "Accessed by & time"}</span><span>{locale === "ar" ? "البريد" : "Email"}</span><span>{locale === "ar" ? "المشاهدات" : "Views"}</span><span>{locale === "ar" ? "التنزيلات" : "Downloads"}</span></div>{actors.map(a => <div className="zoho-access-row" key={a.id}><div><span className="zoho-access-avatar">{a.name.slice(0,1).toUpperCase()}</span><div><strong>{a.name}</strong><small>{locale === "ar" ? "عضو في المنظمة" : "Team member"}</small></div></div><span>{a.email || "—"}</span><strong>{a.views}</strong><strong>{a.downloads}</strong></div>)}{actors.length === 0 ? <div className="zoho-empty">{locale === "ar" ? "لم يتم تسجيل عمليات وصول بعد." : "No access has been recorded yet."}</div> : null}</div></div>
        ) : null}
      </section>
    </main>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return <div className="zoho-info-row"><span>{label}</span>{link ? <a href={value} title={value}>{value}</a> : <strong title={value}>{value}</strong>}</div>;
}
function activityText(action: string, locale: string) {
  const ar: Record<string,string> = { PREVIEW:"شاهد هذا الملف", DOWNLOAD:"نزّل هذا الملف", COMMENT:"أضاف تعليقًا", SHARE:"شارك هذا الملف", UNSHARE:"ألغى المشاركة", UPLOAD_VERSION:"رفع إصدارًا جديدًا", RESTORE_VERSION:"استعاد إصدارًا", UPDATE:"حدّث الملف", CREATE:"أنشأ الملف", DELETE:"حذف الملف" };
  const en: Record<string,string> = { PREVIEW:"Viewed this file", DOWNLOAD:"Downloaded this file", COMMENT:"Commented on this file", SHARE:"Shared this file", UNSHARE:"Unshared this file", UPLOAD_VERSION:"Uploaded a new version", RESTORE_VERSION:"Restored a version", UPDATE:"Updated this file", CREATE:"Created this file", DELETE:"Deleted this file" };
  return (locale === "ar" ? ar : en)[action] || action;
}
