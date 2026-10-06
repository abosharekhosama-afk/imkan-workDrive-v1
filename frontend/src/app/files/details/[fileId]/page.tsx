"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "../../../../components/locale-provider";
import { FileTypeIcon, fileIconKind } from "../../../../components/file-icon";
import { Icons } from "../../../../components/layout/icons";
import { getFileDetails, type FileDetailsResponse } from "../../../../lib/api/files";
import { getFileActivities, type FileActivityRecord } from "../../../../lib/api/preview";
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
  const ar: Record<string, string> = {
    PREVIEW: "شاهد هذا الملف", VIEW: "شاهد هذا الملف", DOWNLOAD: "نزّل هذا الملف",
    COMMENT: "أضاف تعليقًا", SHARE: "شارك هذا الملف", UNSHARE: "ألغى مشاركة هذا الملف",
    UPLOAD: "رفع هذا الملف", RESTORE: "استعاد إصدارًا", EDIT: "عدّل هذا الملف",
    EMBED: "أنشأ رمز تضمين لهذا الملف", DELETE_EMBED: "حذف رمز التضمين لهذا الملف",
    ASSOCIATE: "ربط قالب بيانات بالملف",
  };
  const en: Record<string, string> = {
    PREVIEW: "Viewed this file", VIEW: "Viewed this file", DOWNLOAD: "Downloaded this file",
    COMMENT: "Added a comment", SHARE: "Shared this file", UNSHARE: "Removed sharing for this file",
    UPLOAD: "Uploaded this file", RESTORE: "Restored a version", EDIT: "Edited this file",
    EMBED: "Created an embed code for this file", DELETE_EMBED: "Deleted the embed code for this file",
    ASSOCIATE: "Associated a Data Template to the file",
  };
  return (locale === "ar" ? ar : en)[action] ?? action;
}
function activityIcon(action: string) {
  if (action === "DOWNLOAD") return "download";
  if (action === "SHARE" || action === "EMBED") return "share";
  if (action === "DELETE_EMBED" || action === "UNSHARE") return "x";
  if (action === "ASSOCIATE" || action === "UPLOAD") return "plus";
  return "eye";
}

