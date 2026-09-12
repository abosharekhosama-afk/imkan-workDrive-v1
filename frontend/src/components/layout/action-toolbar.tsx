"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { openWip } from "../wip-modal";
import { getFolder } from "../../lib/api/folders";
import type { FolderRecord } from "../../lib/api/types";

export type SortDir = "asc" | "desc";
export type FilterKey = "all" | "folders" | "documents" | "sheets" | "slides" | "media" | "audio" | "archives" | "favorites";

export const FILTER_STORAGE_KEY = "zoho.filter";

export type ColumnKey = "name" | "lastModified" | "timeCreated" | "size" | "type" | "extension";

const SORT_FIELDS: Array<[ColumnKey, string]> = [
  ["name", "files.column.name"],
  ["lastModified", "files.column.modified"],
  ["timeCreated", "column.timeCreated"],
  ["size", "files.column.size"],
  ["type", "files.column.type"],
  ["extension", "files.column.extension"],
];

export function ActionToolbar({
  view, onView, onSort, filter, onFilter, columns, onColumns, folders = [],
  currentFolderId, onOpenFolder,
}: {
  view: ViewMode; onView: (v: ViewMode) => void;
  sort: SortDir; onSort: (s: SortDir) => void;
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
  folders?: FolderRecord[];
  currentFolderId?: string;
  /** Direct navigation callback — replaces the removed `workdrive:tree-open` CustomEvent. */
  onOpenFolder?: (folderId: string) => void;
}) {
  const { label } = useLocale();
  const [openMenu, setOpenMenu] = useState<"new" | "record" | "filter" | "columns" | "sort" | "tree" | null>(null);
  const [sortField, setSortField] = useState<ColumnKey>("name");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [childMap, setChildMap] = useState<Record<string, FolderRecord[]>>({});
  const cols = columns ?? {};
  const rootRef = useRef<HTMLDivElement | null>(null);
  // In-flight guard: folders whose child fetch is currently running.
  // Prevents StrictMode double-invocation and rapid re-toggle from
  // issuing duplicate `getFolder` calls (the source of piled-up 304s).
  const treeFetchingRef = useRef<Set<string>>(new Set());

  const loadChildren = useCallback(async (folderId: string) => {
    if (treeFetchingRef.current.has(folderId)) return;
    treeFetchingRef.current.add(folderId);
    try {
      const detail = await getFolder(folderId);
      setChildMap((prev) => (
        Object.prototype.hasOwnProperty.call(prev, folderId)
          ? prev
          : { ...prev, [folderId]: detail.folders ?? [] }
      ));
    } catch {
      setChildMap((prev) => (
        Object.prototype.hasOwnProperty.call(prev, folderId)
          ? prev
          : { ...prev, [folderId]: [] }
      ));
    } finally {
      treeFetchingRef.current.delete(folderId);
    }
  }, []);

  const toggleNode = useCallback((id: string) => {
    // Pure updater — no side effects inside, so StrictMode double-calls are safe.
    const willExpand = !expandedNodes.has(id);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(id);
      else next.delete(id);
      return next;
    });
    // Side effect outside the updater, guarded: fetch only when expanding
    // AND children were never fetched before.
    if (willExpand && !Object.prototype.hasOwnProperty.call(childMap, id)) {
      void loadChildren(id);
    }
  }, [expandedNodes, childMap, loadChildren]);

  function pick(v: ViewMode) {
    onView(v);
    try { persistViewMode(window.localStorage, v); } catch { /* noop */ }
  }

  function chooseFilter(k: string) {
    onFilter(k as FilterKey);
    try { localStorage.setItem(FILTER_STORAGE_KEY, k); } catch { /* noop */ }
  }

  function toggleColumn(key: ColumnKey) {
    if (!onColumns) return;
    onColumns({ ...cols, [key]: !(cols[key] ?? true) });
    setOpenMenu(null);
  }

  const toggle = (m: "new" | "record" | "filter" | "columns" | "sort" | "tree") => setOpenMenu((c) => (c === m ? null : m));
  const close = () => setOpenMenu(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  return (
    <div ref={rootRef} className="wd-toolbar relative flex shrink-0 flex-wrap items-center gap-1.5">
      <button id="tb-tree-btn" type="button" onClick={() => toggle("tree")} aria-expanded={openMenu === "tree"} aria-haspopup="menu"
        className={`wd-icon-btn !h-[27px] !w-[45px] ${openMenu === "tree" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""} shadow-[inset_0_0_0_1px_#CCCCCC]`} title={label("nav.fileTree")} aria-label={label("nav.fileTree")}>
        <Icons.tree size={16} />
      </button>
      {openMenu === "tree" ? (
        <div className="absolute top-full start-0 z-[90] mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("nav.fileTree")}</div>
          <div className="max-h-72 overflow-y-auto p-1">
            {folders.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-slate-400">{label("files.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {folders.map((folder) => (
                  <TreeRow key={folder.id} folder={folder} expandedNodes={expandedNodes} childMap={childMap}
                    onToggle={toggleNode}
                    onSelect={(id) => { if (id !== currentFolderId) onOpenFolder?.(id); close(); }} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))} title={label("menu.folder")} aria-label={label("menu.folder")}
        className="wd-icon-btn text-[#4F4F4F]">
        <Icons.folder size={16} />
      </button>

      <div className="relative ms-auto flex items-center gap-1.5">
        <button id="tb-record-btn" type="button" onClick={() => toggle("record")} aria-expanded={openMenu === "record"} aria-haspopup="menu"
          className="wd-pill wd-pill-record inline-flex items-center gap-1.5">
          {label("nav.record")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={openMenu === "record"} onClose={close} labelledBy="tb-record-btn"
          onSelect={(k) => window.dispatchEvent(new CustomEvent("workdrive:record", { detail: { kind: k } }))}
          items={[
            { key: "screen", labelKey: "menu.screenRecord", icon: <Icons.camera size={16} /> },
            { key: "video", labelKey: "menu.videoRecord", icon: <Icons.video size={16} /> },
            { key: "audio", labelKey: "menu.audioRecord", icon: <Icons.mic size={16} /> },
          ]} />

        <button id="tb-new-btn" type="button" onClick={() => toggle("new")} aria-expanded={openMenu === "new"} aria-haspopup="menu"
          className="wd-pill wd-pill-new inline-flex items-center gap-1.5">
          <Icons.plus size={16} /> {label("quick.new")}
        </button>
        <ZohoMenu open={openMenu === "new"} onClose={close} labelledBy="tb-new-btn" widthPx={405}
          onSelect={(k) => {
            if (k === "folder") window.dispatchEvent(new Event("workdrive:new-folder"));
            else if (k === "upload") window.dispatchEvent(new Event("workdrive:upload"));
            else openWip(label(k === "doc" ? "menu.newDoc" : k === "sheet" ? "menu.newSheet" : "menu.newSlide"));
          }}
          items={[
            { key: "folder", labelKey: "menu.newFolder", icon: <Icons.folder size={16} />, descKey: "menu.newFolderDesc" },
            { key: "upload", labelKey: "menu.uploadFiles", icon: <Icons.upload size={16} />, descKey: "menu.uploadFilesDesc" },
            { key: "cloud", labelKey: "menu.importCloud", icon: <Icons.globe size={16} /> },
            "sep",
            { key: "doc", labelKey: "menu.newDoc", icon: <Icons.doc size={16} />, descKey: "menu.newDocDesc" },
            { key: "sheet", labelKey: "menu.newSheet", icon: <Icons.sheet size={16} /> },
            { key: "slide", labelKey: "menu.newSlide", icon: <Icons.slide size={16} /> },
            "sep",
            { key: "link", labelKey: "menu.link", icon: <Icons.link size={16} /> },
            { key: "code", labelKey: "menu.codeSnippet", icon: <Icons.code size={16} /> },
            { key: "record", labelKey: "menu.record", icon: <Icons.video size={16} /> },
            { key: "zia", labelKey: "menu.zia", icon: <Icons.spark size={16} /> },
          ]} />

        <button id="tb-sort-btn" type="button" onClick={() => toggle("sort")} aria-expanded={openMenu === "sort"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "sort" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("nav.sort")} aria-label={label("nav.sort")}>
          <Icons.sort size={17} />
        </button>
        {openMenu === "sort" ? (
          <div className="absolute top-full end-0 z-[90] mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-3 pb-2 pt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("sort.by")}</div>
              <div className="flex flex-col gap-0.5">
                {SORT_FIELDS.map(([key, keyName]) => {
                  const active = sortField === key;
                  return (
                    <button key={key} type="button" onClick={() => setSortField(key)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${active ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {active ? <Icons.check size={12} className="text-[color:var(--wd-primary)]" /> : null}
                      </span>
                      {label(keyName as never)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-3 pb-2 pt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("sort.order")}</div>
              <div className="flex flex-col gap-0.5">
                {([["newest", "sort.newestFirst", "desc"], ["oldest", "sort.oldestFirst", "asc"]] as const).map(([okey, oname, dir]) => {
                  const oactive = sortOrder === okey;
                  return (
                    <button key={okey} type="button" onClick={() => { setSortOrder(okey); onSort(dir); }}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${oactive ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {oactive ? <Icons.check size={12} className="text-[color:var(--wd-primary)]" /> : null}
                      </span>
                      {label(oname as never)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "filter" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("nav.filter")} aria-label={label("nav.filter")}>
          <Icons.funnel size={17} />
        </button>
        <ZohoMenu open={openMenu === "filter"} onClose={close} labelledBy="tb-filter-btn" align="end" width="w-52"
          onSelect={chooseFilter}
          items={(["all", "folders", "documents", "sheets", "slides", "media", "audio", "archives", "favorites"] as FilterKey[]).map((f) => ({
            key: f, labelKey: `filter.${f}` as never, checked: filter === f,
          }))} />

        {onColumns && (
          <>
            <button id="tb-cols-btn" type="button" onClick={() => toggle("columns")} aria-expanded={openMenu === "columns"} aria-haspopup="menu"
              className={`wd-icon-btn ${openMenu === "columns" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
              title={label("view.columns")} aria-label={label("view.columns")}>
              <Icons.columns size={17} />
            </button>
            {openMenu === "columns" ? (
              <div className="absolute top-full end-0 z-[90] mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("manage.columns")}</div>
                <div className="flex flex-col gap-0.5 px-1 pb-2">
                  {SORT_FIELDS.map(([key, keyName]) => {
                    const locked = key === "name";
                    const active = locked ? true : (cols[key] ?? true);
                    return (
                      <button key={key} type="button" disabled={locked} onClick={() => toggleColumn(key)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${locked ? "opacity-60" : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${active ? "border-[color:var(--wd-primary)] bg-[color:var(--wd-primary)] text-white" : "border-slate-300"}`}>
                          {active ? <Icons.check size={10} /> : null}
                        </span>
                        <span className={locked ? "font-medium text-slate-700" : ""}>{label(keyName as never)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}

        <div className="flex items-center" role="group" aria-label={label("view.toggle")}>
          <button type="button" onClick={() => pick("list")} aria-pressed={view === "list"} title={label("view.list")}
            className={`wd-icon-btn ${view === "list" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}><Icons.list size={15} /></button>
          <button type="button" onClick={() => pick("compact")} aria-pressed={view === "compact"} title={label("view.compact")}
            className={`wd-icon-btn ${view === "compact" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}><Icons.compact size={15} /></button>
          <button type="button" onClick={() => pick("grid")} aria-pressed={view === "grid"} title={label("view.grid")}
            className={`wd-icon-btn ${view === "grid" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}><Icons.grid size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function TreeRow({ folder, expandedNodes, childMap, onToggle, onSelect }: {
  folder: FolderRecord;
  expandedNodes: Set<string>;
  childMap: Record<string, FolderRecord[]>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const expanded = expandedNodes.has(folder.id);
  const children = childMap[folder.id];
  return (
    <li>
      <div className="flex items-center">
        <button type="button" onClick={() => onToggle(folder.id)} aria-expanded={expanded}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50">
          {expanded ? <Icons.chevD size={12} /> : <Icons.chevR size={12} />}
        </button>
        <button type="button" onClick={() => onSelect(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 hover:bg-[var(--wd-primary-light)]">
          <Icons.folder size={14} className="shrink-0 text-[color:var(--wd-primary)]" />
          <span className="min-w-0 flex-1 truncate text-start">{folder.name}</span>
        </button>
      </div>
      {expanded ? (
        children ? (
          children.length > 0 ? (
            <ul className="flex flex-col gap-0.5" style={{ paddingInlineStart: 18 }}>
              {children.map((child) => (
                <TreeRow key={child.id} folder={child} expandedNodes={expandedNodes} childMap={childMap} onToggle={onToggle} onSelect={onSelect} />
              ))}
            </ul>
          ) : null
        ) : (
          <p className="py-1 text-[12px] text-slate-400" style={{ paddingInlineStart: 34 }}>...</p>
        )
      ) : null}
    </li>
  );
}