"use client";
import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { Modal } from "./modal";
import { createFolder, getFolder, listRootContents } from "../lib/api/folders";
import { friendlyErrorMessageKey } from "../lib/friendly-error";
import { Icons } from "./layout/icons";
import { ImkanOptionPicker, toImkanPickerOptions } from "./imkan-option-picker";
import { getTransferDataTemplateMandate, type DataTemplate } from "../lib/api/metadata";
import { resolveDataTemplateSchema } from "../lib/data-template-logic";

type FlatFolder = { id: string; name: string; depth: number };

const SIDE_SECTIONS: Array<{ key: string; labelKey: string; icon: React.ReactNode }> = [
  { key: "favorites", labelKey: "files.favorite", icon: <Icons.star size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "myFolders", labelKey: "files.rootFolder", icon: <Icons.folder size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "shared", labelKey: "inspector.sharedWith", icon: <Icons.users size={14} className="text-[color:var(--wd-primary)]" /> },
  { key: "team", labelKey: "admin.teamFolders", icon: <Icons.inbox size={14} className="text-[color:var(--wd-primary)]" /> },
];

export function MoveModal({ resourceName, resourceType = "FILE", resourceId, mode = "move", onClose, onMove }: {
  resourceName: string; resourceType?: "FILE" | "FOLDER"; resourceId?: string; mode?: "move" | "copy"; onClose: () => void; onMove: (destinationFolderId: string | null, templateId?: string, customFields?: Record<string, unknown>) => Promise<void>;
}) {
  const { label, locale } = useLocale();
  const [folders, setFolders] = useState<FlatFolder[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("myFolders");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mandate, setMandate] = useState<DataTemplate | null>(null);
  const [mandateFields, setMandateFields] = useState<Record<string, unknown>>({});
  const [mandateLoading, setMandateLoading] = useState(false);

  const loadTree = async () => {
    setLoading(true); setError(null);
    try {
      const root = await listRootContents();
      const entries: FlatFolder[] = [];
      const walk = async (list: Array<{ id: string; name: string }>, depth: number): Promise<void> => {
        for (const folder of list) {
          entries.push({ id: folder.id, name: folder.name, depth });
          try {
            const detail = await getFolder(folder.id);
            if (detail.folders?.length) await walk(detail.folders, depth + 1);
          } catch { /* skip unreadable subtree */ }
        }
      };
      await walk(root.folders ?? [], 0);
      setFolders(entries);
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    setMandate(null);
    setMandateFields({});
    if (destination === null) {
      setMandateLoading(false);
      return () => { active = false; };
    }
    setMandateLoading(true);
    void getTransferDataTemplateMandate(destination, resourceType === "FOLDER" ? "FOLDERS" : "FILES").then((result) => {
      if (!active) return;
      const template = result.enabled ? result.template : null;
      setMandate(template);
      const initial: Record<string, unknown> = {};
      resolveDataTemplateSchema(template).forEach((field) => { if (field.type === "boolean") initial[field.key] = false; });
      setMandateFields(initial);
    }).catch(() => { if (active) setMandate(null); }).finally(() => { if (active) setMandateLoading(false); });
    return () => { active = false; };
  }, [destination, resourceType]);

  useEffect(() => { void loadTree(); }, [label]);

  const invalidDestinationIds = new Set(resourceType === "FOLDER" && resourceId ? [resourceId] : []);
  const filtered = (search.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : folders).filter((f) => !invalidDestinationIds.has(f.id));

  async function createNewFolder() {
    const name = newName.trim(); if (!name) return;
    setCreating(true); setError(null);
    try {
      const created = await createFolder(name, destination ?? undefined);
      setDestination(created.id);
      setNewName("");
      await loadTree();
    } catch (cause) {
      setError(label(friendlyErrorMessageKey(cause)));
    } finally {
      setCreating(false);
    }
  }

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const schema = resolveDataTemplateSchema(mandate);
      if (mandate && schema.length) {
        const missing = schema.filter((field) => field.required && (mandateFields[field.key] === undefined || mandateFields[field.key] === null || String(mandateFields[field.key]).trim() === ""));
        if (missing.length) throw new Error(`Required Data Template fields: ${missing.map((field) => field.label).join(", ")}`);
      }
      await onMove(destination, mandate?.id, mandate && schema.length ? mandateFields : undefined);
      onClose();
    }
    catch (cause) { setError(label(friendlyErrorMessageKey(cause))); }
    finally { setSubmitting(false); }
  }

  const mandateSchema = resolveDataTemplateSchema(mandate);

  const title = mode === "copy" ? `${label("menu.copyTo")} ${resourceName}` : `${label("files.moveTitle")} ${resourceName}`;
