"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { ToolbarAnchoredPanel } from "./toolbar-anchored-panel";
import { ImkanOptionPicker } from "../imkan-option-picker";
import { openWip } from "../wip-modal";
import { WorkdriveEvents } from "../../lib/workdrive-events";
import { getFolder } from "../../lib/api/folders";
import type { FolderRecord } from "../../lib/api/types";

export type SortDir = "asc" | "desc";
export type FilterKey = "all" | "folders" | "documents" | "sheets" | "slides" | "media" | "audio" | "archives" | "favorites";
export type DataTemplateSearchCriterion = { key: string; op: "contains"|"not_contains"|"eq"|"neq"|"before"|"after"|"lt"|"gt"; value: string; join: "AND"|"OR" };
export type AdvancedFileFilter = { type: "all" | "document" | "spreadsheet" | "presentation" | "image" | "pdf"; status: "all" | "ACTIVE" | "ARCHIVED" | "PENDING_APPROVAL"; dateField: "modified" | "created"; dateFrom: string; dateTo: string; owner: string; dataTemplateId: string; dataTemplateCriteria: DataTemplateSearchCriterion[] };

export const FILTER_STORAGE_KEY = "zoho.filter";

export type ColumnKey = "name" | "lastModified" | "timeCreated" | "size" | "type" | "extension";

