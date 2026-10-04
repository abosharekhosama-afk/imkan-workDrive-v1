"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { formatBytes } from "../../lib/api/quota";
import { getFileActivities, type FileActivityRecord } from "../../lib/api/preview";
import { getFileDetails, type FileDetailsResponse } from "../../lib/api/files";

interface DetailsSidebarProps {
  open: boolean;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  versionNumber?: number;
  updatedAt?: string | null;
  onClose?: () => void;
  onShare?: () => void;
  onViewVersions?: () => void;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DetailsSidebar({ open, fileId, fileName, mimeType, size, versionNumber, updatedAt, onClose, onShare, onViewVersions }: DetailsSidebarProps) {
  const { locale, label } = useLocale();
  const ar = locale === "ar";
  const [activities, setActivities] = useState<FileActivityRecord[] | null>(null);
  const [details, setDetails] = useState<FileDetailsResponse | null>(null);
  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setActivities(null);
    setDetails(null);
    try { setDescription(localStorage.getItem(`imkan.file.description.${fileId}`) ?? ""); } catch { setDescription(""); }
    setEditingDescription(false);
    void Promise.all([getFileActivities(fileId, 50), getFileDetails(fileId)])
      .then(([rows, value]) => { if (!cancelled) { setActivities(rows); setDetails(value); } })
      .catch(() => { if (!cancelled) { setActivities([]); setDetails(null); } });
    return () => { cancelled = true; };
  }, [open, fileId]);

  if (!open) return null;

  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toUpperCase() : "—";
  const effectiveName = details?.name || fileName;
  const views = activities?.filter((row) => ["VIEW", "PREVIEW"].some((key) => row.action.includes(key))).length ?? 0;
  const downloads = activities?.filter((row) => row.action.includes("DOWNLOAD")).length ?? 0;
  const comments = activities?.filter((row) => row.action.includes("COMMENT")).length ?? 0;
  const permalink = typeof window === "undefined" ? `/files?file=${encodeURIComponent(fileId)}` : `${window.location.origin}/files?file=${encodeURIComponent(fileId)}`;

  return (
    <aside className="zoho-preview-side" aria-label={label("preview.fileDetails")} dir={ar ? "rtl" : "ltr"}>
      <header className="zoho-preview-panel-head">
        <div><h2>{label("preview.fileDetails")}</h2><p>{effectiveName}</p></div>
        {onClose ? <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={label("preview.close")}>×</button> : null}
      </header>
      <section className="zoho-side-section zoho-details-owner">
        {editingDescription ? (
          <div className="zoho-details-description-edit"><input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { localStorage.setItem(`imkan.file.description.${fileId}`, description); setEditingDescription(false); } if (e.key === "Escape") setEditingDescription(false); }} /><button type="button" onClick={() => { localStorage.setItem(`imkan.file.description.${fileId}`, description); setEditingDescription(false); }}>✓</button></div>
        ) : (
          <button type="button" className="zoho-details-description" onClick={() => setEditingDescription(true)}>{description || (ar ? "إضافة وصف" : "Add description")}</button>
        )}
        <div className="zoho-details-owner-row">
          <span className="zoho-details-avatar">{(details?.owner?.name || details?.owner?.email || "?").slice(0, 1).toUpperCase()}</span>
          <div><span>{ar ? "أنشأه" : "Created by"}</span><strong>{details?.owner?.name || details?.owner?.email || "—"}</strong></div>
        </div>
      </section>
      <section className="zoho-side-section">
        <div className="zoho-details-label-row"><span>{ar ? "تمت المشاركة مع" : "Shared with"}</span><button type="button" onClick={onShare}>{ar ? "مشاركة" : "Share"}</button></div>
        <div className="zoho-details-private">⌕ <span>{ar ? "خاص، غير مشارك مع أي شخص." : "Private, not shared with anyone."}</span></div>
        <div className="zoho-details-stats"><span>◉ {views} {ar ? "مشاهدة" : "Views"}</span><span>⇩ {downloads} {ar ? "تنزيل" : "Downloads"}</span><span>▢ {comments} {ar ? "تعليقات" : "Comments"}</span></div>
      </section>
      <section className="zoho-side-section">
        <div className="zoho-details-meta-block"><span>{ar ? "الرابط الدائم" : "Permalink"}</span><a href={permalink} title={permalink}>{permalink}</a></div>
        <div className="zoho-details-meta-block"><span>{ar ? "الموقع" : "Location"}</span><strong>{details?.location?.name || (ar ? "مجلداتي" : "My Folders")}</strong><small>{ar ? "فتح موقع الملف" : "Go to file location"}</small></div>
        <div className="zoho-details-meta-block"><span>{ar ? "التصنيفات" : "Labels"}</span><strong>{details?.tags?.length ? details.tags.map((tag) => tag.name).join(", ") : (ar ? "إضافة تصنيفات" : "Add labels")}</strong></div>
        <div className="zoho-details-meta-block"><span>{ar ? "النوع" : "Type"}</span><strong>{extension === "—" ? mimeType : extension}</strong></div>
        <div className="zoho-details-meta-block"><span>{ar ? "وقت الإنشاء" : "Time Created"}</span><strong>{details?.createdAt ? formatDateTime(details.createdAt) : "—"}</strong></div>
        <div className="zoho-details-meta-block"><span>{ar ? "تم التعديل بواسطة" : "Modified by"}</span><strong>{details?.updatedAt ? `${details.owner?.name || details.owner?.email || "—"} · ${formatDateTime(details.updatedAt)}` : updatedAt ? formatDateTime(updatedAt) : "—"}</strong></div>
        <div className="zoho-details-meta-block"><span>{ar ? "المساحة المستخدمة" : "Storage Used"}</span><strong>{formatBytes(details?.size ?? size)}</strong><small>{ar ? "المساحة المستخدمة لهذا الملف." : "Storage used by this file."}</small></div>
        <button type="button" className="zoho-details-versions" onClick={onViewVersions}>◷ {ar ? "عرض كل الإصدارات" : "View all versions"}{versionNumber ? ` · v${versionNumber}` : ""}</button>
      </section>
    </aside>
  );
}
