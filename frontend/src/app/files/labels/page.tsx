"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { createWorkspaceLabel, deleteWorkspaceLabel, listWorkspaceLabels, listWorkspaceLabelResources, updateWorkspaceLabel, type WorkspaceLabel, type WorkspaceLabelResource } from "../../../lib/api/workspace-labels";
import { listFollows, type FollowRecord } from "../../../lib/api/follows";
import { apiRequest } from "../../../lib/api/client";
import { FileTypeIcon, fileIconKind } from "../../../components/file-icon";
import { WORKDRIVE_PREVIEW_EVENT, type PreviewEventDetail } from "../../../components/global-search";
import { Toast } from "../../../components/toast";

const COLORS = ["#159B68", "#38C98A", "#4388E8", "#69BD35", "#929292", "#75D3B4", "#9696F8", "#9CC9EA", "#9CDDE0", "#A875D8", "#B36B4C", "#A9D46A", "#B795F4", "#C7B8C0", "#C9A8B0", "#C45CE0", "#D86A62", "#ED7BA4", "#F04432", "#F5C94C", "#F04E3D", "#F6E66C", "#FA6B24", "#FFA22C"];
type Tab = "following" | string;

export default function LabelsPage() {
  const { locale } = useLocale(); const ar = locale === "ar"; const router = useRouter();
  const [labels, setLabels] = useState<WorkspaceLabel[]>([]); const [selected, setSelected] = useState<Tab>("following");
  const [resources, setResources] = useState<WorkspaceLabelResource[]>([]); const [follows, setFollows] = useState<FollowRecord[]>([]);
  const [manageOpen, setManageOpen] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [editing, setEditing] = useState<WorkspaceLabel | null>(null);
  const [name, setName] = useState(""); const [color, setColor] = useState(COLORS[0]); const [colorOpen, setColorOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [toast, setToast] = useState<string | null>(null); const [error, setError] = useState("");
  const [sortDesc, setSortDesc] = useState(true); const [filterText, setFilterText] = useState(""); const [filterOpen, setFilterOpen] = useState(false);
  const load = useCallback(async () => { try { const [rows, followed] = await Promise.all([listWorkspaceLabels(), listFollows()]); setLabels(rows); setFollows(followed); setError(""); } catch { setError(ar ? "تعذر تحميل التصنيفات" : "Could not load labels"); } }, [ar]);
  useEffect(() => { void load(); const initial = new URLSearchParams(window.location.search).get("label"); if (initial) setSelected(initial); }, [load]);
  useEffect(() => {
    let live = true;
    if (selected === "following") {
      void listFollows().then(async rows => {
        const mapped = await Promise.all(rows.map(async row => {
          try {
            const resource = await fetchFollowResource(row.resourceType, row.resourceId);
            return resource ? ({ id: `${row.resourceType}:${row.resourceId}`, resourceType: row.resourceType, resourceId: row.resourceId, resource } as WorkspaceLabelResource) : null;
          } catch { return null; }
        }));
        if (live) setResources(mapped.filter(Boolean) as WorkspaceLabelResource[]);
      }).catch(() => { if (live) setResources([]); });
    } else {
      void listWorkspaceLabelResources(selected).then(rows => { if (live) setResources(rows); }).catch(() => { if (live) setResources([]); });
    }
    return () => { live = false; };
  }, [selected, follows]);

  const activeLabel = labels.find(l => l.id === selected);
  const filtered = useMemo(() => resources.filter(r => !filterText || r.resource.name.toLowerCase().includes(filterText.toLowerCase())).sort((a,b) => {
    const diff = new Date(a.resource.updatedAt ?? 0).getTime() - new Date(b.resource.updatedAt ?? 0).getTime(); return sortDesc ? -diff : diff;
  }), [resources, filterText, sortDesc]);
  const openResource = (r: WorkspaceLabelResource) => {
    if (r.resourceType === "FOLDER") router.push(`/files/${r.resourceId}`);
    else { const detail: PreviewEventDetail = { id: r.resourceId, name: r.resource.name, mimeType: r.resource.mimeType ?? undefined, size: r.resource.size ?? undefined }; window.dispatchEvent(new CustomEvent<PreviewEventDetail>(WORKDRIVE_PREVIEW_EVENT, { detail })); }
  };
  const beginCreate = () => { setEditing(null); setName(""); setColor(COLORS[0]); setCreateOpen(true); };
  const beginEdit = (l: WorkspaceLabel) => { setEditing(l); setName(l.name); setColor(l.color); setCreateOpen(true); };
  const save = async () => { if (!name.trim()) { setError(ar ? "يرجى إدخال اسم تصنيف صالح" : "Please enter a valid label name"); return; } setBusy(true); setError(""); try {
    if (editing) { const updated = await updateWorkspaceLabel(editing.id, { name: name.trim(), color }); setLabels(rows => rows.map(x => x.id === updated.id ? { ...updated, resourceCount: x.resourceCount } : x)); }
    else { const created = await createWorkspaceLabel(name.trim(), color); setLabels(rows => [...rows, created]); setSelected(created.id); }
    setCreateOpen(false); setManageOpen(false); setToast(ar ? "تم حفظ التصنيف" : "Label saved"); await load();
  } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر الحفظ" : "Could not save label")); } finally { setBusy(false); } };
  const remove = async (l: WorkspaceLabel) => { if (!window.confirm(ar ? `حذف التصنيف «${l.name}»؟` : `Delete label “${l.name}”?`)) return; try { await deleteWorkspaceLabel(l.id); setLabels(rows => rows.filter(x => x.id !== l.id)); if (selected === l.id) setSelected("following"); } catch { setError(ar ? "تعذر حذف التصنيف" : "Could not delete label"); } };

  return <main className="workflow-ui flex h-full min-h-0 flex-col overflow-hidden bg-white" dir={ar ? "rtl" : "ltr"}>
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-slate-200 px-5"><span className="text-[22px] leading-none text-slate-700" aria-hidden="true">▱</span><h1 className="text-[19px] font-semibold text-slate-900">{ar ? "التصنيفات" : "Labels"}</h1></header>
    <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4">
      <div className="flex min-w-0 items-center gap-0 overflow-x-auto">
        <button onClick={() => setSelected("following")} className={`flex h-9 shrink-0 items-center gap-2 rounded-s-full border px-4 text-[12px] ${selected === "following" ? "border-blue-300 bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_#dbeafe]" : "border-slate-300 bg-white text-slate-700"}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>{ar ? "المتابعة" : "Following"}</button>
        {labels.map(l => <button key={l.id} onClick={() => setSelected(l.id)} className={`flex h-9 shrink-0 items-center gap-2 border-y border-e px-4 text-[12px] ${selected === l.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700"}`}><span className="h-3 w-3 rounded-[2px]" style={{ background: l.color }} />{l.name}</button>)}
      </div>
      <div className="flex shrink-0 items-center gap-2"><button onClick={() => setManageOpen(true)} className="h-9 rounded-full bg-blue-600 px-5 text-[12px] font-semibold text-white hover:bg-blue-700">{ar ? "إدارة التصنيفات" : "Manage Labels"}</button><button title={ar ? "ترتيب" : "Sort"} onClick={() => setSortDesc(v => !v)} className="grid h-8 w-8 place-items-center rounded hover:bg-slate-100 text-[19px]">↕</button><button title={ar ? "تصفية" : "Filter"} onClick={() => setFilterOpen(v => !v)} className={`grid h-8 w-8 place-items-center rounded hover:bg-slate-100 ${filterOpen ? "bg-blue-50 text-blue-700" : "text-slate-600"}`}>▽</button><button title={ar ? "عرض القائمة" : "List view"} className="grid h-8 w-8 place-items-center rounded hover:bg-slate-100 text-[18px]">☰</button></div>
    </div>
    {filterOpen ? <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-2"><input autoFocus value={filterText} onChange={e => setFilterText(e.target.value)} placeholder={ar ? "تصفية حسب الاسم" : "Filter by name"} className="h-8 w-64 rounded-md border border-slate-300 px-3 text-[12px] outline-none focus:border-blue-500"/><button onClick={() => { setFilterText(""); setFilterOpen(false); }} className="text-[11px] text-slate-500">{ar ? "مسح" : "Clear"}</button></div> : null}
    {error ? <div role="alert" className="mx-5 mt-3 rounded-lg bg-red-50 p-3 text-[11px] text-red-700">{error}</div> : null}
    <div className="min-h-0 flex-1 overflow-auto px-4">
      {filtered.length ? <table className="w-full border-collapse text-start"><thead className="sticky top-0 z-[1] bg-white"><tr className="h-[58px] border-b border-slate-200 text-[12px] text-slate-700"><th className="w-14 px-3 text-center font-normal">＋</th><th className="px-3 text-start font-medium">{ar ? "الاسم" : "Name"}</th><th className="w-[28%] px-3 text-start font-medium">{ar ? "آخر تعديل" : "Last Modified"} <button onClick={() => setSortDesc(v => !v)} aria-label="Sort">{sortDesc ? "↓" : "↑"}</button></th><th className="w-12" /></tr></thead><tbody>{filtered.map(r => <tr key={r.id} className="h-[58px] border-b border-slate-100 hover:bg-slate-50"><td className="px-3 text-center"><FileTypeIcon size={20} kind={fileIconKind(r.resourceType === "FOLDER" ? "folder" : "file", r.resource.mimeType ?? undefined, r.resource.name)} /></td><td className="px-3"><button onClick={() => openResource(r)} className="inline-flex max-w-full items-center gap-2 text-start text-[13px] text-slate-800 hover:underline"><span className="truncate">{r.resource.name}</span>{r.resourceType === "FOLDER" && selected === "following" ? <span title={ar ? "تتم متابعة التحديثات" : "Following updates"} className="text-[12px] text-slate-500">♧</span> : null}{activeLabel ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-600"><i className="h-2 w-2 rounded-full" style={{ background: activeLabel.color }} />{activeLabel.name}</span> : null}</button></td><td className="px-3 text-[12px] text-slate-500">{r.resource.updatedAt ? new Date(r.resource.updatedAt).toLocaleDateString(ar ? "ar" : "en-US", { month: "short", day: "numeric" }) : "—"}</td><td className="px-3 text-end text-slate-400">＋</td></tr>)}</tbody></table> : selected === "following" && follows.length === 0 ? <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center"><div className="mb-5 text-[72px] leading-none text-blue-600">♧</div><p className="text-[15px] font-medium text-slate-800">{ar ? "لا تتابع أي ملفات أو مجلدات حتى الآن." : "You aren't following any files or folders yet."}</p><p className="mt-2 text-[13px] text-slate-600">{ar ? "ابدأ متابعة ملف أو مجلد لتلقي إشعارات عند تحديثه." : "Follow files and folders to get notified when they change."}</p></div> : <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center"><div className="mb-5 text-[72px] leading-none text-blue-600">♧</div><p className="text-[15px] font-medium text-slate-800">{ar ? "لا توجد ملفات أو مجلدات مرتبطة بهذا التصنيف بعد." : "You haven't added any files or folders to this label yet."}</p><p className="mt-2 text-[13px] text-slate-600">{ar ? "أضف تصنيفات لتنظيم ملفاتك ومجلداتك بسهولة." : "Add labels to classify your files and folders easily."}</p></div>}
    </div>

    {manageOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setManageOpen(false); }}><section role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-[590px] flex-col rounded-2xl bg-white shadow-2xl"><header className="flex h-[88px] shrink-0 items-center justify-between border-b border-slate-100 px-7"><h2 className="text-[20px] font-semibold text-slate-900">{ar ? "إدارة التصنيفات" : "Manage Labels"}</h2><button onClick={() => setManageOpen(false)} aria-label="Close" className="text-[24px] text-slate-500">×</button></header><div className="min-h-[220px] flex-1 overflow-auto px-7 py-5">{labels.map(l => <div key={l.id} className="flex h-[58px] items-center gap-4 border-b border-slate-100"><span className="h-3.5 w-3.5 rounded-[2px]" style={{ background: l.color }}/><button onClick={() => { setSelected(l.id); setManageOpen(false); }} className="min-w-0 flex-1 truncate text-start text-[13px] text-slate-700 hover:underline">{l.name}</button><button onClick={() => beginEdit(l)} title={ar ? "تعديل" : "Edit"} className="text-[18px] text-slate-500 hover:text-blue-600">✎</button><button onClick={() => void remove(l)} title={ar ? "حذف" : "Delete"} className="text-[18px] text-slate-500 hover:text-red-600">♜</button></div>)}</div><footer className="flex items-center gap-2 border-t border-slate-100 px-6 py-5"><input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void save(); }} placeholder={ar ? "أدخل اسم تصنيف جديد" : "Enter a new label name"} className="h-[58px] min-w-0 flex-1 rounded-xl border border-slate-200 px-5 text-[13px] outline-none focus:border-blue-500"/><div className="relative"><button onClick={() => setColorOpen(v => !v)} className="flex h-[58px] items-center gap-2 border-y border-slate-200 px-3 text-[12px] text-slate-600"><span className="h-3 w-3 rounded-[2px]" style={{ background: color }}/><span>{ar ? "لون التصنيف" : "Label color"}</span>⌄</button>{colorOpen ? <div className="absolute bottom-[64px] end-0 z-10 w-[200px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><p className="mb-3 text-[12px] text-slate-600">{ar ? "اختر لون التصنيف" : "Choose Label Color"}</p><div className="grid grid-cols-6 gap-2">{COLORS.map(c => <button key={c} onClick={() => { setColor(c); setColorOpen(false); }} aria-label={c} className="grid h-5 w-5 place-items-center rounded-[2px] text-[12px] text-white" style={{ background: c }}>{color === c ? "✓" : ""}</button>)}</div></div> : null}</div><button disabled={busy || !name.trim()} onClick={() => void save()} className="h-[58px] rounded-xl bg-blue-600 px-5 text-[13px] font-semibold text-white disabled:opacity-50">{ar ? "إنشاء" : "Create"}</button></footer></section></div> : null}
    {createOpen ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setCreateOpen(false); }}><section role="dialog" aria-modal="true" className="w-full max-w-[590px] rounded-2xl bg-white shadow-2xl"><header className="flex h-[80px] items-center justify-between border-b border-slate-100 px-7"><h2 className="text-[20px] font-semibold">{editing ? (ar ? "تعديل التصنيف" : "Edit Label") : (ar ? "إنشاء تصنيف" : "Create Label")}</h2><button onClick={() => setCreateOpen(false)} className="text-[24px] text-slate-500">×</button></header><div className="p-8"><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={ar ? "أدخل اسم التصنيف" : "Enter label name"} className="h-10 w-full rounded-full border border-blue-500 px-4 text-[13px] outline-none"/><p className="mb-3 mt-8 text-[12px] text-slate-600">{ar ? "اختر لون التصنيف" : "Choose Label Color"}</p><div className="grid max-w-[180px] grid-cols-6 gap-2">{COLORS.map(c => <button key={c} onClick={() => setColor(c)} aria-label={c} className="grid h-5 w-5 place-items-center rounded-[2px] text-[12px] text-white" style={{ background: c }}>{color === c ? "✓" : ""}</button>)}</div></div><footer className="flex justify-end gap-2 border-t border-slate-100 px-7 py-5"><button onClick={() => setCreateOpen(false)} className="h-9 rounded-full border border-slate-300 px-4 text-[12px]">{ar ? "إلغاء" : "Cancel"}</button><button onClick={() => void save()} disabled={busy || !name.trim()} className="h-9 rounded-full bg-blue-600 px-5 text-[12px] font-semibold text-white disabled:opacity-50">{ar ? "حفظ" : "Create"}</button></footer></section></div> : null}
    {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
  </main>;
}

async function fetchFollowResource(type: string, id: string): Promise<WorkspaceLabelResource["resource"] | null> {
  try { const path = type === "FOLDER" ? `/folders/${encodeURIComponent(id)}` : `/files/${encodeURIComponent(id)}/details`; const value = await apiRequest<any>(path); return (value?.file ?? value?.folder ?? value) as WorkspaceLabelResource["resource"]; } catch { return null; }
}
