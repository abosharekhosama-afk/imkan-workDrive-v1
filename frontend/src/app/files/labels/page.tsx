"use client";

import { Icons } from "@/components/layout/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { useConfirmAction } from "../../../components/confirm-action-modal";
import {
  createWorkspaceLabel,
  deleteWorkspaceLabel,
  listWorkspaceLabels,
  listWorkspaceLabelResources,
  updateWorkspaceLabel,
  type WorkspaceLabel,
  type WorkspaceLabelResource,
} from "../../../lib/api/workspace-labels";
import { listFollows, type FollowRecord } from "../../../lib/api/follows";
import { apiRequest } from "../../../lib/api/client";
import { FileTypeIcon, fileIconKind } from "../../../components/file-icon";
import { WORKDRIVE_PREVIEW_EVENT, type PreviewEventDetail } from "../../../components/global-search";
import { Toast } from "../../../components/toast";
import { FileActionsMenu } from "../../../components/file-actions-menu";
import { SelectionBar } from "../../../components/layout/selection-bar";
import { ShareModal } from "../../../components/share-modal";

const COLORS = [
  "#159B68", "#38C98A", "#4388E8", "#69BD35", "#929292", "#75D3B4", "#9696F8", "#9CC9EA",
  "#9CDDE0", "#A875D8", "#B36B4C", "#A9D46A", "#B795F4", "#C7B8C0", "#C9A8B0", "#C45CE0",
  "#D86A62", "#ED7BA4", "#F04432", "#F5C94C", "#F04E3D", "#F6E66C", "#FA6B24", "#FFA22C",
];
type Tab = "following" | string;

async function fetchFollowResource(type: string, id: string): Promise<WorkspaceLabelResource["resource"] | null> {
  try {
    const path = type === "FOLDER"
      ? `/folders/${encodeURIComponent(id)}`
      : `/files/${encodeURIComponent(id)}/details`;
    const value = await apiRequest<any>(path);
    return (value?.file ?? value?.folder ?? value) as WorkspaceLabelResource["resource"];
  } catch {
    return null;
  }
}

function LabelsEmptyIllustration({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true" className="mb-5 text-slate-400">
        <path d="M38 28c0-6 4-10 10-10h18l8 8h18c6 0 10 4 10 10v44c0 6-4 10-10 10H48c-6 0-10-4-10-10V28z" stroke="currentColor" strokeWidth="2.2" fill="none" />
        <path d="M52 52h36M52 64h28M52 76h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <g transform="translate(62 18)">
          <path d="M8 0c4 0 8 3 8 8v22l-8-5-8 5V8c0-5 4-8 8-8z" fill="#E8F1FF" stroke="#2c66dd" strokeWidth="1.8" />
          <circle cx="5.5" cy="10" r="2.2" fill="#2c66dd" />
          <circle cx="10.5" cy="10" r="2.2" fill="#F5C94C" />
        </g>
      </svg>
      <p className="text-[15px] font-medium text-slate-800">{title}</p>
      <p className="mt-2 max-w-md text-[13px] text-slate-600">{subtitle}</p>
    </div>
  );
}

