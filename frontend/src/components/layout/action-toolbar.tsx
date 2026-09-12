"use client";
import { useState } from "react";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { openWip } from "../wip-modal";
import type { FolderRecord } from "../../lib/api/types";

export type SortDir = "asc" | "desc";
export type FilterKey = "all" | "folders" | "documents" | "sheets" | "slides" | "media" | "audio" | "archives" | "favorites";

export const FILTER_STORAGE_KEY = "zoho.filter";

export type ColumnKey = "name" | "lastModified" | "timeCreated" | "size" | "type" | "extension";

export function ActionToolbar({
  view, onView, sort, onSort, filter, onFilter, columns, onColumns, folders = [],
}: {
  view: ViewMode; onView: (v: ViewMode) => void;
  sort: SortDir; onSort: (s: SortDir) => void;
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
  folders?: FolderRecord[];
}) {
  const { label } = useLocale();
  const [openMenu, setOpenMenu] = useState<"new" | "record" | "filter" | "columns" | "sort" | "tree" | null>(null);
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");
  const cols = columns ?? {};

  function pick(v: ViewMode) {
    onView(v);
    try { persistViewMode(window.localStorage, v); } catch { /* noop */ }
  }
  function chooseFilter(k: string) { onFilter(k as FilterKey); try { localStorage.setItem(FILTER_STORAGE_KEY, k); } catch { /* noop */ } }
  function toggleColumn(key: ColumnKey) {
    if (!onColumns) return;
    onColumns({ ...cols, [key]: !(cols[key] ?? true) });
    setOpenMenu(null);
  }
  const toggle = (m: "new" | "record" | "filter" | "columns" | "sort" | "tree") => setOpenMenu((c) => (c === m ? null : m));
  const close = () => setOpenMenu(null);

  return (
    <div className="wd-toolbar flex shrink-0 flex-wrap items-center gap-1.5">
      <button id="tb-tree-btn" type="button" onClick={() => toggle("tree")} aria-expanded={openMenu === "tree"} aria-haspopup="menu"
        className={`wd-icon-btn !h-[27px] !w-[45px] ${openMenu === "tree" ? "bg-[var(--wd-active)] text-[color:var(--wd-primary-ink)]" : ""} shadow-[inset_0_0_0_1px_#CCCCCC]`} title={label("nav.fileTree")} aria-label={label("nav.fileTree")}>
        <Icons.tree size={16} />
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))} title={label("menu.folder")} aria-label={label("menu.folder")}
        className="wd-icon-btn text-[#4F4F4F]">
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
            else openWip();
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
        </button>        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
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