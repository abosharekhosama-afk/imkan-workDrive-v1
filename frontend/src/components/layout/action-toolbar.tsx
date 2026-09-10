"use client";
import { useState } from "react";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
import { ZohoMenu } from "./zoho-menu";

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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--imkan-color-border)] bg-white px-3 py-2">
      <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={label("view.toggle")} aria-label={label("view.toggle")}>
        <Icons.list size={17} />
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))} title={label("menu.newFolder")} aria-label={label("menu.newFolder")}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
        <Icons.plus size={17} />
      </button>

      <div className="ms-auto flex items-center gap-1.5">
        <button id="tb-new-btn" type="button" onClick={() => toggle("new")} aria-expanded={openMenu === "new"} aria-haspopup="menu"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-[#1D4ED8]">+ {label("quick.new")} <Icons.chevD size={13} /></button>
        <ZohoMenu open={openMenu === "new"} onClose={close} labelledBy="tb-new-btn" width="w-60"
          onSelect={(k) => {
            if (k === "folder") window.dispatchEvent(new Event("workdrive:new-folder"));
            else if (k === "files" || k === "folderUp") window.dispatchEvent(new Event("workdrive:trigger-upload"));
            else if (k === "doc" || k === "sheet" || k === "slide") window.dispatchEvent(new CustomEvent("workdrive:new-doc", { detail: { kind: k } }));
          }}
          items={[
            { header: "menu.createHeader" },
            { key: "folder", labelKey: "menu.newFolder", hint: "⇧F" },
            { key: "doc", labelKey: "menu.writer" },
            { key: "sheet", labelKey: "menu.sheet" },
            { key: "slide", labelKey: "menu.show", hint: "⇧P" },
            "sep",
            { header: "menu.uploadHeader" },
            { key: "files", labelKey: "menu.uploadFiles", hint: "⌃⇧F" },
            { key: "folderUp", labelKey: "menu.uploadFolder", hint: "⌃⇧U" },
            { key: "cloud", labelKey: "menu.importCloud" },
            "sep",
            { key: "link", labelKey: "menu.link" },
            { key: "code", labelKey: "menu.codeSnippet" },
            { key: "record", labelKey: "menu.record" },
            { key: "zia", labelKey: "menu.zia" },
          ]} />

        <button id="tb-record-btn" type="button" onClick={() => toggle("record")} aria-expanded={openMenu === "record"} aria-haspopup="menu"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F1F5F9] px-3 py-1.5 text-[13px] font-medium text-[#1E293B] hover:bg-slate-200">
          {label("nav.record")} <Icons.chevD size={13} />
        </button>
        <ZohoMenu open={openMenu === "record"} onClose={close} labelledBy="tb-record-btn"
          onSelect={(k) => window.dispatchEvent(new CustomEvent("workdrive:record", { detail: { kind: k } }))}
          items={[
            { key: "screen", labelKey: "menu.screenRecord" },
            { key: "video", labelKey: "menu.videoRecord" },
            { key: "audio", labelKey: "menu.audioRecord" },
          ]} />

        <button type="button" onClick={() => onSort(sort === "asc" ? "desc" : "asc")}
          title={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")} aria-label={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
          <Icons.sort size={17} />
        </button>

        <button id="tb-filter-btn" type="button" onClick={() => toggle("filter")} aria-expanded={openMenu === "filter"} aria-haspopup="menu"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={label("nav.filter")} aria-label={label("nav.filter")}>
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
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={label("view.columns")} aria-label={label("view.columns")}>
              <Icons.plus size={17} />
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

        <div className="flex items-center rounded-md border border-slate-200 p-0.5" role="group" aria-label={label("view.toggle")}>
          <button type="button" onClick={() => pick("list")} aria-pressed={view === "list"} title={label("view.list")}
            className={`rounded p-1.5 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Icons.list size={15} /></button>
          <button type="button" onClick={() => pick("compact")} aria-pressed={view === "compact"} title={label("view.compact")}
            className={`rounded p-1.5 ${view === "compact" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Icons.compact size={15} /></button>
          <button type="button" onClick={() => pick("grid")} aria-pressed={view === "grid"} title={label("view.grid")}
            className={`rounded p-1.5 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Icons.grid size={15} /></button>
        </div>
      </div>
    </div>
  );
}