export default function LabelsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { requestConfirm, confirmModal } = useConfirmAction();
  const [labels, setLabels] = useState<WorkspaceLabel[]>([]);
  const [selected, setSelected] = useState<Tab>("following");
  const [resources, setResources] = useState<WorkspaceLabelResource[]>([]);
  const [follows, setFollows] = useState<FollowRecord[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceLabel | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [colorOpen, setColorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareTarget, setShareTarget] = useState<{ type: "FILE" | "FOLDER"; id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, followed] = await Promise.all([listWorkspaceLabels(), listFollows()]);
      setLabels(rows);
      setFollows(followed);
      setError("");
    } catch {
      setError(ar ? "تعذر تحميل التصنيفات" : "Could not load labels");
    }
  }, [ar]);

  useEffect(() => {
    void load();
    const initial = new URLSearchParams(window.location.search).get("label");
    if (initial) setSelected(initial);
  }, [load]);

  useEffect(() => {
    let live = true;
    setSelectedIds(new Set());
    if (selected === "following") {
      void listFollows()
        .then(async (rows) => {
          const mapped = await Promise.all(
            rows.map(async (row) => {
              try {
                const resource = await fetchFollowResource(row.resourceType, row.resourceId);
                return resource
                  ? ({
                      id: `${row.resourceType}:${row.resourceId}`,
                      labelId: "following",
                      resourceType: row.resourceType as "FILE" | "FOLDER",
                      resourceId: row.resourceId,
                      resource: {
                        id: resource.id ?? row.resourceId,
                        name: resource.name ?? row.resourceId,
                        mimeType: resource.mimeType ?? null,
                        size: resource.size ?? null,
                        folderId: resource.folderId ?? null,
                        parentId: resource.parentId ?? null,
                        updatedAt: resource.updatedAt ?? row.updatedAt,
                      },
                    } as WorkspaceLabelResource)
                  : null;
              } catch {
                return null;
              }
            }),
          );
          if (live) setResources(mapped.filter(Boolean) as WorkspaceLabelResource[]);
        })
        .catch(() => {
          if (live) setResources([]);
        });
    } else {
      void listWorkspaceLabelResources(selected)
        .then((rows) => {
          if (live) setResources(rows);
        })
        .catch(() => {
          if (live) setResources([]);
        });
    }
    return () => {
      live = false;
    };
  }, [selected, follows]);

  const activeLabel = labels.find((l) => l.id === selected);
  const filtered = useMemo(
    () =>
      resources
        .filter((r) => !filterText || r.resource.name.toLowerCase().includes(filterText.toLowerCase()))
        .sort((a, b) => {
          const diff = new Date(a.resource.updatedAt ?? 0).getTime() - new Date(b.resource.updatedAt ?? 0).getTime();
          return sortDesc ? -diff : diff;
        }),
    [resources, filterText, sortDesc],
  );

  const openResource = (r: WorkspaceLabelResource) => {
    if (r.resourceType === "FOLDER") router.push(`/files/${r.resourceId}`);
    else {
      const detail: PreviewEventDetail = {
        id: r.resourceId,
        name: r.resource.name,
        mimeType: r.resource.mimeType ?? undefined,
        size: r.resource.size ?? undefined,
      };
      window.dispatchEvent(new CustomEvent<PreviewEventDetail>(WORKDRIVE_PREVIEW_EVENT, { detail }));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  };

  const selectedRows = filtered.filter((r) => selectedIds.has(r.id));
  const folderCount = selectedRows.filter((r) => r.resourceType === "FOLDER").length;
  const fileCount = selectedRows.filter((r) => r.resourceType === "FILE").length;
  const single = selectedRows.length === 1 ? selectedRows[0] : null;

  const beginCreate = () => {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setCreateOpen(true);
  };
  const beginEdit = (l: WorkspaceLabel) => {
    setEditing(l);
    setName(l.name);
    setColor(l.color);
    setCreateOpen(true);
  };
  const save = async () => {
    if (!name.trim()) {
      setError(ar ? "يرجى إدخال اسم تصنيف صالح" : "Please enter a valid label name");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        const updated = await updateWorkspaceLabel(editing.id, { name: name.trim(), color });
        setLabels((rows) => rows.map((x) => (x.id === updated.id ? { ...updated, resourceCount: x.resourceCount } : x)));
      } else {
        const created = await createWorkspaceLabel(name.trim(), color);
        setLabels((rows) => [...rows, created]);
        setSelected(created.id);
      }
      setCreateOpen(false);
      setManageOpen(false);
      setToast(ar ? "تم حفظ التصنيف" : "Label saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : ar ? "تعذر الحفظ" : "Could not save label");
    } finally {
      setBusy(false);
    }
  };
  const remove = (l: WorkspaceLabel) => {
    requestConfirm({
      title: ar ? "حذف التصنيف" : "Delete label",
      description: ar ? `حذف التصنيف «${l.name}»؟` : `Delete label "${l.name}"?`,
      confirmLabel: ar ? "حذف" : "Delete",
      run: async () => {
        try {
          await deleteWorkspaceLabel(l.id);
          setLabels((rows) => rows.filter((x) => x.id !== l.id));
          if (selected === l.id) setSelected("following");
        } catch {
          setError(ar ? "تعذر حذف التصنيف" : "Could not delete label");
        }
      },
    });
  };

  const openShareFor = (r: WorkspaceLabelResource) => {
    setShareTarget({ type: r.resourceType, id: r.resourceId, name: r.resource.name });
  };

  return (
    <main
      style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}
      className="workflow-ui labels-page flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white wd-list-page"
      dir={ar ? "rtl" : "ltr"}
    >
      {confirmModal}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-slate-200 px-5">
        <span className="text-slate-700" aria-hidden="true"><Icons.tag size={22} /></span>
        <h1 className="text-[19px] font-semibold text-slate-900">{ar ? "التصنيفات" : "Labels"}</h1>
      </header>

      <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4">
        <div className="labels-strip-scroll min-w-0 flex-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:thin]">
          <div className="inline-flex h-9 min-w-max items-stretch overflow-hidden rounded-full border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setSelected("following")}
              className={`flex h-full shrink-0 items-center gap-2 border-e border-slate-300 px-4 text-[12px] transition-colors ${
                selected === "following"
                  ? "bg-[var(--wd-primary-light,#eff6ff)] font-semibold text-[color:var(--wd-primary-ink,#1e40af)]"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icons.bell size={14} />
              {ar ? "المتابعة" : "Following"}
            </button>
            {labels.map((l, index) => {
              const isLast = index === labels.length - 1;
              return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l.id)}
                className={`flex h-full shrink-0 items-center gap-2 px-4 text-[12px] transition-colors ${
                  !isLast ? "border-e border-slate-300" : ""
                } ${
                  selected === l.id
                    ? "bg-[var(--wd-primary-light,#eff6ff)] font-semibold text-[color:var(--wd-primary-ink,#1e40af)]"
                    : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-[2px]" style={{ background: l.color }} />
                <span className="max-w-[10rem] truncate">{l.name}</span>
              </button>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setManageOpen(true)} className="h-9 rounded-full bg-[var(--wd-primary,#2c66dd)] px-5 text-[12px] font-semibold text-white hover:bg-blue-700">
            {ar ? "إدارة التصنيفات" : "Manage Labels"}
          </button>
          <button type="button" title={ar ? "ترتيب" : "Sort"} onClick={() => setSortDesc((v) => !v)} className="grid h-8 w-8 place-items-center rounded text-slate-600 hover:bg-slate-100">
            <Icons.sort size={16} />
          </button>
          <button type="button" title={ar ? "تصفية" : "Filter"} onClick={() => setFilterOpen((v) => !v)} className={`grid h-8 w-8 place-items-center rounded hover:bg-slate-100 ${filterOpen ? "bg-[var(--wd-primary-light)] text-[color:var(--wd-primary)]" : "text-slate-600"}`}>
            <Icons.funnel size={16} />
          </button>
          <button type="button" title={ar ? "طريقة العرض" : "View mode"} className={`grid h-8 w-8 place-items-center rounded hover:bg-slate-100 ${viewMode === "list" ? "bg-[var(--wd-primary-light)] text-[color:var(--wd-primary)]" : "text-slate-600"}`} onClick={() => setViewMode((v) => (v === "list" ? "grid" : "list"))} aria-label={ar ? "طريقة العرض" : "View mode"}>
            {viewMode === "list" ? <Icons.list size={16} /> : <Icons.grid size={16} />}
          </button>
        </div>
      </div>

      {filterOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-2">
          <input autoFocus value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder={ar ? "تصفية حسب الاسم" : "Filter by name"} className="h-8 w-64 rounded-md border border-slate-300 px-3 text-[12px] outline-none focus:border-[var(--wd-primary,#2c66dd)]" />
          <button type="button" onClick={() => { setFilterText(""); setFilterOpen(false); }} className="text-[11px] text-slate-500">{ar ? "مسح" : "Clear"}</button>
        </div>
      ) : null}

      {selectedIds.size > 0 ? (
        <SelectionBar
          folderCount={folderCount}
          fileCount={fileCount}
          singleSelected={Boolean(single)}
          canMutate={false}
          canShare={Boolean(single && single.resourceType === "FILE")}
          onShare={() => single && openShareFor(single)}
          onCopyLink={() => single && openShareFor(single)}
          onDownload={() => undefined}
          onAction={(key) => {
            if (key === "share" && single) openShareFor(single);
            if (key === "openNewTab" && single) openResource(single);
          }}
          onClear={() => setSelectedIds(new Set())}
          menuResourceType={single?.resourceType}
          extraHandlers={
            single
              ? {
                  onOpen: () => openResource(single),
                  onPreview: single.resourceType === "FILE" ? () => openResource(single) : undefined,
                  onShare: single.resourceType === "FILE" ? () => openShareFor(single) : undefined,
                }
              : undefined
          }
        />
      ) : null}

      {error ? <div role="alert" className="mx-5 mt-3 rounded-lg bg-red-50 p-3 text-[11px] text-red-700">{error}</div> : null}

      <div className="labels-scroll min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4">
        {filtered.length ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((r) => (
                <div key={r.id} className={`relative flex flex-col items-start gap-2 rounded-xl border bg-white p-3 text-start hover:border-[color:var(--wd-primary)] hover:shadow-sm ${selectedIds.has(r.id) ? "border-[color:var(--wd-primary)] bg-[var(--wd-primary-light,#eff6ff)]" : "border-slate-200"}`}>
                  <input type="checkbox" className="absolute start-2 top-2 h-4 w-4" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={ar ? "تحديد" : "Select"} />
                  <button type="button" onClick={() => openResource(r)} className="mt-4 flex w-full flex-col items-start gap-2 text-start">
                    <FileTypeIcon size={28} kind={fileIconKind(r.resourceType === "FOLDER" ? "folder" : "file", r.resource.mimeType ?? undefined, r.resource.name)} />
                    <span className="w-full truncate text-[13px] font-medium text-slate-800">{r.resource.name}</span>
                    <span className="text-[11px] text-slate-500">{r.resourceType === "FOLDER" ? (ar ? "مجلد" : "Folder") : ar ? "ملف" : "File"}</span>
                  </button>
                  <div className="absolute end-1 top-1">
                    <FileActionsMenu context={{ resourceType: r.resourceType, canMutate: false, canShare: r.resourceType === "FILE", canFavorite: true }} handlers={{ onOpen: () => openResource(r), onPreview: r.resourceType === "FILE" ? () => openResource(r) : undefined, onShare: r.resourceType === "FILE" ? () => openShareFor(r) : undefined }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse" style={{ fontFamily: "var(--user-font-family), Arial, system-ui, sans-serif" }}>
              <thead>
                <tr className="border-b border-[color:var(--imkan-color-border)]">
                  <th className="w-10 px-3 py-2 text-center text-[12px] font-medium text-slate-500">
                    <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length} onChange={toggleSelectAll} aria-label={ar ? "تحديد الكل" : "Select all"} />
                  </th>
                  <th className="w-10 px-3 py-2 text-center text-[12px] font-medium text-slate-500" />
                  <th className="px-3 py-2 text-start text-[12px] font-medium text-slate-500">{ar ? "الاسم" : "Name"}</th>
                  <th className="w-[22%] px-3 py-2 text-start text-[12px] font-medium text-slate-500">
                    {ar ? "آخر تعديل" : "Last Modified"}{" "}
                    <button type="button" onClick={() => setSortDesc((v) => !v)} aria-label="Sort">{sortDesc ? "↓" : "↑"}</button>
                  </th>
                  <th className="w-12 px-3 py-2 text-end text-[12px] font-medium text-slate-500" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`border-b border-[color:var(--imkan-color-border)] hover:bg-slate-50 ${selectedIds.has(r.id) ? "bg-[var(--wd-primary-light,#eff6ff)]" : ""}`} data-selected={selectedIds.has(r.id) || undefined}>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} aria-label={ar ? "تحديد" : "Select"} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <FileTypeIcon size={18} kind={fileIconKind(r.resourceType === "FOLDER" ? "folder" : "file", r.resource.mimeType ?? undefined, r.resource.name)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => openResource(r)} className="inline-flex max-w-full min-w-0 items-center gap-2 text-start text-[13px] text-slate-800 hover:underline">
                        <span className="truncate">{r.resource.name}</span>
                        {selected === "following" ? <span title={ar ? "تتم متابعة التحديثات" : "Following updates"} className="shrink-0 text-[12px] text-slate-500">♧</span> : null}
                        {activeLabel ? <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-600"><i className="h-2 w-2 rounded-full" style={{ background: activeLabel.color }} />{activeLabel.name}</span> : null}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 truncate text-[13px] text-slate-600">
                      {r.resource.updatedAt ? new Date(r.resource.updatedAt).toLocaleDateString(ar ? "ar" : "en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <FileActionsMenu context={{ resourceType: r.resourceType, canMutate: false, canShare: r.resourceType === "FILE", canFavorite: true }} handlers={{ onOpen: () => openResource(r), onPreview: r.resourceType === "FILE" ? () => openResource(r) : undefined, onShare: r.resourceType === "FILE" ? () => openShareFor(r) : undefined }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : selected === "following" && follows.length === 0 ? (
          <LabelsEmptyIllustration title={ar ? "لا تتابع أي ملفات أو مجلدات حتى الآن." : "You aren't following any files or folders yet."} subtitle={ar ? "ابدأ متابعة ملف أو مجلد لتلقي إشعارات عند تحديثه." : "Follow files and folders to get notified when they change."} />
        ) : (
          <LabelsEmptyIllustration title={ar ? "لم تُضف تصنيفات إلى أي ملفات أو مجلدات بعد." : "You haven't added labels to any files or folders yet."} subtitle={ar ? "أضف تصنيفات لتنظيم ملفاتك ومجلداتك بسهولة." : "Add labels to classify your files and folders easily."} />
        )}
      </div>

      {manageOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setManageOpen(false); }}>
          <section role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-[590px] flex-col rounded-2xl bg-white shadow-2xl">
            <header className="flex h-[88px] shrink-0 items-center justify-between border-b border-slate-100 px-7">
              <h2 className="text-[20px] font-semibold text-slate-900">{ar ? "إدارة التصنيفات" : "Manage Labels"}</h2>
              <button type="button" onClick={() => setManageOpen(false)} aria-label="Close" className="text-[24px] text-slate-500">×</button>
            </header>
            <div className="min-h-[220px] flex-1 overflow-auto px-7 py-5">
              {labels.map((l) => (
                <div key={l.id} className="flex h-[58px] items-center gap-4 border-b border-slate-100">
                  <span className="h-3.5 w-3.5 rounded-[2px]" style={{ background: l.color }} />
                  <button type="button" onClick={() => { setSelected(l.id); setManageOpen(false); }} className="min-w-0 flex-1 truncate text-start text-[13px] text-slate-700 hover:underline">{l.name}</button>
                  <button type="button" onClick={() => beginEdit(l)} title={ar ? "تعديل" : "Edit"} className="text-[18px] text-slate-500 hover:text-[color:var(--wd-primary,#2c66dd)]">✎</button>
                  <button type="button" onClick={() => void remove(l)} title={ar ? "حذف" : "Delete"} className="text-[18px] text-slate-500 hover:text-red-600">♜</button>
                </div>
              ))}
            </div>
            <footer className="flex items-center gap-2 border-t border-slate-100 px-6 py-5">
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} placeholder={ar ? "أدخل اسم تصنيف جديد" : "Enter a new label name"} className="h-[58px] min-w-0 flex-1 rounded-xl border border-slate-200 px-5 text-[13px] outline-none focus:border-[var(--wd-primary,#2c66dd)]" />
              <div className="relative">
                <button type="button" onClick={() => setColorOpen((v) => !v)} className="flex h-[58px] items-center gap-2 border-y border-slate-200 px-3 text-[12px] text-slate-600">
                  <span className="h-3 w-3 rounded-[2px]" style={{ background: color }} />
                  <span>{ar ? "لون التصنيف" : "Label color"}</span>⌄
                </button>
                {colorOpen ? (
                  <div className="absolute bottom-[64px] end-0 z-10 w-[200px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="mb-2 text-[11px] text-slate-500">{ar ? "اختر لوناً" : "Pick a color"}</p>
                    <div className="grid grid-cols-6 gap-2">
                      {COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => { setColor(c); setColorOpen(false); }} className="h-6 w-6 rounded-md border border-slate-200" style={{ background: c }} aria-label={c} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button type="button" disabled={busy} onClick={() => void save()} className="h-[58px] rounded-xl bg-[var(--wd-primary,#2c66dd)] px-6 text-[13px] font-semibold text-white disabled:opacity-60">{ar ? "إضافة" : "Add"}</button>
            </footer>
          </section>
        </div>
      ) : null}

      {createOpen && !manageOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
          <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[18px] font-semibold text-slate-900">{editing ? (ar ? "تعديل التصنيف" : "Edit label") : ar ? "تصنيف جديد" : "New label"}</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-4 h-11 w-full rounded-lg border border-slate-200 px-3 text-[13px]" placeholder={ar ? "اسم التصنيف" : "Label name"} />
            <div className="mt-3 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-md border ${color === c ? "ring-2 ring-[var(--wd-primary)]" : "border-slate-200"}`} style={{ background: c }} />
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="h-10 rounded-lg px-4 text-[13px] text-slate-600">{ar ? "إلغاء" : "Cancel"}</button>
              <button type="button" disabled={busy} onClick={() => void save()} className="h-10 rounded-lg bg-[var(--wd-primary,#2c66dd)] px-5 text-[13px] font-semibold text-white">{ar ? "حفظ" : "Save"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {shareTarget ? (
        <ShareModal resourceType={shareTarget.type} resourceId={shareTarget.id} resourceName={shareTarget.name} onClose={() => setShareTarget(null)} />
      ) : null}

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </main>
  );
}
