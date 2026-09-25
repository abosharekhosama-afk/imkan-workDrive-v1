"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { WorkflowHelp } from "@/components/workflow-help";
import { ConnectionUseHint, WorkflowConceptGuide, WorkflowNextSteps, type WorkflowRecipe } from "@/components/workflow-concept-guide";
import { listFolderTree, type FolderTreeItem } from "@/lib/api/folders";
import { useWorkflowAccess } from "@/components/workflow-access";
import { listConnections, createWorkflow, getWorkflow, updateWorkflow, getWorkflowConnectionHealth, listWorkflowParticipantOptions, listWorkflowTemplates, listWorkflowFunctions, type Workflow, type WorkflowParticipant, type WorkflowDataTemplate, type WorkflowFunction, type WorkflowConnectionHealth, type Connection } from "@/lib/api/workflows";
import { ConnectionPicker, ConnectionUpload, ResourcePicker } from "@/components/connection-picker";

type Action = { type: string; config: Record<string, unknown> };
type WorkflowField = { id: string; name: string; description: string; type: string; required: boolean; defaultValue?: string; max?: number; options?: string[] };
type StateDraft = { name: string; description: string; terminal: boolean };
type TransitionDraft = { from: number; to: number; name: string; description: string; trigger: string; condition: unknown; execution: "AUTOMATIC" | "MANUAL"; before: Action[]; during: Action[]; after: Action[]; sourceSide?: ConnectionSide; targetSide?: ConnectionSide };
type Position = { x: number; y: number };
type ConnectionSide = "top" | "right" | "bottom" | "left";
type ConnectionDraft = { from: number; sourceSide: ConnectionSide; x: number; y: number };
type WorkflowNodeTemplate = "action" | "condition" | "approval" | "end";
type GraphSnapshot = { states: StateDraft[]; transitions: TransitionDraft[]; positions: Position[] };
type Phase = "before" | "during" | "after";

const BLUE = "var(--wd-primary)";
const GREEN = "var(--wd-primary)";
const FIELD_TYPES = [
  ["single", "Single line text", "نص بسطر واحد", "▭"], ["multi", "Multi line text", "نص متعدد الأسطر", "▤"], ["number", "Number", "رقم", "123"],
  ["datetime", "Date & time", "التاريخ والوقت", "◷"], ["date", "Date", "التاريخ", "□"], ["boolean", "Yes/No", "نعم / لا", "◉"],
  ["choice", "Choice", "اختيار", "▾"], ["email", "Email", "البريد الإلكتروني", "@"],
] as const;
const TRIGGERS = [
  ["upload", "File uploaded", "تم رفع ملف"], ["create", "File/folder created", "تم إنشاء ملف/مجلد"], ["move", "File/folder moved", "تم نقل ملف/مجلد"],
  ["copy", "File/folder copied", "تم نسخ ملف/مجلد"], ["rename", "File renamed", "تمت إعادة تسمية الملف"], ["delete", "File moved to trash", "تم نقل الملف إلى السلة"],
  ["properties_updated", "Properties updated", "تم تحديث الخصائص"], ["ready", "File marked as ready", "تم تعليم الملف كجاهز"],
] as const;
const ACTIONS = [
  ["connection_file", "Get file", "جلب ملف"], ["http_request", "HTTP request", "طلب HTTP"], ["send_email", "Send email", "إرسال بريد إلكتروني"], ["create_document_from_template", "Create document from template", "إنشاء مستند من قالب"], ["notify", "System notification", "إشعار للنظام"], ["move", "Move", "نقل"], ["copy", "Copy", "نسخ"], ["generate_link", "Generate link", "إنشاء رابط"],
  ["share", "Share", "مشاركة"], ["request_approval", "Request approval", "طلب موافقة"], ["favorite", "Add to favorites", "إضافة للمفضلة"],
  ["tag", "Add tag", "إضافة وسم"], ["mark_final", "Mark as final", "تعليم كنهائي"], ["create_folder", "Create folder", "إنشاء مجلد"],
  ["data_template", "Apply data template", "تطبيق قالب بيانات"], ["custom_function", "Run custom function", "تشغيل دالة آمنة"],
] as const;
const DEFAULT_POSITIONS: Position[] = [{ x: 90, y: 100 }, { x: 450, y: 100 }, { x: 810, y: 100 }, { x: 450, y: 360 }, { x: 810, y: 360 }, { x: 1170, y: 360 }];
let workflowCanvasClipboard: { states: StateDraft[]; transitions: TransitionDraft[]; positions: Position[] } | null = null;

function txt(ar: boolean, en: string, arText: string) { return ar ? arText : en; }
function action(type: string, config: Record<string, unknown> = {}): Action { return { type, config }; }
function transitionDefaults(from: number, to: number, n: number): TransitionDraft { return { from, to, name: n === 1 ? "Complete" : `Transition ${n}`, description: "", trigger: "", condition: "any", execution: "AUTOMATIC", before: [], during: [], after: [], sourceSide: "right", targetSide: "left" }; }
function recipeDefaults(recipe: WorkflowRecipe): { states: StateDraft[]; transitions: TransitionDraft[]; positions: Position[] } {
  if (recipe === "REVIEW_FILE") return { states: [{ name: "Start", description: "Workflow entry point", terminal: false }, { name: "Review", description: "Waiting for the review step", terminal: false }, { name: "Completed", description: "Workflow finished", terminal: true }], transitions: [{ ...transitionDefaults(0, 1, 1), name: "Send for review", execution: "MANUAL", trigger: "manual" }, { ...transitionDefaults(1, 2, 2), name: "Complete review" }], positions: DEFAULT_POSITIONS.slice(0, 3) };
  if (recipe === "NOTIFY_UPLOAD") return { states: [{ name: "Start", description: "Workflow entry point", terminal: false }, { name: "Completed", description: "Notification sent", terminal: true }], transitions: [{ ...transitionDefaults(0, 1, 1), name: "Notify", during: [action("notify", { title: "File uploaded", message: "{{file.name}} was uploaded." })] }], positions: DEFAULT_POSITIONS.slice(0, 2) };
  if (recipe === "EXTERNAL_API") return { states: [{ name: "Start", description: "Workflow entry point", terminal: false }, { name: "API request", description: "Call an external service", terminal: false }, { name: "Completed", description: "Workflow finished", terminal: true }], transitions: [{ ...transitionDefaults(0, 1, 1), name: "Call API", during: [action("http_request", { connectionId: "", method: "GET", path: "/resource", responseMode: "JSON", maxResponseBytes: 20000 })] }, { ...transitionDefaults(1, 2, 2), name: "Complete" }], positions: DEFAULT_POSITIONS.slice(0, 3) };
  return { states: [{ name: "Start", description: "Workflow entry point", terminal: false }, { name: "Function", description: "Run the published safe function", terminal: false }, { name: "Completed", description: "Workflow finished", terminal: true }], transitions: [{ ...transitionDefaults(0, 1, 1), name: "Run function", during: [action("custom_function", { functionId: "" })] }, { ...transitionDefaults(1, 2, 2), name: "Complete" }], positions: DEFAULT_POSITIONS.slice(0, 3) };
}
function normalizePhaseActions(raw: unknown) {
  if (Array.isArray(raw)) return { before: [], during: raw as Action[], after: [] };
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clean = (v: unknown) => Array.isArray(v) ? v.map((x) => ({ type: String((x as Record<string, unknown>)?.type ?? "notify"), config: ((x as Record<string, unknown>)?.config && typeof (x as Record<string, unknown>).config === "object" ? (x as Record<string, unknown>).config : {}) as Record<string, unknown> })) : [];
  return { before: clean(obj.before), during: clean(obj.during), after: clean(obj.after) };
}

