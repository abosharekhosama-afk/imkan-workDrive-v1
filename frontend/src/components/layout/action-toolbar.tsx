"use client";
import { useState } from "react";
import { useLocale } from "../locale-provider";
import { persistViewMode, type ViewMode } from "../view-mode-logic";
import { Icons } from "./icons";
export type SortDir = "asc" | "desc";
export function ActionToolbar({ view, onView, sort, onSort }: {
  view: ViewMode; onView: (v: ViewMode) => void; sort: SortDir; onSort: (s: SortDir) => void;
}) {
  const { label } = useLocale();
  const [filter, setFilter] = useState(false);
  function pick(v: ViewMode) {
    onView(v);
    try { persistViewMode(window.localStorage, v); } catch { /* noop */ }
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--imkan-color-border)] bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={label("view.toggle")} aria-label={label("view.toggle")}>
          <Icons.list size={17} />
        </button>
      </div>
      <div className="ms-auto flex items-center gap-1.5">
        <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:trigger-upload"))}
          className="rounded-md bg-[#1B66EA] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#1556C7]">+ {label("quick.new")}</button>
        <button type="button" onClick={() => window.dispatchEvent(new Event("workdrive:new-folder"))}
          className="hidden items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50 sm:inline-flex">
          {label("nav.record")} <Icons.chevD size={13} />
        </button>
        <button type="button" onClick={() => onSort(sort === "asc" ? "desc" : "asc")}
          title={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")} aria-label={sort === "asc" ? label("nav.sortAsc") : label("nav.sortDesc")}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
          {sort === "asc" ? <Icons.list size={17} /> : <Icons.list size={17} />}
        </button>
        <div className="relative">
          <button type="button" onClick={() => setFilter((v) => !v)} aria-expanded={filter} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title={label("nav.filter")} aria-label={label("nav.filter")}>
            <Icons.info size={17} />
          </button>
          {filter ? (
            <div className="absolute end-0 top-full z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="menu">
              {(["all", "files", "folders"] as const).map((f) => (
                <button key={f} type="button" role="menuitemradio" aria-checked={false} onClick={() => setFilter(false)}
                  className="block w-full rounded px-3 py-1.5 text-start text-[13px] hover:bg-slate-50">{label(`search.filter.${f}`)}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center rounded-md border border-slate-200 p-0.5" role="group" aria-label={label("view.toggle")}>
          <button type="button" onClick={() => pick("list")} aria-pressed={view === "list"} title={label("view.list")}
            className={`rounded p-1.5 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Icons.list size={15} /></button>
          <button type="button" onClick={() => pick("grid")} aria-pressed={view === "grid"} title={label("view.grid")}
            className={`rounded p-1.5 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}><Icons.grid size={15} /></button>
        </div>
      </div>
    </div>
  );
}
