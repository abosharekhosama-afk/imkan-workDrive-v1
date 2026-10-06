"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { Icons } from "../../../components/layout/icons";
import { ConfirmActionModal } from "../../../components/confirm-action-modal";
import { Toast } from "../../../components/toast";
import { listTrash, restoreFile } from "../../../lib/api/trash";
import { emptyTrash, listLargeFiles, permanentDeleteFile, trashFile, type LargeFileRecord } from "../../../lib/api/files";
import { listSharedByMe, updateShareRecipientPermission, type SharedItem } from "../../../lib/api/shared";
import { formatBytes } from "../../../lib/api/quota";
import { FileTypeIcon, fileIconKind } from "../../../components/file-icon";
import { ImkanOptionPicker } from "../../../components/imkan-option-picker";

export default function ManageMyFoldersPage() {
  const { locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "trash" | "shared" | "large">("trash");
  const [trash, setTrash] = useState<any[]>([]);
  const [shared, setShared] = useState<SharedItem[]>([]);
  const [large, setLarge] = useState<LargeFileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error" | "info">("success");
  const [confirm, setConfirm] = useState<{ title: string; description: string; confirm: string; danger?: boolean; run: () => Promise<void> } | null>(null);
  const [updatingShare, setUpdatingShare] = useState<string | null>(null);

  const ar = locale === "ar";

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "trash" || requested === "shared" || requested === "large") setTab(requested);
  }, []);

  const load = useCallback(async (nextTab = tab) => {
    setLoading(true);
    setError(null);
    try {
      if (nextTab === "trash") setTrash(await listTrash());
      if (nextTab === "shared") setShared(await listSharedByMe());
      if (nextTab === "large") setLarge(await listLargeFiles());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? "تعذر تحميل البيانات." : "Unable to load data."));
    } finally {
      setLoading(false);
    }
  }, [ar, tab]);

  useEffect(() => { void load(tab); }, [load, tab]);

  const selectTab = (next: typeof tab) => {
    setTab(next);
    if (next === "search") {
      window.dispatchEvent(new CustomEvent("workdrive:focus-search"));
      router.push("/files");
      return;
    }
    router.replace(`/files/manage?tab=${next}`, { scroll: false });
  };

  const runConfirmed = (config: { title: string; description: string; confirm: string; danger?: boolean; run: () => Promise<void> }) => setConfirm(config);

  const filteredLarge = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return large;
    return large.filter((f) => f.name.toLowerCase().includes(q));
  }, [large, query]);

  const notify = (message: string, tone: "success" | "error" | "info" = "success") => {
    setToastTone(tone);
    setToast(message);
  };

  return (
    <div className="wd-manage-page theme-aware-page" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif", color: "var(--wd-text, #212121)", background: "var(--wd-canvas, #fff)" }}>
      <div className="wd-manage-page-head">
        <div className="wd-manage-title"><Icons.folder size={20} /><strong>{ar ? "مجلداتي" : "My Folders"}</strong></div>
        <button type="button" className="wd-manage-close" onClick={() => router.push("/files")} aria-label="Close">×</button>
      </div>
      <nav className="team-manage-nav" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "trash"} className={`team-manage-tab ${tab === "trash" ? "is-active" : ""}`} onClick={() => selectTab("trash")}><Icons.trash size={20} /><span>{ar ? "سلة المهملات" : "Trash"}</span></button>
        <button type="button" role="tab" aria-selected={tab === "shared"} className={`team-manage-tab ${tab === "shared" ? "is-active" : ""}`} onClick={() => selectTab("shared")}><Icons.share size={20} /><span>{ar ? "العناصر المشتركة" : "Shared Items"}</span></button>
        <button type="button" role="tab" aria-selected={tab === "large"} className={`team-manage-tab ${tab === "large" ? "is-active" : ""}`} onClick={() => selectTab("large")}><Icons.doc size={20} /><span>{ar ? "الملفات الكبيرة" : "Large Files"}</span></button>
      </nav>

      {tab === "trash" ? (
        <TrashPanel rows={trash} loading={loading} ar={ar} onRestore={(id) => runConfirmed({ title: ar ? "استعادة الملف" : "Restore File", description: ar ? "سيتم إعادة الملف إلى موقعه السابق." : "The file will be restored to its previous location.", confirm: ar ? "استعادة" : "Restore", run: async () => { await restoreFile(id); await load("trash"); } })} onDeleteForever={(id) => runConfirmed({ title: ar ? "حذف الملف نهائيًا" : "Delete Forever", description: ar ? "لا يمكن التراجع عن حذف الملف نهائيًا." : "This file will be permanently deleted and cannot be restored.", confirm: ar ? "حذف نهائي" : "Delete Forever", danger: true, run: async () => { await permanentDeleteFile(id); await load("trash"); } })} onEmpty={() => runConfirmed({ title: ar ? "إفراغ سلة المهملات" : "Empty Trash", description: ar ? "سيتم حذف جميع العناصر الموجودة في سلة المهملات نهائيًا." : "All items currently in Trash will be permanently deleted.", confirm: ar ? "إفراغ السلة" : "Empty Trash", danger: true, run: async () => { await emptyTrash(); await load("trash"); } })} />
      ) : null}

      {tab === "shared" ? (
        <SharedPanel rows={shared} loading={loading} ar={ar} updating={updatingShare} onPermission={async (shareId, userId, permission) => { const key = `${shareId}:${userId}`; setUpdatingShare(key); try { await updateShareRecipientPermission(shareId, userId, permission); setShared((current) => current.map((row) => row.id !== shareId ? row : ({ ...row, recipients: row.recipients?.map((r) => r.userId === userId ? { ...r, permission } : r) }))); } catch (cause) { notify(cause instanceof Error ? cause.message : (ar ? "تعذر تحديث الصلاحية" : "Unable to update permission"), "error"); } finally { setUpdatingShare(null); } }} />
      ) : null}

      {tab === "large" ? (
        <div className="wd-manage-large">
          <div className="wd-manage-info"><Icons.info size={17} /><span>{ar ? "راجع الملفات الأكبر من 100 ميجابايت لإدارة التخزين وتوفير المساحة." : "Review files larger than 100 MB to manage storage efficiently and free up space."}</span></div>
          <div className="wd-manage-large-tools"><label className="wd-manage-search"><Icons.search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "بحث" : "Search"} /><button type="button" onClick={() => setQuery("")} aria-label="Clear">×</button></label></div>
          {loading ? <div className="wd-manage-empty">{ar ? "جارٍ التحميل…" : "Loading…"}</div> : filteredLarge.length === 0 ? <div className="wd-manage-empty">{ar ? "لا توجد ملفات أكبر من 100 ميجابايت." : "You don't have any files larger than 100 MB."}</div> : (
            <table className="wd-manage-table"><thead><tr><th>{ar ? "الاسم" : "Name"}</th><th>{ar ? "الحجم" : "Size"}</th><th>{ar ? "آخر تعديل" : "Last Modified"}</th><th /></tr></thead><tbody>{filteredLarge.map((file) => <tr key={file.id}><td><div className="wd-manage-name"><FileTypeIcon kind={fileIconKind("file", file.mimeType ?? undefined, file.name)} size={24} /><span>{file.name}</span></div></td><td>{formatBytes(file.size)}</td><td>{new Date(file.updatedAt).toLocaleString()}</td><td><button type="button" className="wd-manage-link-danger" onClick={() => runConfirmed({ title: ar ? "نقل الملف إلى سلة المهملات" : "Move File to Trash", description: ar ? "سيتم نقل الملف إلى سلة المهملات ويمكن استعادته لاحقًا." : "The file will be moved to Trash and can be restored later.", confirm: ar ? "نقل إلى السلة" : "Move to Trash", danger: true, run: async () => { await trashFile(file.id); await load("large"); } })}>{ar ? "حذف" : "Delete"}</button></td></tr>)}</tbody></table>
          )}
        </div>
      ) : null}

      {error ? <div className="wd-manage-error" role="alert">{error}</div> : null}
      {confirm ? <ConfirmActionModal title={confirm.title} description={confirm.description} confirmLabel={confirm.confirm} onClose={() => setConfirm(null)} onConfirm={async () => { await confirm.run(); setConfirm(null); }} tone={confirm.danger ? "danger" : "primary"} /> : null}
      {toast ? <Toast message={toast} tone={toastTone} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}

