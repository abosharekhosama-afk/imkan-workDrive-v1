"use client";
import { useEffect, useState } from "react";
import { useLocale } from "../locale-provider";
import { FileTypeIcon, fileIconKind } from "../file-icon";
import { formatDateLocalized } from "../../lib/localized";
import { listAudit, formatAuditAction, type AuditRecord } from "../../lib/api/audit";
import { useShell, type InspectorTab } from "./shell-context";
import { Icons } from "./icons";

function descKey(id: string) { return `wd.desc.${id}`; }

export function InspectorDock() {
  const { label } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, setMobileInspectorOpen } = useShell();
  const items: Array<{ tab: InspectorTab; icon: keyof typeof Icons; tipKey: "nav.openDetails" | "nav.dataTemplates" | "nav.zia"; textKey: "inspector.details" | "inspector.dataTemplates" | "inspector.zia" }> = [
    { tab: "details", icon: "info", tipKey: "nav.openDetails", textKey: "inspector.details" },
    { tab: "details", icon: "layout", tipKey: "nav.dataTemplates", textKey: "inspector.dataTemplates" },
    { tab: "activity", icon: "spark", tipKey: "nav.zia", textKey: "inspector.zia" },
  ];
  return (
    <div className="wd-rail flex shrink-0 flex-col items-center gap-1 border-s border-[color:var(--wd-line)] bg-white" role="toolbar" aria-label={label("inspector.details")}>
      {items.map((i, idx) => {
        const pressed = i.tipKey === "nav.openDetails" && i.tab === inspectorTab && inspectorOpen;
        return (
          <button key={`${i.tipKey}-${idx}`} type="button" title={label(i.tipKey)} aria-label={label(i.tipKey)} aria-pressed={pressed}
            onClick={() => { setInspectorTab(i.tab); setInspectorOpen(true); setMobileInspectorOpen(true); }}
            className={`flex min-h-[65px] w-full flex-col items-center justify-center gap-1 rounded-[16px] px-[7px] py-[7px] text-[13px] transition-colors duration-150 ease-in-out ${pressed ? "bg-[#F0F4FF] text-[#254993]" : "text-[#212121] hover:bg-[#F3F5F7]"}`}>
            {(() => { const I = Icons[i.icon]; return <I size={18} />; })()}
            <span className="text-center text-[11px] leading-4">{label(i.textKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
export function InspectorPanel({ onVersionHistory }: { onVersionHistory?: (fileId: string) => void }) {
  const { label, locale } = useLocale();
  const { inspectorOpen, setInspectorOpen, inspectorTab, setInspectorTab, selected, mobileInspectorOpen, setMobileInspectorOpen } = useShell();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const resourceId = selected ? (selected.kind === "FILE" ? selected.file.id : selected.folder.id) : null;
  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== "activity") return;
    listAudit().then(setLogs).catch(() => setLogs([]));
  }, [inspectorOpen, inspectorTab]);
  useEffect(() => {
    if (!resourceId) { setDesc(""); setEditingDesc(false); return; }
    try { setDesc(localStorage.getItem(descKey(resourceId)) ?? ""); } catch { setDesc(""); }
    setEditingDesc(false);
  }, [resourceId]);
  if (!inspectorOpen) return null;
  const name = selected ? (selected.kind === "FILE" ? selected.file.name : selected.folder.name) : null;
  const kind = selected ? fileIconKind(selected.kind === "FILE" ? "file" : "folder", selected.kind === "FILE" ? selected.file.mimeType : null, name ?? "") : "file";
  const closeAll = () => { setInspectorOpen(false); setMobileInspectorOpen(false); };
  const permalink = resourceId && typeof window !== "undefined" ? `${window.location.origin}/files/${resourceId}` : "";
  const copyPermalink = async () => {
    if (!permalink) return;
    try { await navigator.clipboard.writeText(permalink); } catch { /* clipboard unavailable */ }
  };
  const saveDesc = () => {
    if (!resourceId) return;
    try { localStorage.setItem(descKey(resourceId), desc); } catch { /* noop */ }
    setEditingDesc(false);
  };
  const inner = (
    <>
      <div className="flex items-center border-b border-[#EDEDED]">
        {(["details", "activity"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setInspectorTab(t)} aria-selected={inspectorTab === t} role="tab"
            className={`flex-1 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 ease-in-out ${inspectorTab === t ? "border-b-2 border-[#2C66DD] text-[#2C66DD]" : "text-[#4F4F4F] hover:text-[#212121]"}`}>
            {label(t === "details" ? "inspector.details" : "inspector.activity")}
          </button>
        ))}
        <button type="button" onClick={closeAll} className="wd-icon-btn" aria-label={label("nav.closePanel")}>
          <Icons.x size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selected === null || name === null ? (
          <p className="text-[13px] text-[#4F4F4F]">{label("inspector.empty")}</p>
        ) : inspectorTab === "details" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-[12px] bg-[#F7F8FA] p-3">
              <FileTypeIcon kind={kind} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium" title={name}>{name}</div>
                {editingDesc ? (
                  <div className="mt-1 flex items-center gap-1">
                    <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveDesc}
                      onKeyDown={(e) => { if (e.key === "Enter") saveDesc(); if (e.key === "Escape") setEditingDesc(false); }}
                      className="wd-search min-w-0 flex-1" autoFocus aria-label={label("inspector.addDescription")} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditingDesc(true)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-[#4F4F4F] hover:text-[#212121]">
                    <Icons.pencil size={12} /> {desc || label("inspector.addDescription")}
                  </button>
                )}
              </div>
            </div>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.createdBy")}</dt><dd className="truncate">{(selected.kind === "FILE" ? selected.file.ownerName : selected.folder.ownerName) ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.sharedWith")}</dt><dd className="truncate text-[12px]">{label("inspector.sharedWithPrivate")}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#4F4F4F]">{label("inspector.permalink")}</dt>
                <dd className="min-w-0 truncate">
                  <button type="button" onClick={() => void copyPermalink()} className="inline-flex max-w-full items-center gap-1 truncate text-[#2C66DD] hover:underline" title={permalink}>
                    <Icons.link size={12} /> <span className="truncate">{permalink || "—"}</span>
                  </button>
                </dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.location")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.addLabels")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.type")}</dt><dd className="truncate">{selected.kind === "FILE" ? selected.file.mimeType ?? "—" : label("files.type.folder")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.timeCreated")}</dt><dd className="truncate">{formatDateLocalized(selected.kind === "FILE" ? selected.file.updatedAt : selected.folder.updatedAt, locale)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[#4F4F4F]">{label("inspector.modifiedBy")}</dt><dd className="truncate text-[#4F4F4F]">—</dd></div>
            </dl>
            {selected.kind === "FILE" ? (
              <button type="button" onClick={() => {
                if (onVersionHistory) onVersionHistory(selected.file.id);
                window.dispatchEvent(new CustomEvent("workdrive:version-history", { detail: { fileId: selected.file.id } }));
              }} className="inline-flex items-center justify-between rounded-[16px] border border-[#EDEDED] px-3 py-1.5 text-[13px] hover:bg-[#F3F5F7]">
                {label("inspector.versionHistory")} <Icons.chevR size={13} />
              </button>
            ) : null}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {logs.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded-[12px] border border-[#EDEDED] p-2 text-[12.5px]">
                <div className="truncate">{formatAuditAction(r, label as (k: string) => string)}</div>
                <div className="mt-0.5 text-[11.5px] text-[#4F4F4F]">{formatDateLocalized(r.createdAt, locale)}</div>
              </li>
            ))}
            {logs.length === 0 ? <li className="text-[13px] text-[#4F4F4F]">{label("audit.empty")}</li> : null}
          </ol>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside className="wd-drawer hidden shrink-0 flex-col border-s border-[#EDEDED] bg-white lg:flex" aria-label={label("inspector.details")}>
        {inner}
      </aside>
      {mobileInspectorOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label("inspector.details")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileInspectorOpen(false)} aria-hidden="true" />
          <div className="wd-drawer absolute bottom-0 end-0 top-0 flex max-w-[88vw] flex-col bg-white shadow-[0_6px_24px_rgba(0,0,0,0.1)]">
            {inner}
          </div>
        </div>
      ) : null}
    </>
  );
}