// Shared unified card surface used by every inline popover (Zoho + New parity).
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
  advancedFilter, onAdvancedFilter, owners = [], dataTemplates = [], context = "files", recordDisabled = false,
}: {
  view: ViewMode; onView: (v: ViewMode) => void;
  sortField: ColumnKey; onSortField: (k: ColumnKey) => void;
  sortDir: SortDir; onSortDir: (d: SortDir) => void;
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
  folders?: FolderRecord[];
  currentFolderId?: string;
  advancedFilter?: AdvancedFileFilter;
  onAdvancedFilter?: (value: AdvancedFileFilter) => void;
  owners?: Array<{ id: string; name: string | null; email: string }>;
  dataTemplates?: Array<{ id: string; name: string; active: boolean; fields?: Array<{ key: string; label: string; type: string; searchable?: boolean; options?: string[] }> }>;
  /** Direct navigation callback (replaces the old workdrive:tree-open CustomEvent). */
  onOpenFolder?: (folderId: string) => void;
  /** Toolbar target surface. Team folders use the team-folder creation flow. */
  context?: "files" | "teamFolders" | "teamFolder";
  /** Disable recording until a concrete destination folder is selected. */
  recordDisabled?: boolean;
}) {
  const { label } = useLocale();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<"new" | "record" | "filter" | "columns" | "sort" | "view" | "tree" | null>(null);
  const [canCreateWorkflow, setCanCreateWorkflow] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("workdrive_user");
      const role = raw ? (JSON.parse(raw) as { role?: string }).role : undefined;
      setCanCreateWorkflow(role === "ADMIN" || role === "SUPER_ADMIN");
    } catch { setCanCreateWorkflow(false); }
  }, []);

  // Folder-tree navigation state (collapsible tree with guarded lazy children).
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [childMap, setChildMap] = useState<Record<string, FolderRecord[]>>({});
  const treeFetchingRef = useRef<Set<string>>(new Set());

  const cols = columns ?? {};
  const af: AdvancedFileFilter = advancedFilter ?? { type: "all", status: "all", dateField: "modified", dateFrom: "", dateTo: "", owner: "", dataTemplateId: "", dataTemplateCriteria: [] };
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
      const target = e.target instanceof Element ? e.target : null;
      if (target && rootRef.current?.contains(target)) return;
      // The New / Record cards are rendered by ZohoMenu through a portal on
      // document.body, so their items are NOT descendants of the toolbar
      // container. Without this guard a mousedown inside an open card counts
      // as an "outside click", the card unmounts before the item receives its
      // click event, and the action silently never runs.
      if (target?.closest('[role="menu"], .wd-menu')) return;
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
  const dispatchRecord = (kind: "screen" | "video" | "audio") => {
    setOpenMenu(null);
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("workdrive:record", {
      detail: { kind, folderId: currentFolderId ?? null },
    })), 0);
  };
  const dispatchFolderCreate = () => {
    setOpenMenu(null);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(context === "teamFolders" ? "workdrive:new-team-folder" : "workdrive:new-folder", {
        detail: { folderId: currentFolderId ?? null },
      }));
    }, 0);
  };
  const isColOn = (k: ColumnKey) => cols[k] ?? true;

  return (
    <div ref={rootRef} className={`wd-toolbar relative z-20 flex shrink-0 flex-wrap items-center gap-1.5 overflow-visible ${context === "teamFolder" ? "team-folder-toolbar" : ""}`}>
      <button id="tb-tree-btn" type="button" onClick={() => toggle("tree")} aria-expanded={openMenu === "tree"} aria-haspopup="menu"
        className={`wd-icon-btn !h-[27px] !w-[45px] shadow-[inset_0_0_0_1px_var(--wd-menu-border)] ${openMenu === "tree" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
        title={label("nav.fileTree")} aria-label={label("nav.fileTree")}>
        <Icons.tree size={16} />
      </button>

      <ToolbarAnchoredPanel open={openMenu === "tree"} onClose={close} anchorId="tb-tree-btn" align="start" width={288} className="p-1.5">
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
      </ToolbarAnchoredPanel>

      {context !== "teamFolders" ? (
        <button type="button" onClick={() => router.push("/files")} title={label("nav.files")} aria-label={label("nav.files")}
          className="wd-icon-btn text-[color:var(--wd-primary-dark)]">
          <Icons.folder size={16} />
        </button>
      ) : null}

      <div className="ms-auto flex items-center gap-1.5">
        <button id="tb-record-btn" type="button" disabled={recordDisabled} onClick={() => toggle("record")} aria-expanded={openMenu === "record"} aria-haspopup="menu"
          className="wd-pill wd-pill-record inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45">
          {label("nav.record")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={openMenu === "record"} onClose={close} labelledBy="tb-record-btn"
          onSelect={(k) => { if (k === "screen" || k === "video" || k === "audio") dispatchRecord(k); }}
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
            if (k === "folder") dispatchFolderCreate();
            else if (k === "upload") WorkdriveEvents.upload(currentFolderId ?? null);
            else if (k === "uploadFolder") WorkdriveEvents.uploadFolder(currentFolderId ?? null);
            else if (k === "workflow") { close(); router.push("/files/workflows?create=1"); }
            else if (k === "templates") { close(); window.dispatchEvent(new CustomEvent("workdrive:template-picker", { detail: { folderId: currentFolderId ?? null } })); }
            else if (k === "externalApps") WorkdriveEvents.externalApps();
            else if (k === "record") dispatchRecord("video");
            else if (["doc", "sheet", "slide", "link", "code"].includes(k)) window.dispatchEvent(new CustomEvent("workdrive:new-file", { detail: { kind: k, folderId: currentFolderId ?? null } }));
            else if (k === "cloud") window.dispatchEvent(new CustomEvent("workdrive:cloud-import", { detail: { folderId: currentFolderId ?? null } }));
            else openWip(label("menu.zia"));
          }}
          items={[
            { key: "folder", labelKey: "menu.newFolder", icon: <Icons.folder size={16} />, descKey: "menu.newFolderDesc" },
            { key: "upload", labelKey: "menu.uploadFiles", icon: <Icons.upload size={16} />, descKey: "menu.uploadFilesDesc" },
            { key: "uploadFolder", labelKey: "menu.uploadFolder", icon: <Icons.folder size={16} /> },
            ...(canCreateWorkflow ? [{ key: "workflow", labelKey: "workflows.create", icon: <Icons.flow size={16} /> } as const] : []),
            { key: "templates", labelKey: "menu.templates", icon: <Icons.doc size={16} /> },
            { key: "externalApps", labelKey: "menu.externalApps", icon: <Icons.globe size={16} /> },
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

        {/* Merged view picker - hidden in Team Folder file tables; the reference keeps
            the compact toolbar focused on sort/filter/columns. */}
        {context !== "teamFolder" ? <><button id="tb-view-btn" type="button" onClick={() => toggle("view")} aria-expanded={openMenu === "view"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "view" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("view.toggle")} aria-label={label("view.toggle")}>
          {view === "grid" ? <Icons.grid size={15} /> : view === "compact" ? <Icons.compact size={15} /> : <Icons.list size={15} />}
        </button>
        <ToolbarAnchoredPanel open={openMenu === "view"} onClose={close} anchorId="tb-view-btn" width={192} className="p-1">
          {([["list", "view.list", <Icons.list key="i" size={15} />], ["compact", "view.compact", <Icons.compact key="i" size={15} />], ["grid", "view.grid", <Icons.grid key="i" size={15} />]] as const).map(([v, key, icon]) => (
            <button key={v} type="button" onClick={() => pick(v)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-start ${view === v ? "bg-[var(--wd-menu-hover)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="w-4 shrink-0 text-[color:var(--wd-primary)]">{icon}</span>
              <span className="flex-1">{label(key as never)}</span>
              {view === v ? <Icons.check size={13} className="text-[color:var(--wd-primary)]" /> : null}
            </button>
          ))}
        </ToolbarAnchoredPanel></> : null}
        {/* Sort By popover: SORT BY + SORT ORDER, blue highlight + checkmark. */}
        <button id="tb-sort-btn" type="button" onClick={() => toggle("sort")} aria-expanded={openMenu === "sort"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "sort" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`}
          title={label("nav.sort")} aria-label={label("nav.sort")}>
          <Icons.sort size={17} />
        </button>
        <ToolbarAnchoredPanel open={openMenu === "sort"} onClose={close} anchorId="tb-sort-btn" width={240} className="p-1.5">
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
        </ToolbarAnchoredPanel>

        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
          className={`wd-icon-btn ${openMenu === "filter" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`} title={label("nav.filter")} aria-label={label("nav.filter")}>
          <Icons.funnel size={17} />
        </button>
        {!onAdvancedFilter ? <ZohoMenu open={openMenu === "filter"} onClose={close} labelledBy="tb-filter-btn" align="end" width="w-52"
          onSelect={chooseFilter}
          items={(["all", "folders", "documents", "sheets", "slides", "media", "audio", "archives", "favorites"] as FilterKey[]).map((f) => ({
            key: f, labelKey: `filter.${f}` as never, checked: filter === f,
          }))} /> : null}
        <ToolbarAnchoredPanel open={openMenu === "filter" && Boolean(onAdvancedFilter)} onClose={close} anchorId="tb-filter-btn" width={330} className="p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label("nav.filter")}</div><div className="mb-3 flex flex-wrap gap-1">{(["all","folders","documents","sheets","slides","media","audio","archives","favorites"] as FilterKey[]).map(k=><button key={k} type="button" onClick={()=>chooseFilter(k)} className={`wd-chip-btn ${filter===k?"is-active":""}`}>{label(`filter.${k}` as never)}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-slate-500">File type<ImkanOptionPicker fullWidth value={af.type} onChange={(value) => onAdvancedFilter?.({ ...af, type: (value || "all") as AdvancedFileFilter["type"] })} ariaLabel="File type" options={[{ value: "all", label: "All types" }, { value: "document", label: "Document" }, { value: "spreadsheet", label: "Spreadsheet" }, { value: "presentation", label: "Presentation" }, { value: "image", label: "Image" }, { value: "pdf", label: "PDF" }]} /></label>
            <label className="text-[11px] text-slate-500">Status<ImkanOptionPicker fullWidth value={af.status} onChange={(value) => onAdvancedFilter?.({ ...af, status: (value || "all") as AdvancedFileFilter["status"] })} ariaLabel="Status" options={[{ value: "all", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }, { value: "PENDING_APPROVAL", label: "Pending approval" }]} /></label>
            <label className="text-[11px] text-slate-500">Date field<ImkanOptionPicker fullWidth value={af.dateField} onChange={(value) => onAdvancedFilter?.({ ...af, dateField: (value === "created" ? "created" : "modified") })} ariaLabel="Date field" options={[{ value: "modified", label: "Date modified" }, { value: "created", label: "Date created" }]} /></label>
            <label className="text-[11px] text-slate-500">Data Template<ImkanOptionPicker fullWidth allowEmpty emptyLabel="All Data Templates" value={af.dataTemplateId} onChange={(value) => onAdvancedFilter?.({ ...af, dataTemplateId: value, dataTemplateCriteria: [] })} ariaLabel="Data Template" options={(dataTemplates ?? []).filter((template) => template.active).map((template) => ({ value: template.id, label: template.name }))} /></label>
            <label className="text-[11px] text-slate-500">Owner/author<ImkanOptionPicker fullWidth allowEmpty emptyLabel="All owners" value={af.owner} onChange={(value) => onAdvancedFilter?.({ ...af, owner: value })} ariaLabel="Owner" options={(owners ?? []).map((owner) => ({ value: owner.id, label: owner.name ?? owner.email }))} /></label>
            <label className="col-span-2 text-[11px] text-slate-500">From<input type="date" value={af.dateFrom} onChange={e=>onAdvancedFilter?.({...af,dateFrom:e.target.value})} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px]" /></label>
            <label className="col-span-2 text-[11px] text-slate-500">To<input type="date" value={af.dateTo} onChange={e=>onAdvancedFilter?.({...af,dateTo:e.target.value})} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px]" /></label>
          </div>
          {af.dataTemplateId ? (() => {
            const template = (dataTemplates ?? []).find((t) => t.id === af.dataTemplateId);
            const searchable = (template?.fields ?? []).filter((f) => f.searchable !== false);
            const criteria = af.dataTemplateCriteria ?? [];
            const update = (index: number, patch: Partial<DataTemplateSearchCriterion>) => onAdvancedFilter?.({...af, dataTemplateCriteria: criteria.map((c, i) => i === index ? {...c, ...patch} : c)});
            const add = () => { if (criteria.length >= 5 || !searchable.length) return; onAdvancedFilter?.({...af, dataTemplateCriteria: [...criteria, {key: searchable[0].key, op: "eq", value: "", join: criteria.length ? "AND" : "AND"}]}); };
            const remove = (index: number) => onAdvancedFilter?.({...af, dataTemplateCriteria: criteria.filter((_, i) => i !== index)});
            const ops = (type: string) => type === "number" ? [["eq","is equal to"],["neq","is not equal to"],["lt","is below"],["gt","is above"]] : type === "date" || type === "datetime" ? [["eq","is equal to"],["neq","is not equal to"],["before","is before"],["after","is after"]] : type === "boolean" || type === "select" || type === "radio" ? [["eq","is equal to"],["neq","is not equal to"]] : [["contains","contains"],["not_contains","does not contain"]];
            return <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="mb-2 flex items-center justify-between"><div><div className="text-[10px] font-semibold text-slate-700">Custom Field criteria</div><div className="text-[9px] text-slate-400">Up to 5 conditions · AND / OR</div></div><button type="button" onClick={add} disabled={criteria.length >= 5 || !searchable.length} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 disabled:opacity-40">+ Add</button></div>{criteria.map((c, i) => { const field = searchable.find((f) => f.key === c.key) ?? searchable[0]; const options = ops(field?.type ?? "text"); return <div key={`${i}-${c.key}`} className="mb-2 grid grid-cols-[88px_1fr] gap-1.5"><ImkanOptionPicker value={c.join} onChange={(value) => update(i, { join: value === "OR" ? "OR" : "AND" })} disabled={i === 0} ariaLabel="Criteria join" options={[{ value: "AND", label: "AND" }, { value: "OR", label: "OR" }]} /><div className="grid grid-cols-[1fr_1fr] gap-1.5"><ImkanOptionPicker fullWidth value={c.key} onChange={(value) => update(i, { key: value, op: "eq", value: "" })} ariaLabel="Field" options={searchable.map((field) => ({ value: field.key, label: field.label }))} /><ImkanOptionPicker fullWidth value={c.op} onChange={(value) => update(i, { op: value as DataTemplateSearchCriterion["op"] })} ariaLabel="Operator" options={options.map(([value, label]) => ({ value, label }))} /><input value={c.value} onChange={e=>update(i,{value:e.target.value})} type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : field?.type === "datetime" ? "datetime-local" : "text"} placeholder="Value" className="col-span-2 rounded border border-slate-200 bg-white px-2 py-1 text-[10px]" /> <button type="button" onClick={()=>remove(i)} className="col-span-2 text-start text-[9px] text-red-500">Remove</button></div></div>})}</div>;
          })() : null}
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-2"><button type="button" className="wd-pill wd-pill-record text-[12px]" onClick={()=>onAdvancedFilter?.({type:"all",status:"all",dateField:"modified",dateFrom:"",dateTo:"",owner:"",dataTemplateId:"",dataTemplateCriteria:[]})}>Clear</button><button type="button" className="wd-pill wd-pill-new text-[12px]" onClick={close}>Done</button></div>
        </ToolbarAnchoredPanel>

        {onColumns && context !== "files" ? (
          <>
            <button id="tb-cols-btn" type="button" onClick={() => toggle("columns")} aria-expanded={openMenu === "columns"} aria-haspopup="menu"
              className={`wd-icon-btn ${openMenu === "columns" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""}`} title={label("view.columns")} aria-label={label("view.columns")}>
              <Icons.columns size={17} />
            </button>
            <ToolbarAnchoredPanel open={openMenu === "columns"} onClose={close} anchorId="tb-cols-btn" width={240} className="p-1.5">
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
            </ToolbarAnchoredPanel>
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