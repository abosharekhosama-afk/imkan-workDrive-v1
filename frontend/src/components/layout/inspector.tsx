"use client";
import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { formatBytes } from "../../lib/api/quota";
import { formatDateLocalized } from "../../lib/localized";
import { listAudit, formatAuditAction, type AuditRecord } from "../../lib/api/audit";
import { useShell, type InspectorTab } from "./shell-context";
import { Icons } from "./icons";
export function InspectorDock() {
  const { label } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, setMobileInspectorOpen } = useShell();
  const items: Array<{ tab: InspectorTab | "dock"; icon: keyof typeof Icons; tip: string }> = [
    { tab: "details", icon: "info", tip: label("nav.openDetails") },
  ];
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-s border-[color:var(--imkan-color-border)] bg-white py-2" role="toolbar" aria-label={label("inspector.details")}>
      {items.map((i) => (
        <button key={i.tip} type="button" title={i.tip} aria-label={i.tip} aria-pressed={i.tab === inspectorTab && inspectorOpen}
          onClick={() => { if (i.tab !== "dock") { setInspectorTab(i.tab as InspectorTab); setInspectorOpen(true); setMobileInspectorOpen(true); } }}
          className={`rounded-md p-2 ${i.tab === inspectorTab && inspectorOpen ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
          <Icons.info size={17} />
        </button>
      ))}
    </div>
  );
}
export function InspectorPanel({ onVersionHistory }: { onVersionHistory?: (fileId: string) => void }) {
  const { label, locale } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, selected, mobileInspectorOpen, setMobileInspectorOpen } = useShell();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== "activity") return;
    listAudit().then(setLogs).catch(() => setLogs([]));
  }, [inspectorOpen, inspectorTab]);
  if (!inspectorOpen) return null;
  const name = selected ? (selected.kind === "FILE" ? selected.file.name : selected.folder.name) : null;
  const kind = selected ? fileIconKind(selected.kind === "FILE" ? "file" : "folder", selected.kind === "FILE" ? selected.file.mimeType : null, name ?? "") : "file";
  const closeAll = () => { setInspectorOpen(false); setMobileInspectorOpen(false); };
  const inner = (
    <>
      <div className="flex items-center border-b border-slate-100">
        {(["details", "activity"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setInspectorTab(t)} aria-selected={inspectorTab === t} role="tab"
            className={`flex-1 px-3 py-2.5 text-[13px] font-medium ${inspectorTab === t ? "border-b-2 border-[#1B66EA] text-[#1B66EA]" : "text-slate-500 hover:text-slate-800"}`}>
            {label(t === "details" ? "inspector.details" : "inspector.activity")}
          </button>
        ))}
        <button type="button" onClick={closeAll} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label={label("nav.closePanel")}>
          <Icons.x size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selected === null || name === null ? (
          <p className="text-[13px] text-slate-500">{label("inspector.empty")}</p>
        ) : inspectorTab === "details" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
              <FileTypeIcon kind={kind} size={34} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={name}>{name}</span>
            </div>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{label("inspector.type")}</dt><dd className="truncate">{selected.kind === "FILE" ? selected.file.mimeType ?? "—" : label("files.type.folder")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{label("inspector.size")}</dt><dd>{selected.kind === "FILE" ? formatBytes(selected.file.size ?? null) : "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{label("inspector.updated")}</dt><dd className="truncate">{formatDateLocalized(selected.kind === "FILE" ? selected.file.updatedAt : selected.folder.updatedAt, locale)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{label("inspector.owner")}</dt><dd className="truncate">{(selected.kind === "FILE" ? selected.file.ownerName : selected.folder.ownerName) ?? "—"}</dd></div>
            </dl>
            {selected.kind === "FILE" ? (
              <button type="button" onClick={() => {
                if (onVersionHistory) onVersionHistory(selected.file.id);
                window.dispatchEvent(new CustomEvent("workdrive:version-history", { detail: { fileId: selected.file.id } }));
              }} className="rounded-md border border-slate-200 px-3 py-1.5 text-[13px] hover:bg-slate-50">
                {label("inspector.versionHistory")}
              </button>
            ) : null}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {logs.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded-md border border-slate-100 p-2 text-[12.5px]">
                <div className="truncate">{formatAuditAction(r, label as (k: string) => string)}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-400">{formatDateLocalized(r.createdAt, locale)}</div>
              </li>
            ))}
            {logs.length === 0 ? <li className="text-[13px] text-slate-500">{label("audit.empty")}</li> : null}
          </ol>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside className="hidden w-80 shrink-0 flex-col border-s border-[color:var(--imkan-color-border)] bg-white lg:flex" aria-label={label("inspector.details")}>
        {inner}
      </aside>
      {mobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label("inspector.details")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileInspectorOpen(false)} aria-hidden="true" />
          <div className="absolute bottom-0 end-0 top-0 flex w-80 max-w-[88vw] flex-col bg-white shadow-2xl">
            {inner}
          </div>
        </div>
      ) : null}
    </>
  );
}