export default function FileDetailsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const params = useParams<{ fileId: string }>();
  const search = useSearchParams();
  const resourceId = decodeURIComponent(String(params.fileId || ""));
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const [tab, setTab] = useState<Tab>("general");
  const [file, setFile] = useState<FileDetailsResponse | null>(null);
  const [folder, setFolder] = useState<FolderLike | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [activities, setActivities] = useState<FileActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [versionBusy, setVersionBusy] = useState<string | null>(null);
  const [openVersionMenu, setOpenVersionMenu] = useState<string | null>(null);
  const [accessExpanded, setAccessExpanded] = useState(true);
  const [publicExpanded, setPublicExpanded] = useState(false);
  const [versionFilter, setVersionFilter] = useState<"active" | "deleted">("active");
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [showCheckoutPanel, setShowCheckoutPanel] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState("");
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!resourceId) return;
    setLoading(true);
    setError("");
    try {
      const details = await getFileDetails(resourceId).catch(() => null);
      if (details) {
        setFile(details);
        setFolder(null);
        const [versionRows, activityRows] = await Promise.all([
          getVersionHistory(resourceId).catch(() => [] as VersionRecord[]),
          getFileActivities(resourceId, 100).catch(() => [] as FileActivityRecord[]),
        ]);
        setVersions(versionRows);
        setActivities(activityRows);
      } else {
        const folderRow = await getFolder(resourceId);
        setFolder(folderRow as FolderLike);
        setFile(null);
        setVersions([]);
        setActivities([]);
      }
    } catch {
      setError(ar ? "تعذر تحميل التفاصيل." : "Unable to load details.");
      setFile(null);
      setFolder(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId, ar]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const next = (search.get("tab") || "general") as Tab;
    if (next === "versions" || next === "activity" || next === "access" || next === "general") setTab(next);
  }, [search]);

  const isFile = Boolean(file);
  const name = file?.name ?? folder?.name ?? "—";
  const kind = fileIconKind(isFile ? "file" : "folder", file?.mimeType ?? null, name);
  const views = activities.filter((a) => a.action === "PREVIEW" || a.action === "VIEW").length;
  const downloads = activities.filter((a) => a.action === "DOWNLOAD").length;
  const comments = activities.filter((a) => a.action === "COMMENT").length;
  const storageUsed = versions.reduce((total, version) => total + (Number.isFinite(version.size) ? version.size : 0), 0) || file?.size || 0;
  const locationName = file?.location?.name || (ar ? "مجلداتي" : "My Folders");
  const permalink = typeof window !== "undefined" ? `${window.location.origin}/files?file=${encodeURIComponent(resourceId)}` : `/files?file=${resourceId}`;

  const actors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; views: number; downloads: number; lastAt: string }>();
    for (const a of activities) {
      const id = a.user_id || "unknown";
      const sameAsOwner = Boolean(file?.owner?.id && file.owner.id === a.user_id);
      const current = map.get(id) ?? {
        id,
        name: sameAsOwner ? (file?.owner?.name || file?.owner?.email || (ar ? "أنت" : "You")) : (ar ? "مستخدم خارجي" : "External User"),
        email: sameAsOwner ? (file?.owner?.email || "") : "",
        views: 0,
        downloads: 0,
        lastAt: a.created_at || a.createdAt || "",
      };
      if (a.action === "PREVIEW" || a.action === "VIEW") current.views += 1;
      if (a.action === "DOWNLOAD") current.downloads += 1;
      const at = a.created_at || a.createdAt || "";
      if (at && (!current.lastAt || new Date(at) > new Date(current.lastAt))) current.lastAt = at;
      map.set(id, current);
    }
    return [...map.values()].sort((a, b) => (b.views + b.downloads) - (a.views + a.downloads));
  }, [activities, file, ar]);

  const activeVersions = versions.filter((v) => v.status !== "DELETED");
  const deletedVersions = versions.filter((v) => v.status === "DELETED");
  const shownVersions = versionFilter === "active" ? activeVersions : deletedVersions;

  function changeTab(next: Tab) {
    setTab(next);
    setShowUploadPanel(false);
    setShowCheckoutPanel(false);
    router.replace(`/files/details/${encodeURIComponent(resourceId)}?tab=${next}`, { scroll: false });
  }

  async function handleUploadNewVersion() {
    if (!selectedFile || !isFile) return;
    setUploadBusy(true);
    try {
      await uploadNewVersion(resourceId, selectedFile);
      setShowUploadPanel(false);
      setSelectedFile(null);
      setVersionNotes("");
      await load();
      changeTab("versions");
    } catch {
      setError(ar ? "تعذر رفع الإصدار الجديد." : "Unable to upload the new version.");
    } finally {
      setUploadBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function previewVersion(version: VersionRecord) {
    setVersionBusy(version.id);
    try {
      const result = await getVersionDownloadUrlById(resourceId, version.id);
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch { /* ignore */ }
    finally { setVersionBusy(null); setOpenVersionMenu(null); }
  }

  async function restoreVersion(version: VersionRecord) {
    setVersionBusy(version.id);
    try {
      await restoreVersionById(resourceId, version.id);
      await load();
    } catch {
      setError(ar ? "تعذر استعادة الإصدار." : "Unable to restore version.");
    } finally {
      setVersionBusy(null);
      setOpenVersionMenu(null);
    }
  }

  async function copyPermalink() {
    try { await navigator.clipboard.writeText(permalink); } catch { /* ignore */ }
  }

  const tabs: Array<{ id: Tab; label: string; icon: keyof typeof Icons }> = [
    { id: "general", label: ar ? "معلومات عامة" : "General Info", icon: "info" },
    { id: "versions", label: ar ? "الإصدارات" : "Versions", icon: "history" },
    { id: "activity", label: ar ? "النشاط" : "Activity", icon: "act" },
    { id: "access", label: ar ? "إحصائيات الوصول" : "Access Stats", icon: "share" },
  ];

  return (
    <div className="zoho-file-details theme-aware-page" dir={ar ? "rtl" : "ltr"} style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif", color: "var(--wd-text, #212121)", background: "var(--wd-canvas, #ffffff)" }}>
      <header className="zoho-fd-header">
        <div className="zoho-fd-title-block">
          <FileTypeIcon kind={kind} size={22} />
          <div className="min-w-0">
            <h1 className="zoho-fd-name" title={name}>{name}</h1>
            <p className="zoho-fd-location"><Icons.folder size={13} /> {locationName}</p>
          </div>
        </div>
        <button type="button" className="zoho-fd-close" onClick={() => router.back()} aria-label={ar ? "إغلاق" : "Close"}>
          <Icons.x size={18} />
        </button>
      </header>

      <nav className="team-manage-nav" role="tablist">
        {tabs.map((item) => {
          const Icon = Icons[item.icon] || Icons.info;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`team-manage-tab ${tab === item.id ? "is-active" : ""}`}
              onClick={() => changeTab(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="zoho-fd-body">
        {loading ? (
          <div className="zoho-fd-loading">{ar ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : error ? (
          <div className="zoho-fd-error" role="alert">{error}</div>
        ) : null}

        {!loading && !error && tab === "general" ? (
          <div className="zoho-fd-general">
            <div className="zoho-fd-general-left">
              <div className="zoho-fd-info-row"><span>{ar ? "النوع" : "Type"}</span><strong>{file?.fileType || file?.mimeType || (isFile ? "File" : "Folder")}</strong></div>
              <div className="zoho-fd-info-row"><span>{ar ? "أنشأه" : "Created by"}</span><strong>{file?.owner?.name || folder?.ownerName || "—"}{file?.createdAt ? ` ${ar ? "في" : "on"} ${dateTime(file.createdAt, locale)}` : ""}</strong></div>
              <div className="zoho-fd-info-row"><span>{ar ? "عدّله" : "Modified by"}</span><strong>{file?.owner?.name || folder?.ownerName || "—"}{file?.updatedAt ? ` ${ar ? "في" : "on"} ${dateTime(file.updatedAt, locale)}` : ""}</strong></div>
              <div className="zoho-fd-info-row"><span>{ar ? "الحجم" : "Size"}</span><strong>{formatBytes(file?.size ?? storageUsed ?? 0)}</strong></div>
              <div className="zoho-fd-info-row"><span>{ar ? "المساحة المستخدمة" : "Storage Used"}</span><strong>{storageUsed > 0 ? formatBytes(storageUsed) : (ar ? "التخزين مجاني لملفات التنسيق الأصلي." : "Storage is free for files in native format.")}</strong></div>
              <div className="zoho-fd-info-row">
                <span>{ar ? "الرابط الدائم" : "Permalink"}</span>
                <button type="button" className="zoho-fd-permalink-pill" onClick={() => void copyPermalink()}>{permalink}</button>
              </div>
            </div>
            <div className="zoho-fd-general-right">
              <div className="zoho-fd-preview-box"><FileTypeIcon kind={kind} size={48} /></div>
              <div className="zoho-fd-stat-line">
                <span><Icons.act size={14} /> {comments} {ar ? "تعليقات" : "Comments"}</span>
                <span><Icons.eye size={14} /> {views} {ar ? "مشاهدات" : "Views"}</span>
                <span><Icons.download size={14} /> {downloads} {ar ? "تنزيلات" : "Downloads"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && tab === "versions" ? (
          <div className="zoho-fd-versions">
            {isFile ? (
              <>
                <div className="zoho-fd-version-filter">
                  <button type="button" className={versionFilter === "active" ? "is-active" : ""} onClick={() => setVersionFilter("active")}>{ar ? "نشط" : "Active"}</button>
                  <button type="button" className={versionFilter === "deleted" ? "is-active" : ""} onClick={() => setVersionFilter("deleted")}>{ar ? "محذوف" : "Deleted"}</button>
                </div>

                <div className="zoho-fd-banner info">
                  <Icons.info size={16} />
                  <p>{ar ? "وفق إعدادات الفريق/المؤسسة، يتم الاحتفاظ بجميع إصدارات الملفات." : "As per your team/organization settings, all file versions will be retained."}{" "}
                    <button type="button" className="zoho-fd-link">{ar ? "اعرف المزيد عن إعدادات الاحتفاظ بالإصدارات" : "Learn more about file version retention settings"}</button>
                  </p>
                </div>

                {showCheckoutPanel ? (
                  <div className="zoho-fd-panel">
                    <div className="zoho-fd-panel-icon"><Icons.pencil size={28} /></div>
                    <p>{ar
                      ? "بعد سحب الملف (Check-Out) لا يمكن للآخرين تعديله، ولن تظهر تغييراتك حتى تقوم بإعادته (Check-In)."
                      : "Once the file is Checked-Out, it cannot be edited by the other collaborators and the changes made by you will not be visible until you Check-In."}</p>
                    <div className="zoho-fd-panel-actions">
                      <button type="button" className="zoho-fd-btn-primary" disabled={checkoutBusy} onClick={() => { setCheckoutBusy(true); setTimeout(() => { setCheckedOut(true); setShowCheckoutPanel(false); setCheckoutBusy(false); }, 400); }}>
                        {ar ? "سحب الملف" : "Check Out"}
                      </button>
                      <button type="button" className="zoho-fd-btn-ghost" onClick={() => setShowCheckoutPanel(false)}>{ar ? "إلغاء" : "Cancel"}</button>
                    </div>
                  </div>
                ) : null}

                {showUploadPanel ? (
                  <div className="zoho-fd-panel">
                    <div className="zoho-fd-upload-row">
                      <input ref={uploadRef} type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} />
                    </div>
                    <textarea
                      ref={notesRef}
                      value={versionNotes}
                      onChange={(e) => setVersionNotes(e.target.value)}
                      placeholder={ar ? "أضف ملاحظات الإصدار" : "Add version notes"}
                      rows={3}
                      className="zoho-fd-notes"
                    />
                    <div className="zoho-fd-panel-actions">
                      <button type="button" className="zoho-fd-btn-primary" disabled={uploadBusy || !selectedFile} onClick={() => void handleUploadNewVersion()}>
                        {uploadBusy ? (ar ? "جارٍ الرفع…" : "Uploading…") : (ar ? "رفع إصدار جديد" : "Upload new version")}
                      </button>
                      <button type="button" className="zoho-fd-btn-ghost" onClick={() => { setShowUploadPanel(false); setSelectedFile(null); setVersionNotes(""); }}>{ar ? "إلغاء" : "Cancel"}</button>
                    </div>
                  </div>
                ) : null}

                {!showUploadPanel && !showCheckoutPanel ? (
                  <div className="zoho-fd-version-toolbar">
                    <div className="zoho-fd-version-actions">
                      <button type="button" onClick={() => { setShowUploadPanel(true); setShowCheckoutPanel(false); }}>
                        <Icons.upload size={15} /> {ar ? "رفع إصدار جديد" : "Upload new version"}
                      </button>
                      <span className="zoho-fd-sep">|</span>
                      <button type="button" onClick={() => { setShowCheckoutPanel(true); setShowUploadPanel(false); }}>
                        <Icons.pencil size={15} /> {checkedOut ? (ar ? "تم السحب" : "Checked out") : (ar ? "سحب الملف" : "Check Out")}
                      </button>
                    </div>
                    <button type="button" className="zoho-fd-danger-link" disabled={!selectedVersionIds.length}>
                      {ar ? "حذف الإصدارات المحددة" : "Bulk delete versions"}
                    </button>
                  </div>
                ) : null}

                <div className="zoho-fd-version-table">
                  <div className="zoho-fd-version-head">
                    <span>{ar ? "إصدارات الملف" : "File Versions"}</span>
                    <span>{ar ? "ملاحظات" : "Notes"}</span>
                    <span>{ar ? "الحجم" : "Size"}</span>
                  </div>
                  {shownVersions.map((version) => (
                    <div key={version.id} className="zoho-fd-version-row">
                      <div className="zoho-fd-version-main">
                        <span className="zoho-fd-version-num">#{version.versionNumber}</span>
                        <div>
                          <div className="zoho-fd-version-date">
                            {dateOnly(version.createdAt, locale)}, {timeOnly(version.createdAt, locale)}
                            {version.isCurrent ? <span className="zoho-fd-top-badge">{ar ? "الإصدار الأعلى" : "Top version"}</span> : null}
                          </div>
                          <div className="zoho-fd-version-uploader">
                            {ar ? "رفعه" : "Uploaded by"} {version.uploadedBy?.name || version.uploadedBy?.email || "—"}
                          </div>
                        </div>
                      </div>
                      <div className="zoho-fd-version-notes">NA</div>
                      <div className="zoho-fd-version-size">
                        {formatBytes(version.size)}
                        <div className="zoho-fd-version-menu-wrap">
                          <button type="button" className="zoho-fd-more" onClick={() => setOpenVersionMenu(openVersionMenu === version.id ? null : version.id)}>⋯</button>
                          {openVersionMenu === version.id ? (
                            <div className="zoho-fd-menu">
                              <button type="button" disabled={versionBusy === version.id} onClick={() => void previewVersion(version)}>
                                {ar ? "معاينة" : "Preview"}
                              </button>
                              <button type="button" disabled={versionBusy === version.id} onClick={() => void previewVersion(version)}>
                                {ar ? "تنزيل" : "Download"}
                              </button>
                              {!version.isCurrent ? (
                                <button type="button" disabled={versionBusy === version.id} onClick={() => void restoreVersion(version)}>
                                  {ar ? "استعادة كإصدار حالي" : "Restore as current"}
                                </button>
                              ) : null}
                              <button type="button" onClick={() => setOpenVersionMenu(null)}>
                                {ar ? "حفظ كملف جديد" : "Save as new file"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {shownVersions.length === 0 ? (
                    <div className="zoho-fd-empty">{ar ? "لا توجد إصدارات في هذه القائمة." : "No versions in this list."}</div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="zoho-fd-empty">{ar ? "الإصدارات متاحة للملفات فقط." : "Versions are available for files only."}</div>
            )}
          </div>
        ) : null}

        {!loading && !error && tab === "activity" ? (
          <div className="zoho-fd-activity">
            {activities.length === 0 ? (
              <div className="zoho-fd-empty">{ar ? "لا يوجد نشاط بعد." : "No activity yet."}</div>
            ) : (
              <ol className="zoho-fd-timeline">
                {activities.map((a, idx) => {
                  const sameAsOwner = Boolean(file?.owner?.id && file.owner.id === a.user_id);
                  const actorName = sameAsOwner
                    ? (file?.owner?.name || file?.owner?.email || (ar ? "أنت" : "You"))
                    : (ar ? `مستخدم خارجي (ضيف #${idx + 1})` : `External User (Guest #${idx + 1})`);
                  const at = a.created_at || a.createdAt || "";
                  const icon = activityIcon(a.action);
                  return (
                    <li key={a.id || `${a.action}-${idx}`} className="zoho-fd-timeline-item">
                      <div className="zoho-fd-timeline-time">{relative(at, locale)}</div>
                      <div className="zoho-fd-timeline-rail">
                        <span className={`zoho-fd-timeline-dot is-${icon}`} />
                      </div>
                      <div className="zoho-fd-timeline-card">
                        <span className="zoho-fd-timeline-avatar">{actorName.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong className={sameAsOwner ? "" : "is-guest"}>{actorName}</strong>
                          <p>{activityText(a.action, locale)}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}

        {!loading && !error && tab === "access" ? (
          <div className="zoho-fd-access">
            <div className="zoho-fd-access-summary">
              <div>
                <strong>{ar ? "إجمالي الوصول" : "Overall Access"}</strong>
                <p>{ar ? `${actors.length} مستخدم` : `${actors.length} user${actors.length === 1 ? "" : "s"}`}</p>
              </div>
              <div className="zoho-fd-access-metric"><Icons.eye size={16} /> <strong>{views}</strong> <span>{ar ? "مشاهدات" : "Views"}</span></div>
              <div className="zoho-fd-access-metric"><Icons.download size={16} /> <strong>{downloads}</strong> <span>{ar ? "تنزيلات" : "Downloads"}</span></div>
            </div>

            <div className="zoho-fd-access-card">
              <button type="button" className="zoho-fd-access-card-head" onClick={() => setAccessExpanded((v) => !v)}>
                <span><Icons.link size={16} /> <strong>{ar ? "الرابط الدائم" : "Permalink"}</strong></span>
                <span className="zoho-fd-access-totals"><Icons.eye size={14} /> {views} {ar ? "مشاهدات" : "Views"} · <Icons.download size={14} /> {downloads} {ar ? "تنزيلات" : "Downloads"}</span>
                <span className="zoho-fd-expand">{accessExpanded ? "−" : "+"}</span>
              </button>
              {accessExpanded ? (
                <div className="zoho-fd-access-body">
                  <div className="zoho-fd-access-table-head">
                    <span>{ar ? "تم الوصول بواسطة والوقت" : "Accessed by & time"}</span>
                    <span>{ar ? "البريد" : "Email"}</span>
                    <span>{ar ? "المشاهدات" : "Views"}</span>
                    <span>{ar ? "التنزيلات" : "Downloads"}</span>
                  </div>
                  {actors.map((actor) => (
                    <div className="zoho-fd-access-row" key={actor.id}>
                      <div className="zoho-fd-access-user">
                        <span className="zoho-fd-timeline-avatar">{actor.name.slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{actor.name}</strong>
                          <small>{actor.lastAt ? dateTime(actor.lastAt, locale) : "—"}</small>
                        </div>
                      </div>
                      <span>{actor.email || "—"}</span>
                      <strong>{actor.views}</strong>
                      <strong>{actor.downloads}</strong>
                    </div>
                  ))}
                  {actors.length === 0 ? <div className="zoho-fd-empty">{ar ? "لا يوجد وصول مسجّل بعد." : "No access has been recorded yet."}</div> : null}
                </div>
              ) : null}
            </div>

            <div className="zoho-fd-access-card">
              <button type="button" className="zoho-fd-access-card-head" onClick={() => setPublicExpanded((v) => !v)}>
                <span><Icons.users size={16} /> <strong>{ar ? "رابط عام" : "Public link"}</strong></span>
                <span className="zoho-fd-access-totals"><Icons.eye size={14} /> 0 {ar ? "مشاهدات" : "Views"} · <Icons.download size={14} /> 0 {ar ? "تنزيلات" : "Downloads"}</span>
                <span className="zoho-fd-expand">{publicExpanded ? "−" : "+"}</span>
              </button>
              {publicExpanded ? (
                <div className="zoho-fd-access-body">
                  <div className="zoho-fd-empty">{ar ? "لا توجد زيارات عبر رابط عام بعد." : "No public link visits yet."}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