function TrashPanel({ rows, loading, ar, onRestore, onDeleteForever, onEmpty }: { rows: any[]; loading: boolean; ar: boolean; onRestore: (id: string) => void; onDeleteForever: (id: string) => void; onEmpty: () => void }) {
  return <div className="wd-manage-panel"><div className="wd-manage-panel-head"><div /><button type="button" className="wd-manage-empty-trash" onClick={onEmpty} disabled={!rows.length}>{ar ? "إفراغ السلة" : "Empty Trash"}</button></div>{loading ? <div className="wd-manage-empty">{ar ? "جارٍ التحميل…" : "Loading…"}</div> : rows.length === 0 ? <div className="wd-manage-empty"><div className="wd-manage-empty-icon"><Icons.trash size={28} /></div><strong>{ar ? "سلة المهملات فارغة" : "Trash is empty"}</strong><span>{ar ? "ستظهر هنا الملفات والمجلدات التي تم حذفها." : "Deleted files and folders will appear here."}</span></div> : <table className="wd-manage-table"><thead><tr><th>{ar ? "الاسم" : "Name"}</th><th>{ar ? "وقت الحذف" : "Trashed Time"}</th><th /></tr></thead><tbody>{rows.map((file) => <tr key={file.id}><td><div className="wd-manage-name"><FileTypeIcon kind={fileIconKind("file", file.mimeType ?? undefined, file.name)} size={24} /><span>{file.name}</span></div></td><td>{file.deletedAt ? new Date(file.deletedAt).toLocaleString() : "—"}</td><td><div className="wd-manage-row-actions"><button type="button" className="wd-manage-link" onClick={() => onRestore(file.id)}>{ar ? "استعادة" : "Restore"}</button><button type="button" className="wd-manage-link-danger" onClick={() => onDeleteForever(file.id)}>{ar ? "حذف نهائي" : "Delete Forever"}</button></div></td></tr>)}</tbody></table>}</div>;
}

