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

// Shared unified card surface used by every inline popover (Zoho + New parity).
// Rounded corners, soft shadow, white surface + hairline border, driven by the
// official CSS variables (no hardcoded colors).
const CARD_CLASS = [
  "absolute top-full z-[90] mt-1.5 min-w-52",
  "rounded-[var(--wd-menu-radius)] bg-white",
  "border border-slate-200/80 shadow-[var(--wd-menu-shadow)]",
].join(" ");

const SORT_FIELDS: Array<[ColumnKey, string]> = [
  ["name", "files.column.name"],
  ["lastModified", "files.column.modified"],
  ["timeCreated", "column.timeCreated"],
  ["size", "files.column.size"],
  ["type", "files.column.type"],
  ["extension", "files.column.extension"],
];

const COLUMN_DEFS: Array<[ColumnKey, string, boolean]> = [
  ["name", "files.column.name", true],
  ["lastModified", "files.column.modified", true],
  ["timeCreated", "column.timeCreated", false],
  ["size", "files.column.size", true],
  ["type", "files.column.type", false],
  ["extension", "files.column.extension", false],
];

export function ActionToolbar({
  view, onView, sortField, onSortField, sortDir, onSortDir,
  filter, onFilter, columns, onColumns, folders = [], currentFolderId, onOpenFolder,
}: {
  view: ViewMode; onView: (v: ViewMode) => void;
  sortField: ColumnKey; onSortField: (k: ColumnKey) => void;
  sortDir: SortDir; onSortDir: (d: SortDir) => void;
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
  folders?: FolderRecord[];
  currentFolderId?: string;
  /** Direct navigation callback (replaces the old workdrive:tree-open CustomEvent). */
  onOpenFolder?: (folderId: string) => void;
}) {
  const { label } = useLocale();
  const [openMenu, setOpenMenu] = useState<"new" | "record" | "filter" | "columns" | "sort" | "view" | "tree" | null>(null);

  // Folder-tree navigation state (collapsible tree with guarded lazy children).
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [childMap, setChildMap] = useState<Record<string, FolderRecord[]>>({});
  const treeFetchingRef = useRef<Set<string>>(new Set());

  const cols = columns ?? {};
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Guarded child fetch: skip when already fetching OR already loaded - the
  // safeguard against infinite fetch loops / piled-up 304 requests.
  const loadChildren = useCallback(async (folderId: string) => {
    if (treeFetchingRef.current.has(folderId)) return;
    if (Object.prototype.hasOwnProperty.call(childMap, folderId)) return;
    treeFetchingRef.current.add(folderId);
    try {
      const detail = await getFolder(folderId);
      setChildMap((prev) => (
        Object.prototype.hasOwnProperty.call(prev, folderId) ? prev : { ...prev, [folderId]: detail.folders ?? [] }
      ));
    } catch {
      setChildMap((prev) => (
        Object.prototype.hasOwnProperty.call(prev, folderId) ? prev : { ...prev, [folderId]: [] }
      ));
    } finally {
      treeFetchingRef.current.delete(folderId);
    }
  }, [childMap]);

  const toggleNode = useCallback((id: string) => {
    const willExpand = !expandedNodes.has(id);
    // Pure updater - no side effects inside (StrictMode-safe).
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(id);
      else next.delete(id);
      return next;
    });
    if (willExpand && !Object.prototype.hasOwnProperty.call(childMap, id)) {
      void loadChildren(id);
    }
  }, [expandedNodes, childMap, loadChildren]);

  // Close active popover on outside click / Escape - listeners confined to
  // useEffect with a correct cleanup + dependency array.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  function pick(v: ViewMode) {
    onView(v);
    setOpenMenu(null);
    try { persistViewMode(window.localStorage, v); } catch { /* noop */ }
  }
  function chooseFilter(k: string) {
    onFilter(k as FilterKey);
    try { localStorage.setItem(FILTER_STORAGE_KEY, k); } catch { /* noop */ }
    setOpenMenu(null);
  }
  function toggleColumn(key: ColumnKey) {
    if (!onColumns) return;
    onColumns({ ...cols, [key]: !(cols[key] ?? true) });
  }
  function setSort(k: ColumnKey, d: SortDir) {
    onSortField(k);
    onSortDir(d);
    setOpenMenu(null);
  }
  const toggle = (m: "new" | "record" | "filter" | "columns" | "sort" | "view" | "tree") => setOpenMenu((c) => (c === m ? null : m));
  const close = () => setOpenMenu(null);
  const isColOn = (k: ColumnKey) => cols[k] ?? true;

  return (
    <div ref={rootRef} className="wd-toolbar relative flex shrink-0 flex-wrap items-center gap-1.5">
      <button id="tb-tree-btn" type="button" onClick={() => toggle("tree")} aria-expanded={openMenu === "tree"} aria-haspopup="menu"
        className={`wd-icon-btn !h-[27px] !w-[45px] shadow-[inset_0_0_0_1px_var(--wd-menu-border)] ${openMenu === "tree" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
        title={label("nav.fileTree")} aria-label={label("nav.fileTree")}>
        <Icons.tree size={16} />
      </button>

      {openMenu === "tree" ? (
        <div className={`${CARD_CLASS} start-0 w-72 p-1.5`}>
          <div className="border-b border-slate-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("nav.fileTree")}</div>
          {folders.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-slate-400">{label("files.empty")}</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto py-1">
              {folders.map((folder) => (
                <TreeRow key={folder.id} folder={folder} expandedNodes={expandedNodes} childMap={childMap}
                  activeId={currentFolderId} onToggle={toggleNode}
                  onSelect={(id) => { if (id !== currentFolderId) onOpenFolder?.(id); setOpenMenu(null); }} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))} title={label("menu.folder")} aria-label={label("menu.folder")}
        className="wd-icon-btn text-[color:var(--wd-primary-dark)]">
        <Icons.folder size={16} />
      </button>

      <div className="ms-auto flex items-center gap-1.5">
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
          ]} />        <button id="tb-new-btn" type="button" onClick={() => toggle("new")} aria-expanded={openMenu === "new"} aria-haspopup="menu"
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

        {/* Merged view picker - single button opening a unified options card. */}
        <button id="tb-view-btn" type="button" onClick={() => toggle("view")} aria-expanded={openMenu === "view"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "view" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("view.toggle")} aria-label={label("view.toggle")}>
          {view === "grid" ? <Icons.grid size={15} /> : view === "compact" ? <Icons.compact size={15} /> : <Icons.list size={15} />}
        </button>
        {openMenu === "view" ? (
          <div className={`${CARD_CLASS} end-0 w-48 p-1`}>
            {([["list", "view.list", <Icons.list key="i" size={15} />], ["compact", "view.compact", <Icons.compact key="i" size={15} />], ["grid", "view.grid", <Icons.grid key="i" size={15} />]] as const).map(([v, key, icon]) => (
              <button key={v} type="button" onClick={() => pick(v)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${view === v ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                <span className="w-4 shrink-0 text-[color:var(--wd-primary)]">{icon}</span>
                <span className="flex-1">{label(key as never)}</span>
                {view === v ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {/* Sort By popover: SORT BY + SORT ORDER, blue highlight + checkmark. */}
        <button id="tb-sort-btn" type="button" onClick={() => toggle("sort")} aria-expanded={openMenu === "sort"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "sort" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("nav.sort")} aria-label={label("nav.sort")}>
          <Icons.sort size={17} />
        </button>
        {openMenu === "sort" ? (
          <div className={`${CARD_CLASS} end-0 w-60 p-1.5`}>
            <div className="mb-1 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("sort.by")}</div>
            <div className="flex flex-col gap-0.5">
              {SORT_FIELDS.map(([key, keyName]) => (
                <button key={key} type="button" onClick={() => setSort(key, sortDir)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${sortField === key ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="flex-1">{label(keyName as never)}</span>
                  {sortField === key ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
                </button>
              ))}
            </div>
            <div className="my-1.5 border-t border-slate-100" />
            <div className="mb-1 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("sort.order")}</div>
            <div className="flex flex-col gap-0.5">
              {([["desc", "sort.newestFirst"], ["asc", "sort.oldestFirst"]] as const).map(([d, dk]) => (
                <button key={d} type="button" onClick={() => setSort(sortField, d)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${sortDir === d ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className="flex-1">{label(dk)}</span>
                  {sortDir === d ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "filter" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`} title={label("nav.filter")} aria-label={label("nav.filter")}>
          <Icons.funnel size={17} />
        </button>
        <ZohoMenu open={openMenu === "filter"} onClose={close} labelledBy="tb-filter-btn" align="end" width="w-52"
          onSelect={chooseFilter}
          items={(["all", "folders", "documents", "sheets", "slides", "media", "audio", "archives", "favorites"] as FilterKey[]).map((f) => ({
            key: f, labelKey: `filter.${f}` as never, checked: filter === f,
          }))} />

        {onColumns ? (
          <>
            <button id="tb-cols-btn" type="button" onClick={() => toggle("columns")} aria-expanded={openMenu === "columns"} aria-haspopup="menu"
              className={`wd-icon-btn ${openMenu === "columns" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`} title={label("view.columns")} aria-label={label("view.columns")}>
              <Icons.columns size={17} />
            </button>
            {openMenu === "columns" ? (
              <div className={`${CARD_CLASS} end-0 w-60 p-1.5`}>
                <div className="mb-1 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("manage.columns")}</div>
                <div className="flex flex-col gap-0.5">
                  {COLUMN_DEFS.map(([key, keyName, locked]) => {
                    const active = isColOn(key);
                    return (
                      <button key={key} type="button" disabled={locked} onClick={() => toggleColumn(key)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${locked ? "opacity-70 cursor-not-allowed" : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${active ? "border-[color:var(--wd-primary)] bg-[color:var(--wd-primary)] text-white" : "border-slate-300 bg-white"}`}>
                          {active ? <Icons.check size={10} /> : null}
                        </span>
                        <span className={locked ? "font-medium text-slate-500" : ""}>{label(keyName as never)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}      </div>
    </div>
  );
}

function TreeRow({ folder, expandedNodes, childMap, activeId, onToggle, onSelect }: {
  folder: FolderRecord;
  expandedNodes: Set<string>;
  childMap: Record<string, FolderRecord[]>;
  activeId?: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const expanded = expandedNodes.has(folder.id);
  const children = childMap[folder.id];
  const isActive = activeId === folder.id;
  return (
    <li>
      <div className="flex items-center">
        <button type="button" onClick={() => onToggle(folder.id)} aria-expanded={expanded}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 ${expanded ? "text-slate-500" : ""}`}>
          {expanded ? <Icons.chevD size={12} /> : <Icons.chevR size={12} />}
        </button>
        <button type="button" onClick={() => onSelect(folder.id)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] ${isActive ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-700 hover:bg-[var(--wd-primary-light)]"}`}>
          <Icons.folder size={14} className="shrink-0 text-[color:var(--wd-primary)]" />
          <span className="min-w-0 flex-1 truncate text-start">{folder.name}</span>
        </button>
      </div>
      {expanded && children ? (
        children.length > 0 ? (
          <ul className="flex flex-col gap-0.5" style={{ paddingInlineStart: 18 }}>
            {children.map((child) => (
              <TreeRow key={child.id} folder={child} expandedNodes={expandedNodes} childMap={childMap} activeId={activeId} onToggle={onToggle} onSelect={onSelect} />
            ))}
          </ul>
        ) : null
      ) : null}
    </li>
  );
}