function FieldEditor({ draft, ar, onChange, onCancel, onSave }: { draft: WorkflowField; ar: boolean; onChange: (next: WorkflowField) => void; onCancel: () => void; onSave: () => void }) {
  const ft = FIELD_TYPES.find((x) => x[0] === draft.type);
  const set = (key: keyof WorkflowField, value: unknown) => onChange({ ...draft, [key]: value });
  return <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
    <div className="w-[min(620px,95vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-[fadeIn_.18s_ease-out]" dir={ar ? "rtl" : "ltr"}>
      <div className="border-b border-slate-100 px-6 py-5"><div className="text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--wd-primary)]">{txt(ar,"Workflow field","حقل سير العمل")}</div><h2 className="mt-1 text-[18px] font-semibold text-slate-900">{txt(ar,"Configure custom field","إعداد الحقل المخصص")}</h2><p className="mt-1 text-[11px] text-slate-500">{txt(ar,`Field type: ${ft?.[1] ?? draft.type}`,`نوع الحقل: ${ft?.[2] ?? draft.type}`)}</p></div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-slate-700 sm:col-span-2">{txt(ar,"Field name","اسم الحقل")}<input autoFocus value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder={txt(ar,"Enter field name","أدخل اسم الحقل")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] outline-none transition focus:border-[var(--wd-primary)] focus:ring-2 focus:ring-[var(--wd-primary)]/10" /></label>
        <label className="block text-[11px] font-medium text-slate-700 sm:col-span-2">{txt(ar,"Description","الوصف")}<textarea value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder={txt(ar,"Add field description","أضف وصفاً للحقل")} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] outline-none transition focus:border-[var(--wd-primary)]" /></label>
        {["single", "multi"].includes(draft.type) && <label className="block text-[11px] font-medium text-slate-700">{txt(ar,"Maximum characters","الحد الأقصى للأحرف")}<input type="number" min={1} value={draft.max ?? ""} onChange={(e) => set("max", e.target.value ? Number(e.target.value) : undefined)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px]" /></label>}
        {draft.type === "choice" && <label className="block text-[11px] font-medium text-slate-700 sm:col-span-2">{txt(ar,"Choices","الخيارات")}<input value={(draft.options ?? []).join(", ")} onChange={(e) => set("options", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder={txt(ar,"Approved, Rejected, Needs changes","موافق، مرفوض، يحتاج تعديلات")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px]" /></label>}
        <label className="block text-[11px] font-medium text-slate-700">{txt(ar,"Default value","القيمة الافتراضية")}<input value={draft.defaultValue ?? ""} onChange={(e) => set("defaultValue", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px]" /></label>
        <label className="flex items-center gap-2 self-end pb-2 text-[11px] font-medium text-slate-700"><input type="checkbox" checked={draft.required} onChange={(e) => set("required", e.target.checked)} className="h-4 w-4 accent-[var(--wd-primary)]" />{txt(ar,"Make this field mandatory","اجعل هذا الحقل إلزامياً")}</label>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button type="button" onClick={onCancel} className="wd-pill wd-pill-record">{txt(ar,"Cancel","إلغاء")}</button><button type="button" disabled={!draft.name.trim()} onClick={onSave} className="wd-pill wd-pill-new disabled:opacity-40">{txt(ar,"Create field","إنشاء الحقل")}</button></div>
    </div>
  </div>;
}

function FolderTreePicker({ open, value, ar, onClose, onSelect }: { open: boolean; value?: string; ar: boolean; onClose: () => void; onSelect: (folder: FolderTreeItem) => void }) {
  const [items, setItems] = useState<FolderTreeItem[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setLoading(true); setError("");
    void listFolderTree().then((next) => {
      setItems(next);
      setExpanded(new Set(next.filter(x => x.parentId === null).map(x => x.id)));
    }).catch(() => setError(ar ? "تعذر تحميل شجرة المجلدات." : "Unable to load the folder tree.")).finally(() => setLoading(false));
  }, [open, ar]);
  if (!open) return null;
  const q = query.trim().toLocaleLowerCase();
  const byParent = new Map<string | null, FolderTreeItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item); byParent.set(item.parentId, list);
  }
  const matches = (item: FolderTreeItem) => !q || item.name.toLocaleLowerCase().includes(q);
  const hasMatchingDescendant = (id: string): boolean => (byParent.get(id) ?? []).some(child => matches(child) || hasMatchingDescendant(child.id));
  const visibleRoots = (byParent.get(null) ?? []).filter(item => matches(item) || hasMatchingDescendant(item.id));
  const render = (item: FolderTreeItem, depth: number): React.ReactNode => {
    const children = (byParent.get(item.id) ?? []).filter(child => matches(child) || hasMatchingDescendant(child.id));
    const isOpen = q ? true : expanded.has(item.id);
    const selected = value === item.id;
    return <div key={item.id}>
      <div className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 transition ${selected ? "bg-[var(--wd-primary-light)]" : "hover:bg-slate-50"}`} style={{ paddingInlineStart: `${10 + depth * 20}px` }}>
        <button type="button" disabled={!children.length} onClick={() => setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="flex h-6 w-6 shrink-0 items-center justify-center text-[11px] text-slate-400 disabled:opacity-20" aria-label={ar ? "توسيع" : "Expand"}>{children.length ? (isOpen ? "⌄" : "›") : "•"}</button>
        <button type="button" onClick={() => onSelect(item)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
          <span className="text-[15px] text-[var(--wd-primary)]">▰</span><span className={`min-w-0 flex-1 truncate text-[10.5px] ${selected ? "font-semibold text-[var(--wd-primary)]" : "text-slate-700"}`}>{item.name}</span>
          <span className="shrink-0 text-[8.5px] text-slate-400">{item.fileCount ?? 0}</span>
        </button>
      </div>
      {isOpen ? children.map(child => render(child, depth + 1)) : null}
    </div>;
  };
  return <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={onClose}>
    <section className="workflow-picker-modal" dir={ar ? "rtl" : "ltr"} onMouseDown={e => e.stopPropagation()}>
      <header className="workflow-picker-header"><div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[var(--wd-primary)]">{ar ? "اختيار مجلد" : "Folder picker"}</div><h2>{ar ? "اختر مجلد الوجهة" : "Choose destination folder"}</h2><p>{ar ? "اختر مجلداً من مساحة الملفات بدلاً من إدخال المعرف يدوياً." : "Choose a folder from your accessible file space instead of entering an ID."}</p></div><button type="button" onClick={onClose} className="wd-icon-btn">×</button></header>
      <div className="p-4"><label className="workflow-picker-search"><span>⌕</span><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={ar ? "البحث عن مجلد" : "Search folders"} /></label></div>
      <div className="workflow-picker-body">
        {loading ? <div className="p-10 text-center text-[10.5px] text-slate-400">{ar ? "جاري تحميل المجلدات…" : "Loading folders…"}</div> : error ? <div className="p-10 text-center text-[10.5px] text-red-600">{error}</div> : visibleRoots.length ? visibleRoots.map(item => render(item, 0)) : <div className="p-10 text-center text-[10.5px] text-slate-400">{ar ? "لا توجد مجلدات متاحة." : "No accessible folders found."}</div>}
      </div>
      <footer className="workflow-picker-footer"><span>{ar ? "عدد الملفات يظهر بجانب كل مجلد." : "File count is shown beside each folder."}</span><button type="button" onClick={onClose} className="wd-pill wd-pill-record">{ar ? "إلغاء" : "Cancel"}</button></footer>
    </section>
  </div>;
}

function UserPicker({ selected, users, ar, onChange }: { selected: string[]; users: WorkflowParticipant[]; ar: boolean; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const filtered = users.filter(u => `${u.name ?? ""} ${u.email}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const label = selected.length === 0 ? (ar ? "اختر الأعضاء" : "Select members") : selected.length === 1 ? (users.find(u => u.id === selected[0])?.name || users.find(u => u.id === selected[0])?.email || (ar ? "عضو واحد" : "1 member")) : `${selected.length} ${ar ? "أعضاء محددون" : "members selected"}`;
  return <div className="relative">
    <button type="button" onClick={() => setOpen(v => !v)} className="workflow-picker-control" aria-expanded={open}><span className="truncate">{label}</span><span className="text-slate-400">⌄</span></button>
    {open ? <div className="workflow-user-menu">
      <label className="workflow-picker-search"><span>⌕</span><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={ar ? "البحث عن عضو" : "Search members"} /></label>
      <div className="max-h-52 overflow-y-auto p-1">{filtered.length ? filtered.map(u => <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} className="accent-[var(--wd-primary)]"/><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-medium text-slate-700">{u.name || u.email}</span><span className="block truncate text-[8.5px] text-slate-400">{u.email}</span></span></label>) : <div className="p-5 text-center text-[9.5px] text-slate-400">{ar ? "لا يوجد أعضاء مطابقون." : "No matching members."}</div>}</div>
      <div className="flex items-center justify-between border-t border-slate-100 px-2 py-2"><span className="text-[8.5px] text-slate-400">{selected.length} {ar ? "محدد" : "selected"}</span><button type="button" onClick={() => setOpen(false)} className="wd-pill wd-pill-new text-[9px]">{ar ? "تم" : "Done"}</button></div>
    </div> : null}
  </div>;
}

function ActionEditor({ actions, onChange, resourceType, ar, workflowFields }: { actions: Action[]; onChange: (next: Action[]) => void; resourceType: string; ar: boolean; workflowFields: WorkflowField[] }) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  useEffect(() => { void listConnections({ status: "ACTIVE" }).then(setConnections).catch(() => undefined); }, []);
  const [participantOptions, setParticipantOptions] = useState<{ users: WorkflowParticipant[]; groups: Array<{ id:string; name:string; memberCount?:number }>; roles:string[] }>({ users:[], groups:[], roles:[] });
  const [templates, setTemplates] = useState<WorkflowDataTemplate[]>([]);
  const [functions, setFunctions] = useState<WorkflowFunction[]>([]);

  useEffect(() => {
    let alive = true;
    void Promise.all([listWorkflowParticipantOptions(), listWorkflowTemplates(), listWorkflowFunctions()]).then(([po, t, f]) => {
      if (!alive) return;
      setParticipantOptions(po);
      setTemplates(t);
      setFunctions(f.custom);
    }).catch(() => {
      if (alive) {
        setParticipantOptions({users:[],groups:[],roles:[]});
        setTemplates([]);
        setFunctions([]);
      }
    });
    return () => { alive = false; };
  }, []);

  const update = (i: number, key: string, value: unknown) =>
    onChange(actions.map((a, idx) => idx === i ? { ...a, config: { ...a.config, [key]: value } } : a));

  const add = (type: string) => {
    if (actions.length < 5) {
      const config = type === "request_approval"
        ? { approvalPolicy: "ANY", title: ar ? "طلب موافقة" : "Approval required" }
        : {};
      onChange([...actions, action(type, config)]);
      setMenuOpen(false);
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || from === null || to < 0 || to >= actions.length) return;
    const next = [...actions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const allowed = ACTIONS.filter(([v]) => resourceType === "FILE" || !["favorite", "tag", "mark_final", "share", "generate_link"].includes(v));
  const actionLabel = (type: string) => {
    const item = ACTIONS.find(x => x[0] === type);
    return txt(ar, item?.[1] ?? type, item?.[2] ?? type);
  };
  const actionIcon = (type: string) => {
    const icons: Record<string, string> = {
      http_request: "↗", send_email: "✉", create_document_from_template: "▤", notify: "◔", move: "↗", copy: "▣", generate_link: "↗", share: "↗",
      request_approval: "✓", favorite: "☆", tag: "#", mark_final: "✓", create_folder: "＋",
      data_template: "Aa", custom_function: "ƒ",
    };
    return icons[type] ?? "•";
  };
  const field = (label: string, value: unknown, onValue: (v: string) => void, placeholder?: string) =>
    <label className="workflow-action-field">
      <span>{label}</span>
      <input value={String(value ?? "")} onChange={e => onValue(e.target.value)} placeholder={placeholder} />
    </label>;

  return <div className="space-y-2.5">
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"What is an action?","ما هو الإجراء؟")}</div>
      <p className="mt-1 text-[9.5px] leading-5 text-slate-600">{txt(ar,"An action is the actual operation performed when this transition runs. Use a built-in action for common WorkDrive operations, HTTP request when you need an external API, or Custom Function for reusable multi-step logic.","الإجراء هو العملية الفعلية التي ينفذها هذا الانتقال. استخدم إجراءً جاهزاً لعمليات WorkDrive المعتادة، وHTTP Request عند الحاجة إلى API خارجي، وCustom Function للمنطق المخصص متعدد الخطوات.")}</p>
    </div>
    {actions.map((a, i) => {
      const linkedFunction = a.type === "custom_function" ? functions.find(f => f.id === String(a.config.functionId ?? "")) : null;
      return <div
        key={`${a.type}-${i}`}
        draggable
        onDragStart={() => setDragged(i)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => { if (dragged !== null) move(dragged, i); setDragged(null); }}
        className="workflow-action-card group"
        data-action-type={a.type}
      >
        <div className="workflow-action-card-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="workflow-action-drag" aria-hidden="true">⋮⋮</span>
            <span className="workflow-action-icon" aria-hidden="true">{actionIcon(a.type)}</span>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-slate-900">{actionLabel(a.type)}</div>
              <div className="text-[9px] text-slate-400">{ar ? `إجراء ${i + 1} من 5` : `Action ${i + 1} of 5`}</div>
            </div>
          </div>
          <button type="button" onClick={() => onChange(actions.filter((_, idx) => idx !== i))} className="workflow-action-remove" aria-label={txt(ar,"Remove action","حذف الإجراء")}>×</button>
        </div>

        <div className="workflow-action-card-body">
          {a.type === "create_document_from_template" && <>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Office template","قالب Office")}</span><select value={String(a.config.templateId ?? "")} onChange={e=>update(i,"templateId",e.target.value)}><option value="">{txt(ar,"Select template","اختر قالباً")}</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} · v{t.activeVersion?.version ?? t.version ?? 1}</option>)}</select></label>
            {field(txt(ar,"Output file name","اسم ملف الإخراج"),a.config.name,v=>update(i,"name",v),"{{file.name}} - generated")}
            <label className="workflow-action-check"><input type="checkbox" checked={a.config.generatePdf === true} onChange={e=>update(i,"generatePdf",e.target.checked)} />{txt(ar,"Generate PDF copy","إنشاء نسخة PDF")}</label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Output workflow field (optional)","حقل إخراج سير العمل (اختياري)")}</span><select value={String(a.config.outputFieldId ?? "")} onChange={e=>update(i,"outputFieldId",e.target.value)}><option value="">{txt(ar,"No output field","بدون حقل إخراج")}</option>{workflowFields.map(f=><option key={f.id} value={f.id}>{f.name || f.id}</option>)}</select></label>
          </>}
          {a.type === "send_email" && <>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Recipients","المستلمون")}</span><input value={Array.isArray(a.config.to) ? a.config.to.join(", ") : String(a.config.to ?? "")} onChange={e=>update(i,"to",e.target.value.split(/[;,\s]+/).map(v=>v.trim()).filter(Boolean))} placeholder="user@example.com, finance@example.com" /></label>
            {field(txt(ar,"Subject","الموضوع"), a.config.subject, v => update(i,"subject",v), txt(ar,"Document generated: {{file.name}}","تم إنشاء المستند: {{file.name}}"))}
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Message","الرسالة")}</span><textarea value={String(a.config.body ?? "")} onChange={e=>update(i,"body",e.target.value)} rows={4} placeholder={txt(ar,"The generated document is attached.","المستند المنشأ مرفق مع الرسالة.")} /></label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Attachment workflow field (optional)","حقل مرفق المستند (اختياري)")}</span><select value={String(a.config.attachmentFieldId ?? "")} onChange={e=>update(i,"attachmentFieldId",e.target.value)}><option value="">{txt(ar,"No attachment","بدون مرفق")}</option>{workflowFields.map(f=><option key={f.id} value={f.id}>{f.name || f.id}</option>)}</select></label>
          </>}

          {a.type === "connection_file" && <>
            <ConnectionPicker connections={connections} value={String(a.config.connectionId ?? "")} onChange={(id) => { const next = connections.find((item) => item.id === id); update(i, "connectionId", id); update(i, "provider", next?.provider ?? ""); }} />
            <ResourcePicker connectionId={String(a.config.connectionId ?? "")} provider={String(a.config.provider ?? connections.find((item) => item.id === a.config.connectionId)?.provider ?? "")} value={String(a.config.resourceId ?? "")} label={String(a.config.resourceName ?? "")} onChange={(resource) => { update(i, "resourceId", resource.id); update(i, "resourceName", resource.name); }} />
            <ConnectionUpload connectionId={String(a.config.connectionId ?? "")} provider={String(a.config.provider ?? connections.find((item) => item.id === a.config.connectionId)?.provider ?? "")} parentId={String(a.config.destinationId ?? "")} parentName={String(a.config.destinationName ?? "")} />
          </>}
          {a.type === "http_request" && <>
            <ConnectionPicker connections={connections} value={String(a.config.connectionId ?? "")} onChange={(id) => update(i, "connectionId", id)} />
            {field(txt(ar,"Path / URL path","المسار"), a.config.path, v => update(i,"path",v), "/v1/resource or ?id={{file.id}}")}
            <label className="workflow-action-field"><span>{txt(ar,"Method","الطريقة")}</span><select value={String(a.config.method ?? "GET")} onChange={e=>update(i,"method",e.target.value)}>{["GET","POST","PUT","PATCH","DELETE","HEAD"].map(m=><option key={m}>{m}</option>)}</select></label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Body (optional)","الجسم (اختياري)")}</span><textarea value={String(a.config.body ?? "")} onChange={e=>update(i,"body",e.target.value)} rows={4} placeholder='{"fileId":"{{file.id}}"}' /></label>
            <label className="workflow-action-field"><span>{txt(ar,"Response mode","طريقة الاستجابة")}</span><select value={String(a.config.responseMode ?? "TEXT")} onChange={e=>update(i,"responseMode",e.target.value)}>{["TEXT","JSON","HEADERS","NONE"].map(m=><option key={m}>{m}</option>)}</select></label>
            <label className="workflow-action-field"><span>{txt(ar,"Max response bytes","الحد الأقصى للاستجابة")}</span><input type="number" min={256} max={20000} value={Number(a.config.maxResponseBytes ?? 20000)} onChange={e=>update(i,"maxResponseBytes",Number(e.target.value)||20000)} /></label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Output workflow field (optional)","حقل إخراج سير العمل (اختياري)")}</span><select value={String(a.config.outputFieldId ?? "")} onChange={e=>update(i,"outputFieldId",e.target.value)}><option value="">{txt(ar,"Do not store response","لا تحفظ الاستجابة")}</option>{workflowFields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <div className="sm:col-span-2"><ConnectionUseHint ar={ar} /></div><div className="sm:col-span-2 rounded-xl bg-amber-50 p-3 text-[9px] leading-5 text-amber-700">{txt(ar,"Requests use the selected connection credentials. Targets are restricted to the connection origin and private/local network targets are blocked.","تستخدم الطلبات بيانات اعتماد الاتصال المحدد، ويتم تقييد الهدف إلى نفس أصل الاتصال وحظر الشبكات المحلية والخاصة.")}</div>
          </>}
          {a.type === "notify" && <>
            {field(txt(ar,"Notification title","عنوان الإشعار"), a.config.title, v => update(i,"title",v))}
            <label className="workflow-action-field"><span>{txt(ar,"Recipients (optional)","المستلمون (اختياري)")}</span><UserPicker selected={Array.isArray(a.config.userIds) ? a.config.userIds.map(String) : []} users={participantOptions.users} ar={ar} onChange={ids => update(i,"userIds",ids)} /></label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Message","الرسالة")}</span><textarea value={String(a.config.message ?? "")} onChange={e=>update(i,"message",e.target.value)} rows={2} placeholder={txt(ar,"You can use {{file.name}} and {{user.name}}","يمكنك استخدام {{file.name}} و {{user.name}}")} /></label>
          </>}

          {(a.type === "move" || a.type === "copy") && <FolderActionField action={a} index={i} ar={ar} update={update} />}
          {a.type === "tag" && <div className="sm:col-span-2">{field(txt(ar,"Tag name","اسم الوسم"),a.config.name,v=>update(i,"name",v))}</div>}
          {a.type === "create_folder" && <><div>{field(txt(ar,"Folder name","اسم المجلد"),a.config.name,v=>update(i,"name",v))}</div><FolderActionField action={a} index={i} ar={ar} update={update} parentOnly /></>}
          {a.type === "share" && <>
            <label className="workflow-action-field"><span>{txt(ar,"Recipients","المستلمون")}</span><UserPicker selected={Array.isArray(a.config.userIds) ? a.config.userIds.map(String) : []} users={participantOptions.users} ar={ar} onChange={ids => update(i,"userIds",ids)} /></label>
            <label className="workflow-action-field"><span>{txt(ar,"Permission","الصلاحية")}</span><select value={String(a.config.permission ?? "VIEW")} onChange={e=>update(i,"permission",e.target.value)}><option>VIEW</option><option>COMMENT</option><option>EDIT</option></select></label>
          </>}
          {a.type === "generate_link" && <label className="workflow-action-check"><input type="checkbox" checked={a.config.canDownload !== false} onChange={e=>update(i,"canDownload",e.target.checked)} />{txt(ar,"Allow download","السماح بالتنزيل")}</label>}

          {a.type === "request_approval" && <div className="contents">
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Approvers / members","الموافقون / الأعضاء")}</span>
              <select multiple value={Array.isArray(a.config.userIds) ? a.config.userIds.map(String) : (a.config.userId ? [String(a.config.userId)] : [])} onChange={e => { const ids = Array.from(e.target.selectedOptions).map(o => o.value); update(i,"userIds",ids); update(i,"userId",ids[0] ?? ""); }}>
                {participantOptions.users.map(u => <option key={u.id} value={u.id}>{u.name || u.email} · {u.email}</option>)}
              </select>
            </label>
            {participantOptions.groups.length > 0 && <label className="workflow-action-field"><span>{txt(ar,"Groups","المجموعات")}</span>
              <select multiple value={Array.isArray(a.config.groupIds) ? a.config.groupIds.map(String) : []} onChange={e => update(i,"groupIds",Array.from(e.target.selectedOptions).map(o => o.value))}>{participantOptions.groups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.memberCount ?? 0}</option>)}</select>
            </label>}
            {participantOptions.roles.length > 0 && <label className="workflow-action-field"><span>{txt(ar,"Roles","الأدوار")}</span>
              <select multiple value={Array.isArray(a.config.roles) ? a.config.roles.map(String) : []} onChange={e => update(i,"roles",Array.from(e.target.selectedOptions).map(o => o.value))}>{participantOptions.roles.map(role => <option key={role} value={role}>{role}</option>)}</select>
            </label>}
            {field(txt(ar,"Approval title","عنوان طلب الموافقة"), a.config.title, v => update(i,"title",v))}
            <label className="workflow-action-field"><span>{txt(ar,"Approval title template","قالب عنوان الطلب")}</span>
              <select value={String(a.config.templateId ?? "")} onChange={e => update(i,"templateId",e.target.value)}><option value="">{txt(ar,"No template","بدون قالب")}</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </label>
            <label className="workflow-action-field"><span>{txt(ar,"Approval policy","سياسة الموافقة")}</span>
              <select value={String(a.config.approvalPolicy ?? "ANY")} onChange={e => update(i,"approvalPolicy",e.target.value)}><option value="ANY">{txt(ar,"Any approver","أي موافق")}</option><option value="ALL">{txt(ar,"All approvers","جميع الموافقين")}</option></select>
            </label>
            {field(txt(ar,"Due minutes","دقائق الاستحقاق"), a.config.dueInMinutes, v => update(i,"dueInMinutes",v ? Number(v) : undefined))}
            {field(txt(ar,"Reminder minutes","دقائق التذكير"), a.config.reminderInMinutes, v => update(i,"reminderInMinutes",v ? Number(v) : undefined))}
            <label className="workflow-action-check sm:col-span-2"><input type="checkbox" checked={a.config.allowStarterParticipants === true} onChange={e => update(i,"allowStarterParticipants",e.target.checked)} />{txt(ar,"Allow starter to choose participants","السماح لمن يبدأ سير العمل باختيار المشاركين")}</label>
          </div>}

          {a.type === "data_template" && <>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Data template","قالب البيانات")}</span><select value={String(a.config.templateId ?? "")} onChange={e=>update(i,"templateId",e.target.value)}><option value="">{txt(ar,"Select template","اختر قالباً")}</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} · v{t.activeVersion?.version ?? 1}</option>)}</select></label>
            <label className="workflow-action-field sm:col-span-2"><span>{txt(ar,"Output workflow field (optional)","حقل إخراج سير العمل (اختياري)")}</span><select value={String(a.config.outputFieldId ?? "")} onChange={e=>update(i,"outputFieldId",e.target.value)}><option value="">{txt(ar,"No output field","بدون حقل إخراج")}</option>{workflowFields.map(f=><option key={f.id} value={f.id}>{f.name || f.id}</option>)}</select></label>
          </>}

          {a.type === "custom_function" && <>
            <div className="sm:col-span-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3"><div className="text-[9.5px] font-semibold text-violet-900">{txt(ar,"Custom Function = reusable logic","Custom Function = منطق مخصص قابل لإعادة الاستخدام")}</div><p className="mt-1 text-[9px] leading-4 text-violet-800">{txt(ar,"Choose a published safe function. If that function contains HTTP_REQUEST, its configured Connection is used by the runtime.","اختر دالة آمنة منشورة. إذا احتوت الدالة على HTTP_REQUEST فسيستخدم Runtime الاتصال المحدد داخلها.")}</p></div>
            <label className="workflow-action-field sm:col-span-2">
              <span>{txt(ar,"Secure function","الدالة الآمنة")}</span>
              <select value={String(a.config.functionId ?? "")} onChange={e=>update(i,"functionId",e.target.value)}>
                <option value="">{txt(ar,"Select a function","اختر دالة")}</option>
                {functions.map(f=><option key={f.id} value={f.id}>{f.name} · v{f.activeVersion?.version ?? 1}</option>)}
              </select>
            </label>
            {linkedFunction
              ? <div className="workflow-function-link sm:col-span-2"><span className="workflow-function-link-icon">ƒ</span><div className="min-w-0 flex-1"><div className="truncate font-semibold">{linkedFunction.name}</div><div className="text-[9px] text-slate-500">{ar ? "الإصدار النشط سيُنفذ مع هذا الإجراء." : "The active version will execute with this action."}</div></div><span className="workflow-function-version">v{linkedFunction.activeVersion?.version ?? 1}</span><Link href="/files/workflows/functions" className="text-[9px] font-semibold text-[var(--wd-primary)] hover:underline">{ar ? "إدارة الدوال" : "Manage functions"}</Link></div>
              : <div className="workflow-function-empty sm:col-span-2"><span>{functions.length ? (ar ? "اختر دالة آمنة لربط هذا الإجراء بها." : "Select a safe function to link this action.") : (ar ? "لا توجد دوال آمنة مخصصة بعد." : "No custom safe functions yet.")}</span><Link href="/files/workflows/functions" className="font-semibold text-[var(--wd-primary)] hover:underline">{ar ? "إنشاء دالة" : "Create function"}</Link></div>}
          </>}
        </div>
      </div>;
    })}

    <div className="relative">
      <button type="button" onClick={() => setMenuOpen(v => !v)} disabled={actions.length >= 5} className="workflow-add-action-trigger" aria-expanded={menuOpen}>＋ {txt(ar,"Add instant action","إضافة إجراء فوري")} <span className="text-slate-400">⌄</span></button>
      {menuOpen && <div className="workflow-action-menu absolute start-0 top-full z-[80] mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-[var(--wd-menu-shadow)]">{allowed.map(([v,en,arLabel])=><button key={v} type="button" onClick={() => add(v)} className="wd-menu-item flex w-full items-center gap-2 text-start"><span className="flex-1 truncate">{txt(ar,en,arLabel)}</span><span className="text-slate-400">＋</span></button>)}</div>}
    </div>
  </div>;
}
function FolderActionField({ action: a, index, ar, update, parentOnly = false }: { action: Action; index: number; ar: boolean; update: (i: number, key: string, value: unknown) => void; parentOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const key = parentOnly ? "parentFolderId" : "destinationFolderId";
  const selectedId = typeof a.config[key] === "string" ? String(a.config[key]) : "";
  const [selectedName, setSelectedName] = useState("");
  return <label className="workflow-action-field sm:col-span-2"><span>{parentOnly ? (ar ? "المجلد الأب (اختياري)" : "Parent folder (optional)") : (ar ? "مجلد الوجهة" : "Destination folder")}</span><div className="flex gap-2"><button type="button" onClick={() => setOpen(true)} className="workflow-picker-control flex-1"><span className="truncate">{selectedName || selectedId || (ar ? "اختر مجلداً" : "Choose a folder")}</span><span className="text-slate-400">⌄</span></button>{selectedId ? <button type="button" onClick={() => { update(index,key,""); setSelectedName(""); }} className="wd-icon-btn" aria-label={ar ? "مسح" : "Clear"}>×</button> : null}</div>{open ? <FolderTreePicker open={open} value={selectedId} ar={ar} onClose={() => setOpen(false)} onSelect={(folder) => { update(index,key,folder.id); setSelectedName(folder.name); setOpen(false); }} /> : null}</label>;
}

function ConditionEditor({ condition, ar, onChange }: { condition: unknown; ar: boolean; onChange: (value: unknown) => void }) {
  const base = condition && typeof condition === "object" ? condition as Record<string, unknown> : {};
  const rules = Array.isArray(base.rules) ? base.rules as Array<Record<string, unknown>> : [];
  const logic = String(base.logic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
  const normalized = rules;
  const fields = [["fileType","File type","نوع الملف"],["extension","Extension","الامتداد"],["name","Name","الاسم"],["mimeType","MIME type","نوع MIME"],["size","Size","الحجم"]] as const;
  const operators = [["equals","Equals","يساوي"],["not_equals","Not equals","لا يساوي"],["contains","Contains","يحتوي على"],["starts_with","Starts with","يبدأ بـ"],["ends_with","Ends with","ينتهي بـ"],["greater_than","Greater than","أكبر من"],["less_than","Less than","أصغر من"],["exists","Exists","موجود"]] as const;
  const emit = (nextRules: Array<Record<string, unknown>>, nextLogic = logic) => onChange({ logic: nextLogic, rules: nextRules });
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div><div className="text-[10.5px] font-semibold text-slate-700">{txt(ar,"Condition group","مجموعة الشرط")}</div><div className="mt-0.5 text-[9px] text-slate-400">{txt(ar,"All/any rules must match before this transition runs.","حدد كيف يتم ربط الشروط قبل تنفيذ الانتقال.")}</div></div><select value={logic} onChange={e=>emit(normalized,e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-medium"><option value="AND">AND · {txt(ar,"All","الكل")}</option><option value="OR">OR · {txt(ar,"Any","أي")}</option></select></div>
    <div className="mt-3 space-y-2">{normalized.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-[9.5px] text-slate-400">{txt(ar,"No conditions. This transition is unrestricted.","لا توجد شروط. هذا الانتقال غير مقيد بشرط.")}</div> : null}{normalized.map((r,i)=><div key={i} className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <select value={String(r.field ?? "fileType")} onChange={e=>{const n=[...normalized];n[i]={...n[i],field:e.target.value};emit(n)}} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[9.5px]">{fields.map(([v,en,arText])=><option key={v} value={v}>{txt(ar,en,arText)}</option>)}</select>
      <select value={String(r.operator ?? "equals")} onChange={e=>{const n=[...normalized];n[i]={...n[i],operator:e.target.value};emit(n)}} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-[9.5px]">{operators.map(([v,en,arText])=><option key={v} value={v}>{txt(ar,en,arText)}</option>)}</select>
      <input value={String(r.value ?? "")} onChange={e=>{const n=[...normalized];n[i]={...n[i],value:e.target.value};emit(n)}} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-[9.5px]" placeholder={txt(ar,"Value","القيمة")} />
      <button type="button" disabled={false} onClick={()=>emit(normalized.filter((_,x)=>x!==i))} className="rounded-lg px-2 py-2 text-[9px] text-red-500 hover:bg-red-50 disabled:opacity-30" aria-label={txt(ar,"Delete condition","حذف الشرط")}>×</button>
    </div>)}</div>
    <button type="button" onClick={()=>emit([...normalized,{field:"fileType",operator:"equals",value:"PDF"}])} className="mt-2.5 wd-pill wd-pill-new text-[9.5px]">＋ {txt(ar,"Add condition","إضافة شرط")}</button>
  </div>;
}

function WorkflowCanvas({ states, transitions, positions, setPositions, selected, onSelect, selectedNodes, onSelectNodes, onAddTransition, onConnect, onAddStateAt, onAddNodeTemplate, onDeleteStates, onDeleteTransition, onDuplicateStates, onAutoLayout, onHistoryStart, onPasteClipboard, onUndo, onRedo, canUndo, canRedo, zoom, setZoom, ar }: { states: StateDraft[]; transitions: TransitionDraft[]; positions: Position[]; setPositions: (p: Position[]) => void; selected: string; onSelect: (v: string) => void; selectedNodes: number[]; onSelectNodes: (v: number[]) => void; onAddTransition: (from?: number) => void; onConnect: (from: number, to: number, sourceSide?: ConnectionSide, targetSide?: ConnectionSide) => void; onAddStateAt: (point: Position) => void; onAddNodeTemplate: (template: WorkflowNodeTemplate, point: Position) => void; onDeleteStates: (indices: number[]) => void; onDeleteTransition: (index: number) => void; onDuplicateStates: (indices: number[]) => void; onAutoLayout: () => void; onHistoryStart: () => void; onPasteClipboard: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; zoom: number; setZoom: (v: number) => void; ar: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ index: number; dx: number; dy: number; group: Array<{ index: number; x: number; y: number }> } | null>(null);
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [snap, setSnap] = useState(true);
  const CARD_W = 270;
  const CARD_H = 110;
  const SNAP = 10;
  const pointerPoint = (e: PointerEvent | ReactPointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const el = canvasRef.current;
    if (!rect || !el) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left + el.scrollLeft) / zoom, y: (e.clientY - rect.top + el.scrollTop) / zoom };
  };
  const sidePoint = (i: number, side: ConnectionSide) => {
    const p = positions[i] ?? { x: 100, y: 100 };
    if (side === "top") return { x: p.x + CARD_W / 2, y: p.y };
    if (side === "right") return { x: p.x + CARD_W, y: p.y + CARD_H / 2 };
    if (side === "bottom") return { x: p.x + CARD_W / 2, y: p.y + CARD_H };
    return { x: p.x, y: p.y + CARD_H / 2 };
  };
  const opposite = (side: ConnectionSide): ConnectionSide => side === "top" ? "bottom" : side === "right" ? "left" : side === "bottom" ? "top" : "right";
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) { const target = e.target as HTMLElement; if (!target.matches("input,textarea,select,[contenteditable=true]")) { e.preventDefault(); setSpaceDown(true); } } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", key); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", up); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing = !!target?.matches("input,textarea,select,[contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;
      if (editing) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (selected.startsWith("transition-")) { onDeleteTransition(Number(selected.split("-")[1])); } else if (selectedNodes.length) { onDeleteStates(selectedNodes); } return; }
      if (mod && e.key.toLowerCase() === "c" && selectedNodes.length) {
        e.preventDefault();
        const ids = [...selectedNodes].sort((a,b)=>a-b);
        const map = new Map(ids.map((id,i)=>[id,i]));
        workflowCanvasClipboard = { states: ids.map(i=>({ ...states[i] })), transitions: transitions.filter(t=>map.has(t.from)&&map.has(t.to)).map(t=>({ ...t, from: map.get(t.from)!, to: map.get(t.to)! })), positions: ids.map(i=>({ ...positions[i] })) };
        return;
      }
      if (mod && e.key.toLowerCase() === "v" && workflowCanvasClipboard) { e.preventDefault(); onPasteClipboard(); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? onRedo() : onUndo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, selectedNodes, states, transitions, positions, onDeleteStates, onDeleteTransition, onDuplicateStates, onPasteClipboard, onUndo, onRedo]);

  useEffect(() => {
    if (!drag && !connection && !pan) return;
    const move = (e: PointerEvent) => {
      if (pan) { const el=canvasRef.current; if (el) { el.scrollLeft = pan.scrollLeft - (e.clientX-pan.x); el.scrollTop = pan.scrollTop - (e.clientY-pan.y); } return; }
      if (drag) {
        const point = pointerPoint(e);
        let x = point.x - drag.dx, y = point.y - drag.dy;
        const base = positions[drag.index] ?? { x: 20, y: 30 };
        let dx = x - base.x, dy = y - base.y;
        if (snap) { dx = Math.round(dx/SNAP)*SNAP; dy = Math.round(dy/SNAP)*SNAP; }
        const next = [...positions];
        drag.group.forEach((g) => { next[g.index] = { x: Math.max(20, g.x + dx), y: Math.max(30, g.y + dy) }; });
        setPositions(next);
      }
      if (connection) { const point = pointerPoint(e); setConnection(c => c ? { ...c, x: point.x, y: point.y } : c); }
    };
    const up = (e: PointerEvent) => {
      if (pan) { setPan(null); return; }
      if (connection) {
        const el = document.elementFromPoint(e.clientX,e.clientY) as HTMLElement | null;
        const handle = el?.closest<HTMLElement>('[data-workflow-target-handle="true"]');
        const to = handle ? Number(handle.dataset.stateIndex) : -1;
        const targetSide = handle?.dataset.side as ConnectionSide | undefined;
        if (to >= 0 && to !== connection.from) onConnect(connection.from,to,connection.sourceSide,targetSide);
        setConnection(null);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, connection, pan, positions, setPositions, zoom, snap]);
  const width = Math.max(1800, ...positions.map((p) => p.x + CARD_W + 180), 1800);
  const height = Math.max(1100, ...positions.map((p) => p.y + CARD_H + 180), 1100);
  const curve = (a:{x:number;y:number}, b:{x:number;y:number}, as:ConnectionSide, bs:ConnectionSide) => {
    const distance = Math.max(70, Math.min(240, Math.hypot(b.x-a.x,b.y-a.y)*0.42));
    const vector = (side:ConnectionSide) => side === "top" ? {x:0,y:-distance} : side === "right" ? {x:distance,y:0} : side === "bottom" ? {x:0,y:distance} : {x:-distance,y:0};
    const av=vector(as), bv=vector(bs);
    return `M ${a.x} ${a.y} C ${a.x+av.x} ${a.y+av.y}, ${b.x+bv.x} ${b.y+bv.y}, ${b.x} ${b.y}`;
  };
  return <div ref={canvasRef} className={`workflow-canvas-pane relative h-full min-h-0 overflow-auto bg-[#F8FAFC] ${spaceDown ? "cursor-grab" : ""}`} dir="ltr"
    onPointerDown={(e) => { if ((spaceDown || e.button === 1) && e.target === e.currentTarget) { const el=canvasRef.current; if(el) setPan({x:e.clientX,y:e.clientY,scrollLeft:el.scrollLeft,scrollTop:el.scrollTop}); } }}
    onDoubleClick={(e) => { const target = e.target as HTMLElement; if (target.closest(".workflow-state-node,button,.workflow-connection-handle")) return; onAddStateAt(pointerPoint(e)); }}
    onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-imkan-workflow-node")) e.preventDefault(); }}
    onDrop={(e) => { const template = e.dataTransfer.getData("application/x-imkan-workflow-node") as WorkflowNodeTemplate; if (!template) return; e.preventDefault(); onAddNodeTemplate(template, pointerPoint(e)); }}>
    <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(#CBD5E1 1px, transparent 1px)", backgroundSize: `${18 * zoom}px ${18 * zoom}px` }} />
    <div className="sticky left-0 top-0 z-40 flex h-12 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur" dir={ar ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2"><span className="rounded-lg bg-[var(--wd-primary-light)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--wd-primary)]">{txt(ar,"Visual workflow","التصميم المرئي")}</span><span className="text-[10px] text-slate-400">{txt(ar,"Drag nodes • connect from any side • Space + drag to pan • Snap to grid","حرّك العناصر • اربط من أي جانب • Space + اسحب للتحريك • محاذاة للشبكة")}</span></div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onUndo} disabled={!canUndo} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] disabled:opacity-35" title={txt(ar,"Undo (Ctrl/Cmd+Z)","تراجع (Ctrl/Cmd+Z)")}>↶</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] disabled:opacity-35" title={txt(ar,"Redo (Ctrl/Cmd+Y)","إعادة (Ctrl/Cmd+Y)")}>↷</button>
        <button type="button" onClick={()=>setSnap(v=>!v)} className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-medium ${snap?"border-[var(--wd-primary)] bg-[var(--wd-primary-light)] text-[var(--wd-primary)]":"border-slate-200 bg-white text-slate-500"}`}>{snap ? txt(ar,"Snap on","محاذاة") : txt(ar,"Free move","حركة حرة")}</button>
        <button type="button" onClick={onAutoLayout} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-medium text-slate-600 hover:bg-slate-50">{txt(ar,"Auto layout","تخطيط تلقائي")}</button>
        <button type="button" onClick={()=>onDuplicateStates(selectedNodes.length ? selectedNodes : [0])} disabled={!selectedNodes.length} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-medium text-slate-600 disabled:opacity-35">{txt(ar,"Duplicate","تكرار")}</button><button type="button" onClick={onPasteClipboard} disabled={!workflowCanvasClipboard} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-medium text-slate-600 disabled:opacity-35">{txt(ar,"Paste","لصق")}</button>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => setZoom(Math.max(.55, Number((zoom - .1).toFixed(2))))} className="h-7 w-7 rounded-md hover:bg-slate-50">−</button><span className="w-12 text-center text-[10px] font-medium text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(Math.min(1.5, Number((zoom + .1).toFixed(2))))} className="h-7 w-7 rounded-md hover:bg-slate-50">＋</button></div>
      </div>
    </div>
    <div className="pointer-events-auto absolute left-4 top-16 z-40 w-[190px] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur" dir={ar ? "rtl" : "ltr"}>
      <div className="px-1.5 pb-2"><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"Node palette","عناصر سير العمل")}</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{txt(ar,"Drag a node onto the canvas or click to add it near the selected node.","اسحب العنصر إلى اللوحة أو اضغط لإضافته قرب العنصر المحدد.")}</div></div>
      <div className="space-y-1.5">
        {([["action","Action step","خطوة إجراء","⚡"],["condition","Condition","شرط","◇"],["approval","Approval","موافقة","✓"],["end","End step","نهاية","■"]] as const).map(([type,en,arLabel,icon]) => <button key={type} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-imkan-workflow-node", type); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => { const base = selectedNodes[0] ?? 0; const p = positions[base] ?? { x: 120, y: 120 }; onAddNodeTemplate(type, { x: p.x + 330, y: p.y + 35 }); }} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-start transition hover:border-[var(--wd-primary)] hover:bg-[var(--wd-primary-light)]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-slate-700">{txt(ar,en,arLabel)}</span><span className="block truncate text-[8px] text-slate-400">{type === "action" ? txt(ar,"Action on transition","إجراء على الانتقال") : type === "condition" ? txt(ar,"Conditional transition","انتقال مشروط") : type === "approval" ? txt(ar,"Manual approval step","خطوة موافقة يدوية") : txt(ar,"Terminal state","حالة نهائية")}</span></span>
        </button>)}
      </div>
    </div>
    <div className="relative" style={{ width: width * zoom, height: height * zoom }}>
      <svg className="pointer-events-none absolute inset-0 z-10" width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
        <defs><marker id="wf-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#94A3B8"/></marker><marker id="wf-arrow-active" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill={BLUE}/></marker></defs>
        {transitions.map((t,i)=>{ const as=t.sourceSide??"right", bs=t.targetSide??"left"; const a=sidePoint(t.from,as), b=sidePoint(t.to,bs); const active=selected===`transition-${i}`; const d=curve(a,b,as,bs); return <g key={i}><path d={d} fill="none" stroke={active?BLUE:"#64748B"} strokeWidth={active?3:2} strokeLinecap="round" markerEnd={`url(#${active?"wf-arrow-active":"wf-arrow"})`}/><foreignObject x={(a.x+b.x)/2-78} y={(a.y+b.y)/2-15} width="156" height="30"><button type="button" onClick={()=>onSelect(`transition-${i}`)} className={`pointer-events-auto mx-auto block max-w-[150px] truncate rounded-md border bg-white px-3 py-1.5 text-[9.5px] font-semibold shadow-md transition hover:-translate-y-0.5 hover:border-[var(--wd-primary)] hover:text-[var(--wd-primary)] ${active ? "border-[var(--wd-primary)] text-[var(--wd-primary)] ring-2 ring-[var(--wd-primary)]/10" : "border-slate-300 text-slate-700"}`}>{t.name||txt(ar,"Transition","انتقال")}</button></foreignObject></g>; })}
        {connection && <path d={curve(sidePoint(connection.from,connection.sourceSide),{x:connection.x,y:connection.y},connection.sourceSide,opposite(connection.sourceSide))} fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round"/>}
      </svg>
      {states.map((s,i)=><div key={i} onPointerDown={(e)=>{ const target=e.target as HTMLElement; if(target.closest("button, .workflow-connection-handle")) return; const point=pointerPoint(e); const group = selectedNodes.includes(i) ? selectedNodes : [i]; if (!selectedNodes.includes(i)) onSelectNodes([i]); onHistoryStart(); setDrag({index:i,dx:point.x-positions[i].x,dy:point.y-positions[i].y,group:group.map(index=>({index,x:positions[index]?.x??0,y:positions[index]?.y??0}))}); }} style={{left:positions[i].x*zoom,top:positions[i].y*zoom,transform:`scale(${zoom})`,transformOrigin:"top left"}} className="workflow-state-node absolute z-20 w-[270px] select-none overflow-visible">
        <button type="button" onClick={(e)=>{ if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();onSelectNodes(selectedNodes.includes(i)?selectedNodes.filter(x=>x!==i):[...selectedNodes,i]);}else{onSelectNodes([i]);onSelect(`state-${i}`);} }} className={`w-full rounded-lg border bg-white p-4 text-start shadow-[0_8px_25px_rgba(15,23,42,.08)] transition hover:-translate-y-0.5 ${selectedNodes.includes(i)||selected===`state-${i}`?"border-[var(--wd-primary)] ring-4 ring-[var(--wd-primary)]/10":"border-slate-200"}`} dir={ar?"rtl":"ltr"}>
          <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-semibold ${i===0?"bg-[var(--wd-primary-light)] text-[var(--wd-primary)]":s.terminal?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{i+1}</span><span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold uppercase tracking-[.16em] text-slate-400">{txt(ar,"State","حالة")}</span><span className="mt-1 block truncate text-[13px] font-semibold text-slate-900">{s.name||txt(ar,"Untitled state","حالة بلا اسم")}</span><span className="mt-1 block line-clamp-2 text-[10.5px] leading-4 text-slate-500">{s.description||txt(ar,"Add a description","أضف وصفاً")}</span></span>{s.terminal&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700">{txt(ar,"FINAL","نهائي")}</span>}</div>
        </button>
        {(["top","right","bottom","left"] as ConnectionSide[]).map(side=><span key={side} data-workflow-target-handle="true" data-state-index={i} data-side={side} className={`workflow-connection-handle workflow-handle-${side}`} title={txt(ar,"Drag from or connect here","اسحب من هنا أو اربط هنا")} onPointerDown={(e)=>{e.stopPropagation();e.preventDefault();const point=pointerPoint(e);setConnection({from:i,sourceSide:side,x:point.x,y:point.y});}} />)}
        <button type="button" onClick={(e)=>{e.stopPropagation();onAddTransition(i)}} className="absolute -bottom-3 left-1/2 z-30 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-[15px] text-slate-500 shadow-sm transition hover:scale-110 hover:border-[var(--wd-primary)] hover:text-[var(--wd-primary)]">＋</button>
      </div>)}
      <div className="absolute bottom-7 left-7 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur" dir={ar?"rtl":"ltr"}><div className="border-b border-slate-100 px-3 py-2 text-[9px] font-semibold uppercase tracking-[.15em] text-slate-400">{txt(ar,"Mini map","خريطة مصغرة")}</div><div className="relative h-[105px] w-[190px] cursor-crosshair bg-slate-50" onClick={(e)=>{ const rect=(e.currentTarget as HTMLElement).getBoundingClientRect(); const nx=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)); const ny=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height)); const el=canvasRef.current; if(el){ el.scrollLeft=Math.max(0,nx*width*zoom-el.clientWidth/2); el.scrollTop=Math.max(0,ny*height*zoom-el.clientHeight/2); } }}><div className="absolute inset-3 rounded border border-slate-200 bg-white">{states.map((s,i)=><span key={i} className={`absolute h-2.5 w-5 rounded-sm ${s.terminal?"bg-emerald-400":"bg-[var(--wd-primary)]"}`} style={{left:`${Math.min(86,(positions[i].x/width)*100)}%`,top:`${Math.min(86,(positions[i].y/height)*100)}%`}}/>)}<span className="pointer-events-none absolute inset-0 border-2 border-[var(--wd-primary)]/25" /></div></div></div>
    </div>
  </div>;
}
export default function WorkflowBuilderPage() {
  const { locale } = useLocale();
  const access = useWorkflowAccess(); const ar = locale === "ar"; const router = useRouter(); const params = useSearchParams(); const urlId = params.get("id");
  const [workflowId, setWorkflowId] = useState<string | null>(urlId);
  const recipeParam = (params.get("recipe") as WorkflowRecipe | null) || "REVIEW_FILE";
  const recipe: WorkflowRecipe = ["REVIEW_FILE", "NOTIFY_UPLOAD", "EXTERNAL_API", "CUSTOM_FUNCTION"].includes(recipeParam) ? recipeParam : "REVIEW_FILE";
  const starter = recipeDefaults(recipe);
  useEffect(() => { if (urlId || access?.canCreate) return; router.replace("/files/workflows"); }, [access, router, urlId]); const [step, setStep] = useState<1 | 2 | 3>(1); const [name, setName] = useState(params.get("name") || ""); const [description, setDescription] = useState(params.get("description") || ""); const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL">(params.get("mode") === "MANUAL" ? "MANUAL" : "AUTOMATIC"); const [resourceType, setResourceType] = useState<"FILE" | "FOLDER">(params.get("resourceType") === "FOLDER" ? "FOLDER" : "FILE");
  const [triggers, setTriggers] = useState<string[]>(["upload"]); const [fields, setFields] = useState<WorkflowField[]>([]); const [states, setStates] = useState<StateDraft[]>(starter.states); const [transitions, setTransitions] = useState<TransitionDraft[]>(starter.transitions); const [positions, setPositionsState] = useState<Position[]>(starter.positions); const [selectedNodes, setSelectedNodes] = useState<number[]>([0]); const historyRef = useRef<GraphSnapshot[]>([]); const redoRef = useRef<GraphSnapshot[]>([]);
  const [selected, setSelected] = useState("state-0"); const [phase, setPhase] = useState<Phase>("during"); const [connectionHealth, setConnectionHealth] = useState<WorkflowConnectionHealth | null>(null); const [connectionHealthLoading, setConnectionHealthLoading] = useState(false); const [zoom, setZoom] = useState(1); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(Boolean(urlId)); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [fieldDraft, setFieldDraft] = useState<WorkflowField | null>(null); const [dragFieldType, setDragFieldType] = useState<string | null>(null); const [activationOpen, setActivationOpen] = useState(false); const [fieldsDragOver, setFieldsDragOver] = useState(false); const [elementsOpen, setElementsOpen] = useState(false); const [activatedId, setActivatedId] = useState<string | null>(null);
  const setPositions = (next: Position[]) => { setPositionsState(next); if (workflowId && typeof window !== "undefined") localStorage.setItem(`workflow-layout:${workflowId}`, JSON.stringify(next)); };
  const graphSnapshot = (): GraphSnapshot => ({ states: states.map((s) => ({ ...s })), transitions: transitions.map((t) => ({ ...t, before: t.before.map((a) => ({ ...a, config: { ...a.config } })), during: t.during.map((a) => ({ ...a, config: { ...a.config } })), after: t.after.map((a) => ({ ...a, config: { ...a.config } })) })), positions: positions.map((p) => ({ ...p })) });
  const markHistory = () => { historyRef.current = [...historyRef.current, graphSnapshot()].slice(-60); redoRef.current = []; };
  const restoreGraph = (g: GraphSnapshot) => { setStates(g.states.map((s) => ({ ...s }))); setTransitions(g.transitions.map((t) => ({ ...t, before: t.before.map((a) => ({ ...a, config: { ...a.config } })), during: t.during.map((a) => ({ ...a, config: { ...a.config } })), after: t.after.map((a) => ({ ...a, config: { ...a.config } })) }))); setPositions(g.positions.map((p) => ({ ...p }))); setSelectedNodes([0]); setSelected("state-0"); };
  const undoGraph = () => { const previous = historyRef.current.pop(); if (!previous) return; redoRef.current = [...redoRef.current, graphSnapshot()].slice(-60); restoreGraph(previous); };
  const redoGraph = () => { const next = redoRef.current.pop(); if (!next) return; historyRef.current = [...historyRef.current, graphSnapshot()].slice(-60); restoreGraph(next); };
  useEffect(() => {
    if (!workflowId || typeof window === "undefined") return;
    const layout = { positions, connections: transitions.map((t) => ({ sourceSide: t.sourceSide ?? "right", targetSide: t.targetSide ?? "left" })) };
    localStorage.setItem(`workflow-layout:${workflowId}:v2`, JSON.stringify(layout));
  }, [workflowId, positions, transitions]);

  useEffect(() => { if (!urlId) return; void getWorkflow(urlId).then((w: Workflow) => { setWorkflowId(w.id); setName(w.name); setDescription(w.description || ""); setMode(w.mode); setResourceType(w.resourceType); const tv = w.steps.find((s) => s.kind === "TRIGGER")?.config.value; if (Array.isArray(tv)) setTriggers(tv.map(String)); else if (typeof tv === "string") setTriggers([tv]); const fv = w.steps.find((s) => s.kind === "WORKFLOW_FIELDS")?.config.value; if (Array.isArray(fv)) setFields(fv as WorkflowField[]); if (w.states.length) setStates(w.states.map((s) => ({ name: s.name, description: s.description || "", terminal: s.terminal }))); if (w.transitions.length) setTransitions(w.transitions.map((t) => { const p = normalizePhaseActions(t.actions); return { from: w.states.findIndex((s) => s.id === t.fromStateId), to: w.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description || "", trigger: t.trigger || "", condition: t.condition || "any", execution: t.trigger === "manual" ? "MANUAL" : "AUTOMATIC", sourceSide: (t as any).sourceSide, targetSide: (t as any).targetSide, ...p }; })); const savedV2 = typeof window !== "undefined" ? localStorage.getItem(`workflow-layout:${w.id}:v2`) : null;
      const saved = typeof window !== "undefined" ? localStorage.getItem(`workflow-layout:${w.id}`) : null;
      if (savedV2) { try { const layout = JSON.parse(savedV2) as { positions?: unknown; connections?: unknown }; if (Array.isArray(layout.positions)) setPositionsState(layout.positions as Position[]); if (Array.isArray(layout.connections)) setTransitions((current) => current.map((t, i) => ({ ...t, sourceSide: (layout.connections as any[])[i]?.sourceSide ?? t.sourceSide, targetSide: (layout.connections as any[])[i]?.targetSide ?? t.targetSide }))); } catch {} }
      else if (saved) { try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setPositionsState(parsed); } catch {} } }).catch(() => setError(txt(ar,"Unable to load workflow.","تعذر تحميل سير العمل."))).finally(() => setLoading(false)); }, [urlId, ar]);
  useEffect(() => { setPositionsState((old) => states.map((_, i) => old[i] || DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length] || { x: 100 + (i % 3) * 360, y: 100 + Math.floor(i / 3) * 250 })); }, [states.length]);
  useEffect(() => { if (!urlId && mode === "MANUAL") setTransitions((v) => v.map((t, i) => i === 0 ? { ...t, execution: "MANUAL" } : t)); }, [mode, urlId]);

  const selectedStateIndex = selected.startsWith("state-") ? Number(selected.split("-")[1]) : -1; const selectedTransitionIndex = selected.startsWith("transition-") ? Number(selected.split("-")[1]) : -1; const selectedTransition = selectedTransitionIndex >= 0 ? transitions[selectedTransitionIndex] : null;
  const updateTransition = (i: number, patch: Partial<TransitionDraft>) => setTransitions((v) => v.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  const addState = (at?: Position) => { if (states.length >= 20) return; markHistory(); const next = [...states, { name: `${txt(ar,"State","حالة")} ${states.length + 1}`, description: "", terminal: false }]; const fallback = DEFAULT_POSITIONS[states.length % DEFAULT_POSITIONS.length] || { x: 100, y: 100 }; setStates(next); setPositions([...positions, at ? { x: Math.max(20, at.x - 135), y: Math.max(30, at.y - 55) } : fallback]); setSelected(`state-${next.length - 1}`); setSelectedNodes([next.length - 1]); };
  const addStateAt = (point: Position) => addState(point);
  const addNodeTemplate = (template: WorkflowNodeTemplate, point: Position) => {
    const from = selectedNodes[0] ?? 0;
    if (states.length >= 20) return;
    markHistory();
    const nextIndex = states.length;
    const labels: Record<WorkflowNodeTemplate, { name: string; description: string; terminal: boolean }> = {
      action: { name: txt(ar,"Action step","خطوة إجراء"), description: txt(ar,"Perform an action before continuing.","تنفيذ إجراء قبل المتابعة."), terminal: false },
      condition: { name: txt(ar,"Condition","شرط"), description: txt(ar,"Continue only when the configured rules match.","المتابعة فقط عند تحقق الشروط المحددة."), terminal: false },
      approval: { name: txt(ar,"Approval","موافقة"), description: txt(ar,"Wait for a manual approval decision.","انتظار قرار موافقة يدوي."), terminal: false },
      end: { name: txt(ar,"End","نهاية"), description: txt(ar,"Terminal workflow state.","حالة نهائية لسير العمل."), terminal: true },
    };
    const spec = labels[template];
    const fromPoint = positions[from] ?? { x: 120, y: 120 };
    const target = { x: Math.max(20, point.x - 135), y: Math.max(30, point.y - 55) };
    const ns = [...states, spec];
    const transition = transitionDefaults(from, nextIndex, transitions.length + 1);
    if (template === "approval") { transition.name = txt(ar,"Request approval","طلب موافقة"); transition.execution = "MANUAL"; transition.trigger = "manual"; transition.during = [action("request_approval", { title: txt(ar,"Approval required","مطلوب موافقة"), message: txt(ar,"Please review this workflow step.","يرجى مراجعة خطوة سير العمل.") })]; }
    if (template === "action") { transition.name = txt(ar,"Run action","تنفيذ الإجراء"); transition.during = [action("notify", { title: txt(ar,"Action step","خطوة إجراء"), message: "{{file.name}}" })]; }
    if (template === "condition") { transition.name = txt(ar,"Check condition","فحص الشرط"); transition.condition = { logic: "AND", rules: [{ field: "fileType", operator: "equals", value: "PDF" }] }; }
    if (template === "end") transition.name = txt(ar,"Complete","إكمال");
    setStates(ns); setPositions([...positions, target]); setTransitions([...transitions, transition]); setSelectedNodes([nextIndex]); setSelected(`state-${nextIndex}`);
    setMessage(txt(ar,`${spec.name} added and connected. Configure it on the right.`,`${spec.name} تمت إضافتها وربطها. يمكنك إعدادها من اليمين.`));
  };
  const connectStates = (from: number, to: number, sourceSide: ConnectionSide = "right", targetSide: ConnectionSide = "left") => { if (from === to) return; const exists = transitions.some((t) => t.from === from && t.to === to); if (exists) { setSelected(`transition-${transitions.findIndex((t) => t.from === from && t.to === to)}`); return; } markHistory(); const next = [...transitions, { ...transitionDefaults(from, to, transitions.length + 1), sourceSide, targetSide }]; setTransitions(next); setSelected(`transition-${next.length - 1}`); setMessage(txt(ar,"Transition connected. Configure its conditions and actions on the right.","تم ربط الانتقال. يمكنك إعداد شروطه وإجراءاته من اليمين.")); };
  const removeState = (i: number) => removeStates([i]);
  const removeStates = (indices: number[]) => { const unique = [...new Set(indices)].filter((i) => i > 0 && i < states.length).sort((a,b)=>b-a); if (!unique.length || states.length - unique.length < 1) return; markHistory(); let ns = states.map((s) => s); let nt = transitions.map((t) => ({ ...t })); let np = positions.map((p) => ({ ...p })); unique.forEach((i) => { ns = ns.filter((_, idx) => idx !== i); nt = nt.filter((t) => t.from !== i && t.to !== i).map((t) => ({ ...t, from: t.from > i ? t.from - 1 : t.from, to: t.to > i ? t.to - 1 : t.to })); np = np.filter((_, idx) => idx !== i); }); setStates(ns); setTransitions(nt); setPositions(np); setSelected("state-0"); setSelectedNodes([0]); };
  const removeTransition = (i: number) => { if (i < 0 || i >= transitions.length) return; markHistory(); const next = transitions.filter((_, idx) => idx !== i); setTransitions(next); setSelected(next.length ? `transition-${Math.max(0, Math.min(i, next.length - 1))}` : "state-0"); setError(""); };
  const addTransitionFrom = (from = Math.max(0, states.length - 2)) => { if (states.length < 2) { setError(txt(ar,"Add at least two states first.","أضف حالتين على الأقل أولاً.")); return; } markHistory(); const candidates = states.map((_, i) => i).filter((i) => i !== from); const to = candidates[0] ?? 0; const next = [...transitions, transitionDefaults(from, to, transitions.length + 1)]; setTransitions(next); setSelected(`transition-${next.length - 1}`); setError(""); };
  const duplicateStates = (indices: number[]) => { const source = [...new Set(indices)].filter((i) => i >= 0 && i < states.length).sort((a,b)=>a-b); if (!source.length || states.length + source.length > 20) return; markHistory(); const map = new Map(source.map((old,i)=>[old, states.length+i])); const copies = source.map((i,n)=>({ ...states[i], name: `${states[i].name || txt(ar,"State","حالة")} ${txt(ar,"copy","نسخة")} ${n+1}` })); const offset = {x: 70, y: 70}; const copiedPositions = source.map((i)=>({x:(positions[i]?.x??100)+offset.x,y:(positions[i]?.y??100)+offset.y})); const internal = transitions.filter(t=>map.has(t.from)&&map.has(t.to)).map((t,i)=>({ ...t, from: map.get(t.from)!, to: map.get(t.to)!, name: `${t.name || txt(ar,"Transition","انتقال")} ${txt(ar,"copy","نسخة")} ${i+1}` })); setStates([...states,...copies]); setPositions([...positions,...copiedPositions]); setTransitions([...transitions,...internal]); const selectedCopy=[...map.values()]; setSelectedNodes(selectedCopy); setSelected(`state-${selectedCopy[0]}`); };
  const autoLayout = () => { if (!states.length) return; markHistory(); const colCount = Math.max(2, Math.ceil(Math.sqrt(states.length))); const next = states.map((_,i)=>({x:80+(i%colCount)*360,y:80+Math.floor(i/colCount)*230})); setPositions(next); setMessage(txt(ar,"Canvas arranged automatically.","تم ترتيب اللوحة تلقائياً.")); };
  const pasteClipboard = () => { const clip = workflowCanvasClipboard; if (!clip || states.length + clip.states.length > 20) return; markHistory(); const base = states.length; const copies = clip.states.map((s,n)=>({ ...s, name: `${s.name || txt(ar,"State","حالة")} ${txt(ar,"copy","نسخة")} ${n+1}` })); const nextPositions = clip.positions.map((p)=>({x:p.x+90,y:p.y+90})); const copiedTransitions = clip.transitions.map((t,i)=>({ ...t, from: base+t.from, to: base+t.to, name: `${t.name || txt(ar,"Transition","انتقال")} ${txt(ar,"copy","نسخة")} ${i+1}` })); setStates([...states,...copies]); setPositions([...positions,...nextPositions]); setTransitions([...transitions,...copiedTransitions]); const selectedCopy = copies.map((_,i)=>base+i); setSelectedNodes(selectedCopy); setSelected(`state-${base}`); };
  const saveField = () => { if (!fieldDraft?.name.trim()) return; setFields((v) => fieldDraft.id && v.some((f) => f.id === fieldDraft.id) ? v.map((f) => f.id === fieldDraft.id ? { ...fieldDraft, name: fieldDraft.name.trim() } : f) : [...v, { ...fieldDraft, name: fieldDraft.name.trim() }]); setFieldDraft(null); };
  const startFieldDrag = (type: string) => setDragFieldType(type);
  const onDropField = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); const type = e.dataTransfer.getData("application/x-workflow-field") || dragFieldType; if (!type) return; const base = { id: `${type}_${Date.now().toString(36)}`, name: "", description: "", type, required: false }; setFieldDraft(base); setDragFieldType(null); setFieldsDragOver(false); };
  const removeField = (id: string) => setFields((v) => v.filter((f) => f.id !== id));

  useEffect(() => {
    if (step !== 3 || !workflowId) return;
    setConnectionHealthLoading(true);
    void getWorkflowConnectionHealth(workflowId).then(setConnectionHealth).catch(() => setConnectionHealth(null)).finally(() => setConnectionHealthLoading(false));
  }, [step, workflowId]);

  const validation = useMemo(() => { const issues: string[] = []; if (connectionHealth?.issues?.length) connectionHealth.issues.forEach((issue) => issues.push(txt(ar, `${issue.code}: ${issue.message ?? "Connection is unavailable"}`, `${issue.code}: ${issue.message ?? "الاتصال غير متاح"}`))); if (!name.trim()) issues.push(txt(ar,"Workflow name is required.","اسم سير العمل مطلوب.")); if (!states.length) issues.push(txt(ar,"Add at least one state.","أضف حالة واحدة على الأقل.")); if (!states.some((s) => s.terminal)) issues.push(txt(ar,"Add at least one final state.","أضف حالة نهائية واحدة على الأقل.")); if (mode === "AUTOMATIC" && !triggers.length) issues.push(txt(ar,"Select at least one starting trigger.","اختر محفز بداية واحداً على الأقل.")); transitions.forEach((t, i) => { if (t.from === t.to) issues.push(txt(ar,`Transition ${i + 1} cannot point to itself.`,`الانتقال ${i + 1} لا يمكن أن يشير إلى الحالة نفسها.`)); if (!t.name.trim()) issues.push(txt(ar,`Transition ${i + 1} needs a name.`,`الانتقال ${i + 1} يحتاج اسماً.`)); [...t.before, ...t.during, ...t.after].forEach((a) => { if (a.type === "http_request" && !String(a.config.connectionId ?? "").trim()) issues.push(txt(ar,`Transition ${i + 1} has an HTTP action without a connection.`,`الانتقال ${i + 1} يحتوي إجراء HTTP بلا اتصال.`)); if (a.type === "send_email" && !(Array.isArray(a.config.to) ? a.config.to.length : String(a.config.to ?? "").trim())) issues.push(txt(ar,`Transition ${i + 1} has an email action without recipients.`,`الانتقال ${i + 1} يحتوي إجراء بريد إلكتروني بلا مستلمين.`)); if (a.type === "custom_function" && !String(a.config.functionId ?? "").trim()) issues.push(txt(ar,`Transition ${i + 1} has a Custom Function action without a function.`,`الانتقال ${i + 1} يحتوي إجراء Custom Function بلا دالة محددة.`)); }); }); return issues; }, [name, states, transitions, mode, triggers, ar, connectionHealth]);
  const buildPayload = (status: "DRAFT" | "ACTIVE") => ({ name: name.trim(), description: description.trim(), mode, resourceType, trigger: mode === "MANUAL" ? "manual" : triggers, condition: "any", actions: [], status, fields, states, transitions: transitions.map((t) => ({ from: t.from, to: t.to, name: t.name.trim(), description: t.description, trigger: t.execution === "MANUAL" ? "manual" : t.trigger || undefined, condition: t.condition, actions: { before: t.before, during: t.during, after: t.after }, sourceSide: t.sourceSide, targetSide: t.targetSide })) });
  const save = async (status: "DRAFT" | "ACTIVE") => { if (busy) return; setError(""); setMessage(""); if (validation.length && status === "ACTIVE") { setError(validation[0]); setStep(3); return; } if (!name.trim()) { setError(txt(ar,"Workflow name is required.","اسم سير العمل مطلوب.")); setStep(1); return; } setBusy(true); try { const saved = workflowId ? await updateWorkflow(workflowId, buildPayload(status)) : await createWorkflow(buildPayload(status)); setWorkflowId(saved.id); setMessage(status === "ACTIVE" ? txt(ar,"Workflow activated successfully.","تم تفعيل سير العمل بنجاح.") : txt(ar,"Draft saved successfully.","تم حفظ المسودة بنجاح.")); if (status === "ACTIVE") setActivatedId(saved.id); } catch (e) { setError(e instanceof Error ? e.message : txt(ar,"Something went wrong.","حدث خطأ غير متوقع.")); } finally { setBusy(false); } };
  const exportSpec = () => { const blob = new Blob([JSON.stringify(buildPayload("DRAFT"), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name || "workflow"}.json`; a.click(); URL.revokeObjectURL(a.href); };
  const importSpec = async (file: File) => { try { const spec = JSON.parse(await file.text()) as Record<string, unknown>; setName(String(spec.name ?? "Imported workflow")); setDescription(String(spec.description ?? "")); setMode(spec.mode === "MANUAL" ? "MANUAL" : "AUTOMATIC"); setResourceType(spec.resourceType === "FOLDER" ? "FOLDER" : "FILE"); if (Array.isArray(spec.trigger)) setTriggers(spec.trigger.map(String)); if (Array.isArray(spec.fields)) setFields(spec.fields as WorkflowField[]); if (Array.isArray(spec.states)) setStates(spec.states as StateDraft[]); if (Array.isArray(spec.transitions)) setTransitions((spec.transitions as Record<string, unknown>[]).map((t, i) => { const p = normalizePhaseActions(t.actions); return { from: Number(t.from ?? 0), to: Number(t.to ?? 1), name: String(t.name ?? `Transition ${i + 1}`), description: String(t.description ?? ""), trigger: String(t.trigger ?? ""), condition: t.condition ?? "any", execution: t.trigger === "manual" ? "MANUAL" : "AUTOMATIC", sourceSide: t.sourceSide as ConnectionSide | undefined, targetSide: t.targetSide as ConnectionSide | undefined, ...p }; })); setMessage(txt(ar,"Workflow JSON imported as draft.","تم استيراد JSON كسير عمل مسودة.")); } catch { setError(txt(ar,"Invalid workflow JSON file.","ملف JSON لسير العمل غير صالح.")); } };

  if (loading) return <div className="flex h-full items-center justify-center bg-[#F7F9FC] text-[12px] text-slate-500">{txt(ar,"Loading workflow…","جارٍ تحميل سير العمل…")}</div>;
  return <div className="workflow-ui flex h-full min-h-0 flex-col bg-[#F7F9FC]" dir={ar ? "rtl" : "ltr"}>
    <header className="workflow-builder-header shrink-0 bg-white px-5 py-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Link href="/files/workflows" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">←</Link><div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-[.17em] text-[var(--wd-primary)]">{txt(ar,"Workflow builder","منشئ سير العمل")}</div><div className="truncate text-[15px] font-semibold text-slate-900">{name || txt(ar,"Create workflow","إنشاء سير عمل")} <span className="ms-2 text-[10px] font-medium text-slate-500">{mode === "MANUAL" ? txt(ar,"Manual","يدوي") : txt(ar,"Automatic","تلقائي")}</span></div></div></div><div className="flex items-center gap-1.5"><button type="button" onClick={() => setElementsOpen(true)} className="workflow-builder-mobile-menu wd-icon-btn xl:hidden" aria-label={txt(ar,"Open workflow elements","فتح عناصر سير العمل")} title={txt(ar,"Open workflow elements","فتح عناصر سير العمل")}>☰</button><WorkflowHelp compact /><label className="wd-pill wd-pill-record cursor-pointer">{txt(ar,"Import JSON","استيراد JSON")}<input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSpec(f); e.currentTarget.value = ""; }} /></label><button type="button" onClick={exportSpec} className="wd-pill wd-pill-record">{txt(ar,"Export JSON","تصدير JSON")}</button><button type="button" disabled={busy} onClick={() => void save("DRAFT")} className="wd-pill wd-pill-record">{txt(ar,"Save draft","حفظ المسودة")}</button><button type="button" disabled={busy} onClick={() => setActivationOpen(true)} className="wd-pill wd-pill-record">{txt(ar,"Activate","تفعيل")}</button></div></div>
      <div className="mt-3 flex items-center justify-center"><div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">{([[1,"Configure fields"],[2,"Design workflow"],[3,"Review"]] as const).map(([n,en]) => <button key={n} type="button" onClick={() => setStep(n)} className={`workflow-step-tab px-4 py-2 text-[10.5px] font-medium transition ${step === n ? "is-active" : ""}`}><b className="me-1.5">{n}</b>{txt(ar,en,n===1?"إعداد الحقول":n===2?"تصميم سير العمل":"المراجعة")}</button>)}</div></div>
    </header>
    {error && <div className="mx-5 mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10.5px] text-red-700">{error}</div>}{message && <div className="mx-5 mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10.5px] text-emerald-700">{message}</div>}
    <div className="mx-5 mt-2"><WorkflowConceptGuide ar={ar} /></div>
    {!urlId && <div className="mx-5 mt-2 rounded-2xl border border-violet-200 bg-violet-50/60 p-4" dir={ar ? "rtl" : "ltr"}><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-violet-700">{txt(ar,"Starting recipe","نقطة البداية")}</div><div className="mt-1 text-[12px] font-semibold text-violet-950">{recipe === "REVIEW_FILE" ? txt(ar,"File review","مراجعة ملف") : recipe === "NOTIFY_UPLOAD" ? txt(ar,"Notify after upload","إشعار بعد الرفع") : recipe === "EXTERNAL_API" ? txt(ar,"External API","API خارجي") : txt(ar,"Custom Function","Custom Function")}</div><p className="mt-1 text-[9.5px] leading-5 text-violet-800">{recipe === "EXTERNAL_API" ? txt(ar,"تمت إضافة HTTP Request فعلي. اختر Connection نشطاً ثم عدّل Path قبل الحفظ.","A real HTTP Request was added. Select an ACTIVE Connection and update the Path before saving.") : recipe === "CUSTOM_FUNCTION" ? txt(ar,"تمت إضافة Custom Function فعلي. اختر دالة آمنة منشورة قبل التفعيل.","A real Custom Function action was added. Select a published safe function before activation.") : txt(ar,"يمكنك تعديل الحالات والانتقالات والإجراءات بالكامل قبل الحفظ.","You can edit the states, transitions and actions before saving.")}</p></div>}

    {step === 1 && <div className="min-h-0 flex-1 overflow-hidden p-4"><div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="wd-card min-h-0 overflow-y-auto p-4"><div className="mb-4"><h2 className="text-[13px] font-semibold text-slate-900">{txt(ar,"Field types","أنواع الحقول")}</h2><p className="mt-1 text-[10.5px] leading-5 text-slate-500">{txt(ar,"Drag a field into the workspace. A configuration window opens only after you drop it.","اسحب الحقل إلى مساحة العمل. تظهر نافذة الإعداد بعد الإفلات فقط.")}</p></div><div className="space-y-2">{FIELD_TYPES.map(([v,en,arLabel,icon]) => <div key={v} draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-workflow-field", v); e.dataTransfer.effectAllowed = "copy"; startFieldDrag(v); }} onDragEnd={() => setDragFieldType(null)} className="group flex cursor-grab items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--wd-primary)] hover:bg-[#F8FBFF] hover:shadow-sm active:cursor-grabbing"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-500 transition group-hover:bg-[var(--wd-primary-light)] group-hover:text-[var(--wd-primary)]">{icon}</span><span className="min-w-0 flex-1 text-[10.5px] font-medium text-slate-700">{txt(ar,en,arLabel)}</span><span className="text-[12px] text-slate-300 group-hover:text-[var(--wd-primary)]">↗</span></div>)}</div></aside>
      <section className="wd-card min-h-0 overflow-y-auto"><div className="border-b border-slate-100 px-6 py-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-[17px] font-semibold text-slate-900">{txt(ar,"Workflow fields","حقول سير العمل")}</h2><p className="mt-1 max-w-[720px] text-[11px] leading-5 text-slate-500">{txt(ar,"Collect feedback, assignees, approvers and other values while a workflow transition is in progress.","اجمع الملاحظات والمكلفين والموافقين والقيم الأخرى أثناء تنفيذ انتقال في سير العمل.")}</p></div><WorkflowHelp compact /></div></div>
        <div className="grid gap-4 p-6 lg:grid-cols-[1fr_310px]">
          <div onDragOver={(e) => { e.preventDefault(); setFieldsDragOver(true); }} onDragLeave={() => setFieldsDragOver(false)} onDrop={onDropField} className={`min-h-[430px] rounded-2xl border-2 border-dashed p-5 transition ${fieldsDragOver ? "border-[var(--wd-primary)] bg-[#F8FBFF] scale-[1.005]" : "border-slate-200 bg-slate-50/50"}`}>
            {fields.length === 0 ? <div className="flex h-full min-h-[380px] flex-col items-center justify-center text-center"><div className={`flex h-16 w-16 items-center justify-center rounded-2xl transition ${fieldsDragOver ? "bg-[var(--wd-primary-light)] text-[var(--wd-primary)] scale-110" : "bg-white text-slate-300 shadow-sm"}`}>＋</div><h3 className="mt-4 text-[13px] font-semibold text-slate-800">{fieldsDragOver ? txt(ar,"Release to configure the field","أفلت الحقل لبدء إعداده") : txt(ar,"Drop workflow fields here","أسقط حقول سير العمل هنا")}</h3><p className="mt-1 max-w-[360px] text-[10.5px] leading-5 text-slate-500">{txt(ar,"Choose a field type from the palette and drag it here. The editor appears after the drop.","اختر نوع الحقل من القائمة واسحبه إلى هنا. ستظهر نافذة الإعداد بعد الإفلات.")}</p></div> : <div className="space-y-3"><div className="flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{fields.length} {txt(ar,"fields","حقول")}</div><span className="text-[10px] text-slate-400">{txt(ar,"Drop more fields anywhere in this area","يمكنك إفلات المزيد من الحقول في أي مكان هنا")}</span></div>{fields.map((f) => <div key={f.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:shadow-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-600">{FIELD_TYPES.find((x) => x[0] === f.type)?.[3] ?? "□"}</span><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-slate-900">{f.name}</div><div className="mt-0.5 truncate text-[10px] text-slate-500">{txt(ar,FIELD_TYPES.find((x) => x[0] === f.type)?.[1] ?? f.type,FIELD_TYPES.find((x) => x[0] === f.type)?.[2] ?? f.type)}{f.required ? ` · ${txt(ar,"Mandatory","إلزامي")}` : ""}{f.description ? ` · ${f.description}` : ""}</div></div><button type="button" onClick={() => setFieldDraft(f)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] opacity-70 transition group-hover:opacity-100 hover:bg-slate-50">{txt(ar,"Edit","تعديل")}</button><button type="button" onClick={() => removeField(f.id)} className="rounded-lg px-2 py-1.5 text-[10px] text-red-500 opacity-70 transition group-hover:opacity-100 hover:bg-red-50">{txt(ar,"Delete","حذف")}</button></div>)}</div>}
          </div>
          <div className="space-y-4"><div className="wd-card p-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"Workflow details","تفاصيل سير العمل")}</div><label className="mt-3 block text-[10.5px] font-medium text-slate-700">{txt(ar,"Name","الاسم")}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={txt(ar,"e.g. Review uploaded documents","مثال: مراجعة المستندات المرفوعة")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[11px] outline-none focus:border-[var(--wd-primary)]" /></label><label className="mt-3 block text-[10.5px] font-medium text-slate-700">{txt(ar,"Description","الوصف")}<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></label></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"Start mode","طريقة البدء")}</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setMode("AUTOMATIC")} className={`workflow-segment ${mode === "AUTOMATIC" ? "is-active" : ""}`}>{txt(ar,"Automatic","تلقائي")}</button><button type="button" onClick={() => setMode("MANUAL")} className={`workflow-segment ${mode === "MANUAL" ? "is-active" : ""}`}>{txt(ar,"Manual","يدوي")}</button></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setResourceType("FILE")} className={`workflow-segment ${resourceType === "FILE" ? "is-active" : ""}`}>{txt(ar,"File-based","يعتمد على الملفات")}</button><button type="button" onClick={() => setResourceType("FOLDER")} className={`workflow-segment ${resourceType === "FOLDER" ? "is-active" : ""}`}>{txt(ar,"Folder-based","يعتمد على المجلدات")}</button></div></div>
          </div>
        </div>
      </section>
    </div><div className="wd-card mt-3 flex shrink-0 items-center justify-between px-4 py-3"><button type="button" onClick={() => router.push("/files/workflows")} className="wd-pill wd-pill-record">{txt(ar,"Back","رجوع")}</button><button type="button" onClick={() => setStep(2)} className="wd-pill wd-pill-new">{txt(ar,"Continue to design","متابعة إلى التصميم")} →</button></div></div>}

    {step === 2 && <div className="relative min-h-0 flex-1 overflow-hidden p-3"><button type="button" onClick={() => setElementsOpen(true)} className="workflow-mobile-elements-toggle wd-pill wd-pill-record absolute start-5 top-5 z-[80] xl:hidden">☰ {txt(ar,"Elements","العناصر")}</button><div className="wd-card flex h-full min-h-0 overflow-hidden"><div className="hidden w-[210px] shrink-0 border-e border-slate-200 bg-white xl:flex xl:flex-col" dir={ar ? "rtl" : "ltr"}><div className="border-b border-slate-100 p-4"><div className="flex items-center justify-between"><div><div className="text-[12px] font-semibold text-slate-900">{txt(ar,"Elements","العناصر")}</div><div className="mt-0.5 text-[9.5px] text-slate-500">{txt(ar,"Build your state machine","ابنِ منطق الحالات")}</div></div><WorkflowHelp compact /></div></div><div className="space-y-2 overflow-y-auto p-3"><button type="button" onClick={() => setStep(1)} className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-start hover:border-[var(--wd-primary)] hover:bg-[#F8FBFF]"><div className="text-[10px] font-semibold text-slate-800">＋ {txt(ar,"Workflow fields","حقول سير العمل")}</div><div className="mt-1 text-[9px] leading-4 text-slate-500">{fields.length} {txt(ar,"configured","مُعدّة")}</div></button><button type="button" onClick={() => addState()} className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-start hover:border-[var(--wd-primary)] hover:bg-[#F8FBFF]"><div className="text-[10px] font-semibold text-slate-800">＋ {txt(ar,"State","حالة")}</div><div className="mt-1 text-[9px] text-slate-500">{states.length}/20</div></button><button type="button" onClick={() => addTransitionFrom()} className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-start hover:border-[var(--wd-primary)] hover:bg-[#F8FBFF]"><div className="text-[10px] font-semibold text-slate-800">＋ {txt(ar,"Transition","انتقال")}</div><div className="mt-1 text-[9px] text-slate-500">{transitions.length}</div></button><div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"Starting trigger","محفز البداية")}</div><div className="mt-2 space-y-1.5">{mode === "MANUAL" ? <div className="rounded-lg bg-white px-2.5 py-2 text-[9.5px] text-slate-600">{txt(ar,"Manual start","بدء يدوي")}</div> : TRIGGERS.map(([v,en,arLabel]) => <label key={v} className="flex items-center gap-2 text-[9.5px] text-slate-600"><input type="checkbox" checked={triggers.includes(v)} onChange={(e) => setTriggers((old) => e.target.checked ? [...new Set([...old,v])] : old.filter((x) => x !== v))} className="accent-[var(--wd-primary)]" />{txt(ar,en,arLabel)}</label>)}</div></div></div></div><div className="min-w-0 flex-1"><WorkflowCanvas states={states} transitions={transitions} positions={positions} setPositions={setPositions} selected={selected} onSelect={setSelected} selectedNodes={selectedNodes} onSelectNodes={setSelectedNodes} onAddTransition={addTransitionFrom} onConnect={connectStates} onDeleteTransition={removeTransition} onAddStateAt={addStateAt} onAddNodeTemplate={addNodeTemplate} onDeleteStates={removeStates} onDuplicateStates={duplicateStates} onAutoLayout={autoLayout} onHistoryStart={markHistory} onPasteClipboard={pasteClipboard} onUndo={undoGraph} onRedo={redoGraph} canUndo={historyRef.current.length>0} canRedo={redoRef.current.length>0} zoom={zoom} setZoom={setZoom} ar={ar} /></div><aside className="w-[350px] shrink-0 overflow-y-auto border-s border-slate-200 bg-white" dir={ar ? "rtl" : "ltr"}><div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur"><div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-slate-400">{selectedTransition ? txt(ar,"Transition","انتقال") : txt(ar,"State","حالة")}</div><div className="mt-1 text-[14px] font-semibold text-slate-900">{selectedTransition ? selectedTransition.name : states[selectedStateIndex]?.name}</div></div><div className="flex items-center gap-1">{selectedTransition && <button type="button" onClick={() => removeTransition(selectedTransitionIndex)} className="rounded-lg px-2 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50">{txt(ar,"Delete","حذف")}</button>}<WorkflowHelp compact helpKey={selectedTransition ? "workflow.transition" : "workflow.state"} /></div></div><div className="space-y-4 p-5">
      {selectedStateIndex >= 0 && <><label className="block text-[10.5px] font-medium text-slate-600">{txt(ar,"State name","اسم الحالة")}<input value={states[selectedStateIndex]?.name ?? ""} onChange={(e) => setStates((v) => v.map((s,i)=>i===selectedStateIndex?{...s,name:e.target.value}:s))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></label><label className="block text-[10.5px] font-medium text-slate-600">{txt(ar,"Description","الوصف")}<textarea value={states[selectedStateIndex]?.description ?? ""} onChange={(e) => setStates((v) => v.map((s,i)=>i===selectedStateIndex?{...s,description:e.target.value}:s))} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></label><label className="flex items-center gap-2 text-[10.5px] text-slate-600"><input type="checkbox" checked={states[selectedStateIndex]?.terminal ?? false} onChange={(e) => setStates((v) => v.map((s,i)=>i===selectedStateIndex?{...s,terminal:e.target.checked}:s))} className="accent-[var(--wd-primary)]" />{txt(ar,"Final state","حالة نهائية")}</label>{selectedStateIndex > 0 && <button type="button" onClick={() => removeState(selectedStateIndex)} className="w-full rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[10px] font-medium text-red-600">{txt(ar,"Delete state","حذف الحالة")}</button>}</>}
      {selectedTransition && <><label className="block text-[10.5px] font-medium text-slate-600">{txt(ar,"Transition name","اسم الانتقال")}<input value={selectedTransition.name} onChange={(e) => updateTransition(selectedTransitionIndex,{name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></label><label className="block text-[10.5px] font-medium text-slate-600">{txt(ar,"Description","الوصف")}<textarea value={selectedTransition.description} onChange={(e) => updateTransition(selectedTransitionIndex,{description:e.target.value})} rows={2} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[11px]" /></label><div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"><label className="min-w-0 text-[10px] font-medium text-slate-600">{txt(ar,"From","من")}<select value={selectedTransition.from} onChange={(e)=>updateTransition(selectedTransitionIndex,{from:Number(e.target.value)})} className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-[10.5px]">{states.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label><label className="min-w-0 text-[10px] font-medium text-slate-600">{txt(ar,"To","إلى")}<select value={selectedTransition.to} onChange={(e)=>updateTransition(selectedTransitionIndex,{to:Number(e.target.value)})} className="mt-1 w-full rounded-xl border border-slate-200 px-2.5 py-2 text-[10.5px]">{states.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-semibold text-slate-700">{txt(ar,"Execution","التنفيذ")}</div><div className="mt-2 grid grid-cols-2 gap-1.5"><button type="button" onClick={()=>updateTransition(selectedTransitionIndex,{execution:"AUTOMATIC"})} className={`workflow-segment ${selectedTransition.execution==="AUTOMATIC" ? "is-active" : ""}`}>{txt(ar,"Automatic","تلقائي")}</button><button type="button" onClick={()=>updateTransition(selectedTransitionIndex,{execution:"MANUAL"})} className={`workflow-segment ${selectedTransition.execution==="MANUAL" ? "is-active" : ""}`}>{txt(ar,"Manual","يدوي")}</button></div></div>{selectedTransition.execution === "AUTOMATIC" && <label className="block min-w-0 text-[10.5px] font-medium text-slate-600">{txt(ar,"Trigger","المحفز")}<select value={selectedTransition.trigger} onChange={(e)=>updateTransition(selectedTransitionIndex,{trigger:e.target.value})} className="mt-1.5 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10.5px]"><option value="">{txt(ar,"Any matching event","أي حدث مطابق")}</option>{TRIGGERS.map(([v,en,arLabel])=><option key={v} value={v}>{txt(ar,en,arLabel)}</option>)}</select></label>}<ConditionEditor condition={selectedTransition.condition} ar={ar} onChange={(condition) => updateTransition(selectedTransitionIndex, { condition })} /><div className="border-t border-slate-100 pt-4"><div className="workflow-phase-tabs flex bg-slate-100 p-1">{(["before","during","after"] as Phase[]).map((p)=><button type="button" key={p} onClick={()=>setPhase(p)} className={`workflow-segment flex-1 ${phase===p ? "is-active" : ""}`}>{txt(ar,p,p==="before"?"قبل":p==="during"?"أثناء":"بعد")}</button>)}</div><p className="mt-2.5 text-[9.5px] leading-5 text-slate-500">{phase==="before"?txt(ar,"Runs before the resource changes state.","يُنفذ قبل تغيير حالة المورد."):phase==="during"?txt(ar,"Collect input or perform actions while the transition is active.","اجمع المدخلات أو نفذ الإجراءات أثناء الانتقال."):txt(ar,"Runs after the resource reaches the next state.","يُنفذ بعد وصول المورد إلى الحالة التالية.")}</p><div className="mt-3"><ActionEditor actions={selectedTransition[phase]} onChange={(next)=>updateTransition(selectedTransitionIndex,{[phase]:next} as Partial<TransitionDraft>)} resourceType={resourceType} ar={ar} workflowFields={fields}/></div></div></>}
      {!selectedTransition && selectedStateIndex < 0 && <div className="rounded-xl bg-slate-50 p-4 text-[10.5px] text-slate-500">{txt(ar,"Select a state or transition on the canvas to configure it.","اختر حالة أو انتقالاً من اللوحة لتعديله.")}</div>}
    </div></aside></div><div className="wd-card mt-3 flex shrink-0 items-center justify-between px-4 py-3"><button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-2 text-[10.5px] text-slate-600">{txt(ar,"Back","رجوع")}</button><button type="button" onClick={() => setStep(3)} className="rounded-xl bg-[var(--wd-primary)] px-5 py-2 text-[10.5px] font-semibold text-white">{txt(ar,"Continue to review","متابعة إلى المراجعة")} →</button></div></div>}

    {step === 2 && elementsOpen && <div className="fixed inset-0 z-[220] bg-slate-950/25 xl:hidden" onClick={() => setElementsOpen(false)}><aside className="absolute inset-y-0 start-0 w-[min(320px,88vw)] overflow-y-auto border-e border-slate-200 bg-white p-4 shadow-2xl" dir={ar?"rtl":"ltr"} onClick={(e)=>e.stopPropagation()}><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><div className="text-[12px] font-semibold text-slate-900">{txt(ar,"Elements","العناصر")}</div><div className="mt-0.5 text-[9.5px] text-slate-500">{txt(ar,"Build your workflow","ابنِ سير العمل")}</div></div><button type="button" onClick={()=>setElementsOpen(false)} className="wd-icon-btn">×</button></div><div className="mt-3 space-y-2"><button type="button" onClick={()=>{setStep(1);setElementsOpen(false)}} className="w-full workflow-segment text-start hover:bg-slate-50">＋ {txt(ar,"Workflow fields","حقول سير العمل")}</button><button type="button" onClick={()=>{addState();setElementsOpen(false)}} className="w-full workflow-segment text-start hover:bg-slate-50">＋ {txt(ar,"State","حالة")}</button><button type="button" onClick={()=>{addTransitionFrom();setElementsOpen(false)}} className="w-full workflow-segment text-start hover:bg-slate-50">＋ {txt(ar,"Transition","انتقال")}</button><div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">{txt(ar,"Starting triggers","محفزات البداية")}</div><div className="mt-2 space-y-1.5">{mode === "MANUAL" ? <div className="rounded-lg bg-white px-2.5 py-2 text-[9.5px] text-slate-600">{txt(ar,"Manual start","بدء يدوي")}</div> : TRIGGERS.map(([v,en,arLabel])=><label key={v} className="flex items-center gap-2 text-[9.5px] text-slate-600"><input type="checkbox" checked={triggers.includes(v)} onChange={(e)=>setTriggers((old)=>e.target.checked?[...new Set([...old,v])]:old.filter((x)=>x!==v))} className="accent-[var(--wd-primary)]" />{txt(ar,en,arLabel)}</label>)}</div></div></div></aside></div>}

    {step === 3 && <div className="min-h-0 flex-1 overflow-y-auto p-5" dir={ar ? "rtl" : "ltr"}><div className="wd-card mx-auto max-w-[1000px] p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[var(--wd-primary)]">{txt(ar,"Final review","المراجعة النهائية")}</div><h2 className="mt-1 text-[20px] font-semibold text-slate-900">{txt(ar,"Review workflow","مراجعة سير العمل")}</h2><p className="mt-1 text-[11px] text-slate-500">{txt(ar,"Check the connections and configuration before activation.","تحقق من الاتصالات والإعدادات قبل التفعيل.")}</p></div><WorkflowHelp /></div><div className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-slate-200 p-4"><div className="text-[9px] uppercase tracking-[.14em] text-slate-400">{txt(ar,"Workflow","سير العمل")}</div><div className="mt-1 text-[13px] font-semibold">{name || txt(ar,"Untitled","بلا اسم")}</div><div className="mt-1 text-[10px] text-slate-500">{mode === "MANUAL" ? txt(ar,"Manual","يدوي") : txt(ar,"Automatic","تلقائي")} · {resourceType === "FILE" ? txt(ar,"File-based","ملفات") : txt(ar,"Folder-based","مجلدات")}</div></div><div className="rounded-xl border border-slate-200 p-4"><div className="text-[9px] uppercase tracking-[.14em] text-slate-400">{txt(ar,"Structure","البنية")}</div><div className="mt-1 text-[13px] font-semibold">{states.length} {txt(ar,"states","حالات")} · {transitions.length} {txt(ar,"transitions","انتقالات")}</div><div className="mt-1 text-[10px] text-slate-500">{fields.length} {txt(ar,"custom fields","حقول مخصصة")}</div></div><div className={`rounded-xl border p-4 ${validation.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div className="text-[9px] uppercase tracking-[.14em] text-slate-500">{txt(ar,"Status","الحالة")}</div><div className="mt-1 text-[13px] font-semibold">{validation.length ? `${validation.length} ${txt(ar,"issues","مشكلات")}` : txt(ar,"Ready to activate","جاهز للتفعيل")}</div></div></div><div className="mt-5 rounded-xl border border-slate-200">
<div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="text-[11px] font-semibold">{txt(ar,"Connection health","حالة الاتصالات")}</div><span className={`rounded-full px-2 py-1 text-[8.5px] font-semibold ${connectionHealthLoading ? "bg-slate-100 text-slate-500" : connectionHealth?.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{connectionHealthLoading ? txt(ar,"Checking…","جارٍ الفحص…") : connectionHealth?.ready ? txt(ar,"Ready","جاهزة") : txt(ar,"Action required","تحتاج إجراء")}</span></div>
{connectionHealth?.connections?.length ? <div className="divide-y divide-slate-100">{connectionHealth.connections.map((c)=><div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><div className="text-[10.5px] font-medium text-slate-800">{c.name || c.id}</div><div className="mt-0.5 text-[9px] text-slate-400">{c.provider || c.authType || "Connection"}</div></div><div className={`text-[9px] font-semibold ${c.ready ? "text-emerald-700" : "text-red-600"}`}>{c.ready ? txt(ar,"Active","نشط") : (c.status || txt(ar,"Unavailable","غير متاح"))}</div></div>)}</div> : <div className="px-4 py-4 text-[10px] text-slate-500">{txt(ar,"No external connections are used by this workflow.","لا يستخدم سير العمل هذا أي اتصالات خارجية.")}</div>}</div>
<div className="mt-5 rounded-xl border border-slate-200"><div className="border-b border-slate-100 px-4 py-3 text-[11px] font-semibold">{txt(ar,"Validation","التحقق")}</div>{validation.length ? <div className="divide-y divide-slate-100">{validation.map((x,i)=><div key={i} className="flex gap-2 px-4 py-3 text-[10.5px] text-amber-700"><span>!</span>{x}</div>)}</div> : <div className="flex items-center gap-2 px-4 py-5 text-[10.5px] text-emerald-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">✓</span>{txt(ar,"All required checks passed. The workflow is ready for activation.","اجتازت جميع الفحوصات المطلوبة. سير العمل جاهز للتفعيل.")}</div>}</div><div className="mt-5 rounded-xl bg-[#F7FAFF] p-4 text-[10.5px] leading-5 text-slate-600">{txt(ar,"Automatic workflows react to configured file/folder events. Manual workflows become available from the file actions menu and create a waiting task when a manual transition is reached.","تستجيب سير العمل التلقائية لأحداث الملفات والمجلدات المحددة. أما سير العمل اليدوية فتظهر ضمن قائمة إجراءات الملف وتنشئ مهمة انتظار عند الوصول إلى انتقال يدوي." )}</div><div className="mt-6 flex justify-between"><button type="button" onClick={() => setStep(2)} className="wd-pill wd-pill-record">{txt(ar,"Back to design","العودة إلى التصميم")}</button><button type="button" disabled={busy || validation.length > 0} onClick={() => setActivationOpen(true)} className="wd-pill wd-pill-new disabled:opacity-40">{txt(ar,"Activate workflow","تفعيل سير العمل")}</button></div></div></div>}

    {activatedId && <div className="mx-5 mb-4"><WorkflowNextSteps ar={ar} workflowId={activatedId} recipe={recipe} /></div>}

    {fieldDraft && <FieldEditor draft={fieldDraft} ar={ar} onChange={setFieldDraft} onCancel={() => setFieldDraft(null)} onSave={saveField} />}
    {activationOpen && <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/40 p-4"><div className="w-[min(560px,94vw)] rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl" dir={ar ? "rtl" : "ltr"}><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--wd-primary-light)] text-[var(--wd-primary)]">✓</div><div><h2 className="text-[18px] font-semibold text-slate-900">{txt(ar,"Activate workflow?","تفعيل سير العمل؟")}</h2><p className="mt-2 text-[11px] leading-5 text-slate-600">{txt(ar,`You are about to activate “${name || "new workflow"}”.`,`أنت على وشك تفعيل «${name || "سير عمل جديد"}».`)}</p></div></div>{validation.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] text-amber-800">{validation[0]}</div> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setActivationOpen(false)} className="wd-pill wd-pill-record">{txt(ar,"Cancel","إلغاء")}</button><button type="button" disabled={busy || validation.length > 0} onClick={() => { setActivationOpen(false); void save("ACTIVE"); }} className="wd-pill wd-pill-new disabled:opacity-40">{txt(ar,"Activate","تفعيل")}</button></div></div></div>}
  </div>;
}
