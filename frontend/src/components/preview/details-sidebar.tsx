"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { formatBytes } from "../../lib/api/quota";
import { getFileActivities, type FileActivityRecord } from "../../lib/api/preview";
import { getFileDetails, type FileDetailsResponse } from "../../lib/api/files";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { Icons } from "../layout/icons";
import { formatDateLocalized } from "../../lib/localized";

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

/**
 * Preview-panel Details uses the same card layout as the secondary inspector rail
 * (wd-zoho-details) so review and browse share one details experience.
 */
export function DetailsSidebar({
  open,
  fileId,
  fileName,
  mimeType,
  size,
  versionNumber,
  updatedAt,
  onClose,
  onShare,
  onViewVersions,
}: DetailsSidebarProps) {
  const { locale, label } = useLocale();
  const ar = locale === "ar";
  const [activities, setActivities] = useState<FileActivityRecord[] | null>(null);
  const [details, setDetails] = useState<FileDetailsResponse | null>(null);
  const [desc, setDesc] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setActivities(null);
    setDetails(null);
    try {
      const stored = localStorage.getItem(`wd.desc.${fileId}`) ?? localStorage.getItem(`imkan.file.description.${fileId}`) ?? "";
      setDesc(stored);
      setDescDraft(stored);
    } catch {
      setDesc("");
      setDescDraft("");
    }
    setEditingDesc(false);
    void Promise.all([getFileActivities(fileId, 50), getFileDetails(fileId)])
      .then(([rows, value]) => {
        if (!cancelled) {
          setActivities(rows);
          setDetails(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActivities([]);
          setDetails(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, fileId]);

  if (!open) return null;

  const effectiveName = details?.name || fileName;
  const kind = fileIconKind(mimeType || details?.mimeType || "", effectiveName);
  const extension = effectiveName.includes(".")
    ? effectiveName.slice(effectiveName.lastIndexOf(".") + 1).toUpperCase()
    : "—";
  const views =
    activities?.filter((row) => ["VIEW", "PREVIEW"].some((key) => String(row.action).toUpperCase().includes(key)))
      .length ?? 0;
  const downloads =
    activities?.filter((row) => String(row.action).toUpperCase().includes("DOWNLOAD")).length ?? 0;
  const comments =
    activities?.filter((row) => String(row.action).toUpperCase().includes("COMMENT")).length ?? 0;
  const permalink =
    typeof window === "undefined"
      ? `/files?file=${encodeURIComponent(fileId)}`
      : `${window.location.origin}/files?file=${encodeURIComponent(fileId)}`;
  const storageBytes = details?.size ?? size;
  const createdLabel = details?.createdAt
    ? formatDateLocalized(details.createdAt, locale)
    : "—";
  const modifiedLabel = details?.updatedAt
    ? formatDateLocalized(details.updatedAt, locale)
    : updatedAt
      ? formatDateLocalized(updatedAt, locale)
      : "—";
  const ownerLabel = details?.owner?.name || details?.owner?.email || "—";
  const locationName = details?.location?.name || (ar ? "مجلداتي" : "My Folders");
  const tags = details?.tags ?? [];

  function saveDescription() {
    const next = descDraft.slice(0, 2000);
    setDesc(next);
    setEditingDesc(false);
    try {
      localStorage.setItem(`wd.desc.${fileId}`, next);
      localStorage.setItem(`imkan.file.description.${fileId}`, next);
    } catch {
      /* private mode */
    }
  }

  async function copyPermalink() {
    try {
      await navigator.clipboard.writeText(permalink);
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="zoho-preview-panel" dir={ar ? "rtl" : "ltr"}>
      <header className="zoho-preview-panel-head">
        <div>
          <h2>{ar ? "التفاصيل" : "Details"}</h2>
          <p className="truncate" title={effectiveName}>
            {effectiveName}
          </p>
        </div>
        {onClose ? (
          <button type="button" className="zoho-panel-close" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>
            ×
          </button>
        ) : null}
      </header>

      <div className="zoho-preview-panel-body">
        <div className="wd-zoho-details">
          <div className="wd-zoho-details-head">
            <FileTypeIcon kind={kind} size={18} />
            <span className="wd-zoho-details-name" title={effectiveName}>
              {effectiveName}
            </span>
            <button
              type="button"
              className="wd-zoho-details-rename"
              aria-label={ar ? "إضافة وصف" : "Add description"}
              onClick={() => {
                setDescDraft(desc);
                setEditingDesc(true);
              }}
            >
              <Icons.pencil size={14} />
            </button>
          </div>

          {editingDesc ? (
            <div className="wd-zoho-desc-box">
              <textarea
                value={descDraft}
                maxLength={2000}
                onChange={(e) => setDescDraft(e.target.value.slice(0, 2000))}
                className="wd-zoho-desc-textarea"
                autoFocus
                placeholder={ar ? "إضافة وصف (بحد أقصى 2000 حرف)" : "Add description (Max. 2000 characters)"}
                rows={4}
              />
              <div className="wd-zoho-desc-actions">
                <button
                  type="button"
                  className="wd-zoho-desc-cancel"
                  onClick={() => {
                    setEditingDesc(false);
                    setDescDraft(desc);
                  }}
                >
                  {ar ? "إلغاء" : "Cancel"}
                </button>
                <button type="button" className="wd-zoho-desc-save" onClick={saveDescription}>
                  {ar ? "حفظ" : "Save"}
                </button>
              </div>
            </div>
          ) : desc ? (
            <p className="wd-zoho-details-desc">{desc}</p>
          ) : (
            <button
              type="button"
              className="wd-zoho-details-add-desc"
              onClick={() => {
                setDescDraft("");
                setEditingDesc(true);
              }}
            >
              {ar ? "إضافة وصف" : "Add a description"}
            </button>
          )}

          <div className="wd-zoho-details-block">
            <div className="wd-zoho-details-kicker">{ar ? "أنشئ بواسطة" : "Created by"}</div>
            <div className="wd-zoho-details-value">{ownerLabel}</div>
          </div>

          <div className="wd-zoho-details-block">
            <div className="wd-zoho-details-kicker">{ar ? "مشارك مع" : "Shared with"}</div>
            <div className="wd-zoho-details-share-line">
              <span>{ar ? "خاص، غير مشارك مع أي شخص." : "Private, not shared with anyone."}</span>
              {onShare ? (
                <button type="button" className="wd-zoho-details-link" onClick={onShare}>
                  {ar ? "مشاركة" : "Share"}
                </button>
              ) : null}
            </div>
            <div className="wd-zoho-details-stats">
              <div className="wd-zoho-details-stats-row">
                <span>
                  ◉ {views} {ar ? "مشاهدة" : "Views"}
                </span>
                <span>
                  ⇩ {downloads} {ar ? "تنزيل" : "Downloads"}
                </span>
              </div>
              <div className="wd-zoho-details-stats-row">
                <span>
                  ▢ {comments} {ar ? "تعليقات" : "Comments"}
                </span>
              </div>
            </div>
          </div>

          <div className="wd-zoho-details-block">
            <div className="wd-zoho-details-kicker">{ar ? "الرابط الدائم" : "Permalink"}</div>
            <div className="wd-zoho-details-permalink">
              <a href={permalink} title={permalink} className="truncate">
                {permalink}
              </a>
              <button
                type="button"
                onClick={() => void copyPermalink()}
                className="wd-zoho-details-copy"
                aria-label={ar ? "نسخ" : "Copy"}
              >
                <Icons.copy size={14} />
              </button>
            </div>
          </div>

          <div className="wd-zoho-details-block">
            <div className="wd-zoho-details-kicker">{ar ? "الموقع" : "Location"}</div>
            <div className="wd-zoho-details-location">
              <Icons.folder size={14} /> <span>{locationName}</span>
            </div>
          </div>

          <div className="wd-zoho-details-block">
            <div className="wd-zoho-details-kicker">{ar ? "التصنيفات" : "Labels"}</div>
            {tags.length ? (
              <div className="wd-zoho-details-labels">
                {tags.map((tag) => (
                  <span key={tag.name} className="wd-zoho-details-label-chip">
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="wd-zoho-details-value muted">{ar ? "إضافة تصنيفات" : "Add labels"}</div>
            )}
          </div>

          <div className="wd-zoho-details-stats">
            <div className="wd-zoho-details-stats-row">
              <span>{ar ? "النوع" : "Type"}</span>
              <strong>{extension === "—" ? mimeType || "—" : extension}</strong>
            </div>
            <div className="wd-zoho-details-stats-row">
              <span>{ar ? "وقت الإنشاء" : "Time Created"}</span>
              <strong>{createdLabel}</strong>
            </div>
            <div className="wd-zoho-details-stats-row">
              <span>{ar ? "تم التعديل بواسطة" : "Modified by"}</span>
              <strong>
                {ownerLabel} · {modifiedLabel}
              </strong>
            </div>
            <div className="wd-zoho-details-stats-row">
              <span>{ar ? "المساحة المستخدمة" : "Storage Used"}</span>
              <strong>{formatBytes(storageBytes)}</strong>
            </div>
          </div>

          {onViewVersions ? (
            <button type="button" className="wd-zoho-details-versions" onClick={onViewVersions}>
              ◷ {ar ? "عرض كل الإصدارات" : "View all versions"}
              {versionNumber ? ` · v${versionNumber}` : ""}
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