function SharedPanel({ rows, loading, ar, updating, onPermission }: { rows: SharedItem[]; loading: boolean; ar: boolean; updating: string | null; onPermission: (shareId: string, userId: string, permission: string) => Promise<void> }) {
  const [shareFilter, setShareFilter] = useState<"all" | "direct" | "links">("direct");
  const [typeFilter, setTypeFilter] = useState<"all" | "FILE" | "FOLDER">("all");
  const [open, setOpen] = useState<"share" | "type" | null>(null);
  const filtered = rows.filter((row) => {
    if (shareFilter === "direct" && !row.recipients?.length) return false;
    if (shareFilter === "links" && row.recipients?.length) return false;
    if (typeFilter !== "all" && row.resourceType !== typeFilter) return false;
    return true;
  });
  return <div className="wd-manage-panel">
    <div className="wd-manage-filters">
      <div className="relative">
        <button type="button" className="wd-manage-filter" onClick={() => setOpen((v) => v === "share" ? null : "share")}><Icons.share size={15} /> {shareFilter === "direct" ? (ar ? "المشاركة المباشرة مع مستخدمين خارجيين" : "Direct sharing to external users") : shareFilter === "links" ? (ar ? "روابط المشاركة" : "Public links") : (ar ? "كل العناصر المشتركة" : "All Shared Items")} <Icons.chevD size={12} /></button>
        {open === "share" ? <div className="wd-manage-filter-menu"><button type="button" onClick={() => { setShareFilter("all"); setOpen(null); }}>{ar ? "كل العناصر المشتركة" : "All Shared Items"}</button><button type="button" onClick={() => { setShareFilter("direct"); setOpen(null); }}>{ar ? "المشاركة المباشرة" : "Direct shares"}</button><button type="button" onClick={() => { setShareFilter("links"); setOpen(null); }}>{ar ? "روابط المشاركة" : "Public links"}</button></div> : null}
      </div>
      <div className="relative">
        <button type="button" className="wd-manage-filter" onClick={() => setOpen((v) => v === "type" ? null : "type")}><Icons.funnel size={15} /> {typeFilter === "all" ? (ar ? "كل أنواع الملفات" : "All File Types") : typeFilter === "FILE" ? (ar ? "ملفات" : "Files") : (ar ? "مجلدات" : "Folders")} <Icons.chevD size={12} /></button>
        {open === "type" ? <div className="wd-manage-filter-menu"><button type="button" onClick={() => { setTypeFilter("all"); setOpen(null); }}>{ar ? "كل أنواع الملفات" : "All File Types"}</button><button type="button" onClick={() => { setTypeFilter("FILE"); setOpen(null); }}>{ar ? "ملفات" : "Files"}</button><button type="button" onClick={() => { setTypeFilter("FOLDER"); setOpen(null); }}>{ar ? "مجلدات" : "Folders"}</button></div> : null}
      </div>
    </div>
    {loading ? <div className="wd-manage-empty">{ar ? "جارٍ التحميل…" : "Loading…"}</div> : filtered.length === 0 ? <div className="wd-manage-empty"><div className="wd-manage-empty-icon"><Icons.share size={28} /></div><strong>{ar ? "لا توجد عناصر مشتركة هنا" : "There are no Shared Items here"}</strong><span>{ar ? "ستظهر الملفات والمجلدات المشتركة هنا." : "Shared files and folders will appear here."}</span></div> : <table className="wd-manage-table"><thead><tr><th>{ar ? "الاسم" : "Name"}</th><th>{ar ? "المستلمون" : "Recipients"}</th><th>{ar ? "الصلاحية" : "Permission"}</th><th>{ar ? "الحالة" : "Status"}</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><div className="wd-manage-name"><Icons.share size={20} /><span>{row.name ?? row.resourceId}</span></div></td><td>{row.recipients?.length ? row.recipients.map((recipient) => <span key={recipient.userId} className="wd-manage-recipient">{recipient.user?.name || recipient.user?.email || recipient.userId.slice(0, 8)}</span>) : <span className="wd-manage-recipient">{ar ? "رابط عام" : "Public link"}</span>}</td><td>{row.recipients?.length ? row.recipients.map((recipient) => { const key = `${row.id}:${recipient.userId}`; return <ImkanOptionPicker key={recipient.userId} ariaLabel="Permission" value={recipient.permission ?? row.permission ?? "VIEW"} disabled={updating === key} onChange={(v) => void onPermission(row.id, recipient.userId, v)} options={["VIEW", "COMMENT", "EDIT", "ORGANIZE", "FULL_ACCESS"].map((v) => ({ value: v, label: v }))} />; }) : row.permission ?? "—"}</td><td><span className="wd-manage-status">{row.status ?? "ACTIVE"}</span></td></tr>)}</tbody></table>}
  </div>;
}