return (
    <Modal title={title} onClose={onClose} className="imkan-transfer-modal">
      <div className="flex min-h-0 w-full flex-col gap-3">
        <div className="relative">
          <Icons.search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={label("files.searchPlaceholder")}
            aria-label={label("files.search")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pe-3 ps-9 text-[13px] text-slate-700 outline-none transition-colors focus:border-[color:var(--wd-primary)] focus:ring-2 focus:ring-[var(--wd-active)]"
          />
        </div>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)]">
          <section className="flex min-h-[420px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900">{mode === "copy" ? (locale === "ar" ? "اختر مكان النسخ" : "Choose copy destination") : (locale === "ar" ? "اختر مكان النقل" : "Choose destination")}</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">{locale === "ar" ? "حدد المجلد الذي سيستقبل العنصر." : "Select the folder that will receive this item."}</p>
              </div>
              {destination === null ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">{locale === "ar" ? "الجذر" : "Root"}</span> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <nav className="mb-3 flex gap-1.5 overflow-x-auto" aria-label={label("nav.details")}>
                {SIDE_SECTIONS.map((section) => (
                  <button key={section.key} type="button" onClick={() => { setActiveSection(section.key); setSearch(""); }}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-start ${activeSection === section.key ? "bg-[var(--wd-primary-light)] font-semibold text-[color:var(--wd-primary-ink)]" : "text-slate-600 hover:bg-slate-50"}`}>
                    {section.icon}<span>{label(section.labelKey as never)}</span>
                  </button>
                ))}
              </nav>
              <div className="rounded-xl border border-slate-200 p-1.5">
                <button type="button" onClick={() => setDestination(null)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-[13px] ${destination === null ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-700 hover:bg-slate-50"}`}>
                  <Icons.folder size={16} className="shrink-0 text-[color:var(--wd-primary)]" />
                  <span className="flex-1 truncate">{label("files.rootFolder")}</span>
                  {destination === null ? <Icons.check size={14} className="text-[color:var(--wd-primary)]" /> : null}
                </button>
                {loading ? <p className="px-3 py-5 text-[12px] text-slate-400">...</p> : null}
                {!loading && filtered.length === 0 ? <p className="px-3 py-5 text-[12px] text-slate-400">{label("filter.all")}</p> : null}
                {!loading && filtered.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {filtered.map((folder) => {
                      const selected = destination === folder.id;
                      return (
                        <li key={folder.id}>
                          <button type="button" onClick={() => setDestination(folder.id)}
                            className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-[13px] ${selected ? "bg-[var(--wd-primary-light)] font-medium text-[color:var(--wd-primary-ink)]" : "text-slate-700 hover:bg-slate-50"}`}
                            style={{ paddingInlineStart: 12 + folder.depth * 20 }}>
                            <Icons.folder size={15} className="shrink-0 text-[color:var(--wd-primary)]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{folder.name}</span>
                              {selected && mandate?.name ? <span className="mt-0.5 block truncate text-[10px] font-medium text-[color:var(--wd-primary)]">{mandate.name}</span> : null}
                            </span>
                            {selected ? <Icons.check size={14} className="text-[color:var(--wd-primary)]" /> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 p-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void createNewFolder(); }} placeholder={label("files.newFolder")} aria-label={label("files.newFolder")} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[color:var(--wd-primary)]" />
              <button type="button" disabled={creating || !newName.trim()} onClick={() => void createNewFolder()} className="h-9 shrink-0 rounded-lg bg-[color:var(--wd-primary)] px-3 text-[11px] font-medium text-white transition-colors hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50">{creating ? "..." : label("files.newFolder")}</button>
            </div>
          </section>

          <section className="flex min-h-[420px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="border-b border-slate-100 bg-white px-4 py-3">
              <h3 className="text-[13px] font-semibold text-slate-900">{locale === "ar" ? "خصائص Data Template" : "Data Template properties"}</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">{locale === "ar" ? "تظهر هنا فقط عند اختيار وجهة تفرض قالب بيانات." : "Shown when the selected destination mandates a Data Template."}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {mandateLoading ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-[12px] text-slate-500">{locale === "ar" ? "جارٍ تحميل الخصائص…" : "Loading properties…"}</div> : null}
              {!mandateLoading && !mandate ? <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><div><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Icons.props size={22} /></span><p className="mt-3 text-[12px] font-medium text-slate-700">{locale === "ar" ? "لا توجد خصائص مطلوبة" : "No required properties"}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{locale === "ar" ? "اختر مجلدًا عليه Data Template إلزامي لعرض الحقول هنا." : "Choose a destination with a mandated Data Template to show its fields here."}</p></div></div> : null}
              {mandate ? <div className="rounded-2xl border border-[color:var(--wd-primary)]/20 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><div className="min-w-0"><h4 className="truncate text-[14px] font-semibold text-slate-900">{mandate.name}</h4><p className="mt-1 text-[11px] text-slate-500">{locale === "ar" ? "أدخل الخصائص المطلوبة قبل المتابعة." : "Enter the required properties before continuing."}</p></div><span className="shrink-0 rounded-full bg-[var(--wd-primary-light)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--wd-primary-ink)]">{mandateSchema.length} {locale === "ar" ? "حقول" : "fields"}</span></div>
                <div className="mt-4 grid gap-4">{mandateSchema.map((field) => <label key={field.key} className="text-[11px] font-medium text-slate-700">{field.label}{field.required ? <span className="ms-1 text-red-500">*</span> : null}
                  {field.type === "boolean" ? <span className="mt-2 flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3"><input type="checkbox" checked={Boolean(mandateFields[field.key])} onChange={(e) => setMandateFields((v) => ({ ...v, [field.key]: e.target.checked }))} className="me-2" />{locale === "ar" ? "نعم" : "Yes"}</span> : field.type === "select" || field.type === "radio" ? <div className="mt-2"><ImkanOptionPicker value={String(mandateFields[field.key] ?? "")} onChange={(next) => setMandateFields((v) => ({ ...v, [field.key]: next }))} options={toImkanPickerOptions(field.options ?? [])} ariaLabel={field.label} fullWidth allowEmpty emptyLabel="—" placeholder={locale === "ar" ? "اختر" : "Select"} /></div> : <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : field.type === "email" ? "email" : "text"} value={String(mandateFields[field.key] ?? "")} onChange={(e) => setMandateFields((v) => ({ ...v, [field.key]: field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[color:var(--wd-primary)]" />}
                </label>)}</div>
              </div> : null}
            </div>
          </section>
        </div>

    {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
    <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
      <button type="button" className="rounded-full border border-slate-200 px-4 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50" onClick={onClose} disabled={submitting}>{label("share.cancel")}</button>
      <button type="button" onClick={() => void submit()} disabled={submitting || loading}
        className="rounded-full bg-[color:var(--wd-primary)] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[color:var(--wd-primary-dark)] disabled:opacity-50">
        {submitting ? "..." : label(mode === "copy" ? "menu.copyTo" : "files.moveHere")}
      </button>
    </div>
  </div>
  </Modal>
  );
}
