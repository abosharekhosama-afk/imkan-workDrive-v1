"use client";
import { useState } from "react";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";
import { openWip } from "../wip-modal";

export type SortDir = "asc" | "desc";
export type FilterKey = "all" | "folders" | "documents" | "sheets" | "slides" | "media" | "audio" | "archives" | "favorites";

export const FILTER_STORAGE_KEY = "zoho.filter";

export type ColumnKey = "name" | "lastModified" | "timeCreated" | "size" | "type" | "extension";

export function ActionToolbar({
  view, onView, sort, onSort, filter, onFilter, columns, onColumns,
}: {
  view: ViewMode; onView: (v: ViewMode) => void;
  sort: SortDir; onSort: (s: SortDir) => void;
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  columns?: Partial<Record<ColumnKey, boolean>>;
  onColumns?: (cols: Partial<Record<ColumnKey, boolean>>) => void;
}) {
  const { label } = useLocale();
  const [openMenu, setOpenMenu] = useState<"new" | "record" | "filter" | "columns" | null>(null);
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
  const toggle = (m: "new" | "record" | "filter" | "columns") => setOpenMenu((c) => (c === m ? null : m));
  const close = () => setOpenMenu(null);

  return (
    <div className="wd-toolbar flex shrink-0 flex-wrap items-center gap-1.5">
      <button type="button" className="wd-icon-btn !h-[27px] !w-[45px] shadow-[inset_0_0_0_1px_#CCCCCC]" title={label("view.toggle")} aria-label={label("view.toggle")}>
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
          ]} />

        <button id="tb-new-btn" type="button" onClick={() => toggle("new")} aria-expanded={openMenu === "new"} aria-haspopup="menu"
          className="wd-pill wd-pill-new inline-flex items-center gap-1.5">
          <Icons.plus size={16} /> {label("quick.new")}
        </button>
        <ZohoMenu open={openMenu === "new"} onClose={close} labelledBy="tb-new-btn" widthPx={405}
          onSelect={(k) => {
            if (k === "folder") window.dispatchEvent(new Event("workdrive:new-folder"));
            else if (k === "files" || k === "folderUp") window.dispatchEvent(new Event("workdrive:trigger-upload"));
            else if (k === "doc") openWip(label("menu.writer"));
            else if (k === "sheet") openWip(label("menu.sheet"));
            else if (k === "slide") openWip(label("menu.show"));
            else if (k === "cloud" || k === "link" || k === "code" || k === "record" || k === "zia") openWip(label((
              k === "cloud" ? "menu.importCloud" : k === "link" ? "menu.link" : k === "code" ? "menu.codeSnippet" : k === "record" ? "menu.record" : "menu.zia"
            )));
          }}
          items={[
            { key: "folder", labelKey: "menu.folder", hint: "Shift + F", icon: <Icons.folder size={16} /> },
            "sep",
            { key: "doc", labelKey: "menu.writer", descKey: "menu.writerDesc", icon: <Icons.doc size={16} /> },
            { key: "sheet", labelKey: "menu.sheet", descKey: "menu.sheetDesc", icon: <Icons.sheet size={16} /> },
            { key: "slide", labelKey: "menu.show", descKey: "menu.showDesc", hint: "Shift + P", icon: <Icons.slide size={16} /> },
            "sep",
            { key: "files", labelKey: "menu.uploadFiles", hint: "Ctrl + Shift + F", icon: <Icons.upload size={16} /> },
            { key: "folderUp", labelKey: "menu.uploadFolder", hint: "Ctrl + Shift + U", icon: <Icons.cloudUp size={16} /> },
            { key: "cloud", labelKey: "menu.importCloud", icon: <Icons.globe size={16} /> },
            "sep",
            { key: "link", labelKey: "menu.link", icon: <Icons.link size={16} /> },
            { key: "code", labelKey: "menu.codeSnippet", icon: <Icons.code size={16} /> },
            { key: "record", labelKey: "menu.record", icon: <Icons.video size={16} /> },
            { key: "zia", labelKey: "menu.zia", icon: <Icons.spark size={16} /> },
          ]} />

        <button type="button" onClick={() => onSort(sort === "asc" ? "desc" : "asc")}
          title={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")} aria-label={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")}
          className="wd-icon-btn">
          <Icons.sort size={17} />
        </button>

        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
          className="wd-icon-btn" title={label("nav.filter")} aria-label={label("nav.filter")}>
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
              className="wd-icon-btn" title={label("view.columns")} aria-label={label("view.columns")}>
              <Icons.columns size={17} />
            </button>
            <ZohoMenu open={openMenu === "columns"} onClose={close} labelledBy="tb-cols-btn" align="end"
              onSelect={(k) => toggleColumn(k as ColumnKey)}
              items={[
                { header: "manage.columns" },
                { key: "name", labelKey: "files.column.name", checked: true, disabled: true },
                { key: "lastModified", labelKey: "files.column.modified", checked: cols.lastModified ?? true },
                { key: "timeCreated", labelKey: "column.timeCreated", checked: cols.timeCreated ?? true },
                { key: "size", labelKey: "files.column.size", checked: cols.size ?? true },
                { key: "type", labelKey: "files.column.type", checked: cols.type ?? false },
                { key: "extension", labelKey: "files.column.extension", checked: cols.extension ?? false },
              ]} />
          </>
        )}

        <div className="flex items-center" role="group" aria-label={label("view.toggle")}>
          <button type="button" onClick={() => pick("list")} aria-pressed={view === "list"} title={label("view.list")}
            className={`wd-icon-btn ${view === "list" ? "bg-[#F0F4FF] text-[#254993]" : ""}`}><Icons.list size={15} /></button>
          <button type="button" onClick={() => pick("compact")} aria-pressed={view === "compact"} title={label("view.compact")}
            className={`wd-icon-btn ${view === "compact" ? "bg-[#F0F4FF] text-[#254993]" : ""}`}><Icons.compact size={15} /></button>
          <button type="button" onClick={() => pick("grid")} aria-pressed={view === "grid"} title={label("view.grid")}
            className={`wd-icon-btn ${view === "grid" ? "bg-[#F0F4FF] text-[#254993]" : ""}`}><Icons.grid size={15} /></button>
        </div>
      </div>
    </div>
  );
}
