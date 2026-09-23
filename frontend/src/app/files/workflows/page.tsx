"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkflowShell } from "@/components/workflow-shell";
import { WorkflowHelp } from "@/components/workflow-help";
import { WorkflowConceptGuide, WorkflowRecipePicker, type WorkflowRecipe } from "@/components/workflow-concept-guide";
import { useLocale } from "@/components/locale-provider";
import { activateWorkflow, deactivateWorkflow, deleteWorkflow, duplicateWorkflow, listWorkflows, updateWorkflow, type Workflow } from "@/lib/api/workflows";
import { Icons } from "@/components/layout/icons";
import { useWorkflowAccess } from "@/components/workflow-access";

type CreateMode = "MANUAL" | "AUTOMATIC";
type ResourceType = "FILE" | "FOLDER";

export default function WorkflowsPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const access = useWorkflowAccess();

  const [createOpen, setCreateOpen] = useState(false);
  const [rows, setRows] = useState<Workflow[]>([]);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<CreateMode>("MANUAL");
  const [resourceType, setResourceType] = useState<ResourceType>("FILE");
  const [draftName, setDraftName] = useState("new workflow");
  const [draftDescription, setDraftDescription] = useState("");
  const [recipe, setRecipe] = useState<WorkflowRecipe>("REVIEW_FILE");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const load = () => void listWorkflows(scope === "all" ? undefined : scope).then(setRows).catch(() => setRows([]));
  useEffect(load, [scope]);

  const visible = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  const openBuilder = () => {
    if (!access?.canCreate) return;
    const qs = new URLSearchParams({
      name: draftName.trim() || (ar ? "سير عمل جديد" : "new workflow"),
      mode,
      resourceType,
    });
    if (draftDescription.trim()) qs.set("description", draftDescription.trim());
    qs.set("recipe", recipe);
    router.push(`/files/workflows/builder?${qs.toString()}`);
    setCreateOpen(false);
  };

  const toggle = async (r: Workflow) => {
    setBusy(r.id);
    try {
      const next = r.status === "ACTIVE" ? await deactivateWorkflow(r.id) : await activateWorkflow(r.id);
      setRows((all) => all.map((x) => x.id === r.id ? { ...x, ...next } : x));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: Workflow) => {
    if (!window.confirm(ar ? "حذف سير العمل هذا؟" : "Delete this workflow?")) return;
    setBusy(r.id);
    try {
      await deleteWorkflow(r.id);
      setRows((all) => all.filter((x) => x.id !== r.id));
    } finally {
      setBusy(null);
      setMenuOpen(null);
    }
  };

  const duplicate = async (r: Workflow) => {
    setBusy(r.id);
    try {
      const copy = await duplicateWorkflow(r.id);
      setRows((all) => [copy, ...all]);
    } finally {
      setBusy(null);
      setMenuOpen(null);
    }
  };

  const startEdit = (r: Workflow) => {
    setEditing(r);
    setEditName(r.name);
    setEditDescription(String((r as Workflow & { description?: string | null }).description ?? ""));
    setMenuOpen(null);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim() || editing.status === "ACTIVE") return;
    setBusy(editing.id);
    try {
      const valueOf = (kind: string) => editing.steps?.find((s) => s.kind === kind)?.config?.value;
      const triggerValue = valueOf("TRIGGER");
      const conditionValue = valueOf("CONDITION") ?? "any";
      const fieldsValue = valueOf("WORKFLOW_FIELDS");
      const actionsValue = valueOf("ACTIONS");
      const payload = {
        name: editName.trim(),
        description: editDescription.trim(),
        mode: editing.mode,
        resourceType: editing.resourceType,
        trigger: triggerValue ?? (editing.mode === "MANUAL" ? "manual" : []),
        condition: conditionValue,
        actions: Array.isArray(actionsValue) ? actionsValue : [],
        status: "DRAFT",
        fields: Array.isArray(fieldsValue) ? fieldsValue : [],
        states: (editing.states ?? []).map((s) => ({ name: s.name, description: s.description ?? "", terminal: s.terminal })),
        transitions: (editing.transitions ?? []).map((t) => {
          const phaseActions = t.actions && typeof t.actions === "object" && !Array.isArray(t.actions)
            ? t.actions as Record<string, unknown>
            : { during: t.actions ?? [] };
          return {
            from: editing.states.findIndex((s) => s.id === t.fromStateId),
            to: editing.states.findIndex((s) => s.id === t.toStateId),
            name: t.name,
            description: t.description ?? "",
            trigger: t.trigger ?? undefined,
            condition: t.condition ?? "any",
            actions: {
              before: Array.isArray(phaseActions.before) ? phaseActions.before : [],
              during: Array.isArray(phaseActions.during) ? phaseActions.during : [],
              after: Array.isArray(phaseActions.after) ? phaseActions.after : [],
            },
          };
        }),
        calendarConfig: editing.calendarConfig ?? {},
      };
      const updated = await updateWorkflow(editing.id, payload);
      setRows((all) => all.map((x) => x.id === editing.id ? { ...x, ...updated } : x));
      setEditing(null);
    } finally {
      setBusy(null);
    }
  };

  return <WorkflowShell
    active={scope === "mine" ? "mine" : scope === "drafts" ? "drafts" : "all"}
    title={ar ? "سير العمل" : "Workflows"}
    subtitle={ar ? "أنشئ عمليات تلقائية ويدوية مرتبطة فعلياً بالملفات والمجلدات." : "Create automatic and manual processes connected to files and folders."}
  >
    <main className="h-full overflow-y-auto bg-white px-5 py-4 sm:px-6" dir={ar ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-[300px] max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Icons.search size={15} className="text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "البحث باسم سير العمل" : "Search by workflow name"} className="min-w-0 flex-1 text-[11px] outline-none" />
            </div>
            <WorkflowHelp compact helpKey="workflow.list" />
          </div>
          {access?.canCreate ? <button type="button" onClick={() => setCreateOpen(true)} className="wd-pill wd-pill-new">＋ {ar ? "سير عمل جديد" : "New workflow"}</button> : null}
        </div>

        <div className="mt-4"><WorkflowConceptGuide ar={ar} /></div>

        <div className="workflow-info-banner mt-5">
          <div className="workflow-info-icon"><Icons.info size={16} /></div>
          <div>
            <div className="text-[12px] font-semibold text-slate-900">{ar ? "مساحة أتمتة العمليات" : "Workflow automation"}</div>
            <p className="mt-1 max-w-[900px] text-[10.5px] leading-5 text-slate-500">
              {ar ? "اربط الأحداث بالحالات والانتقالات والإجراءات. كل انتقال يحرك حالة التشغيل الفعلية ويظهر المهام المنتظرة وسجل التنفيذ." : "Connect events to states, transitions and actions. Every transition changes the real runtime state and feeds waiting tasks and run history."}
            </p>
          </div>
        </div>

        <div className="workflow-table-shell mt-5">
          <div className="workflow-table-head">
            <span>{ar ? "الاسم" : "Name"}</span>
            <span>{ar ? "النوع" : "Type"}</span>
            <span>{ar ? "آخر تعديل" : "Last modified"}</span>
            <span>{ar ? "السجلات النشطة" : "Active records"}</span>
            <span>{ar ? "الحالة" : "Status"}</span>
            <span aria-hidden="true" />
          </div>

          {visible.length === 0 ? (
            <div className="px-5 py-14 text-center text-[11px] text-slate-400">{ar ? "لا توجد سير عمل مطابقة." : "No workflows found."}</div>
          ) : visible.map((r) => (
            <div key={r.id} className="workflow-table-row">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="workflow-row-icon"><Icons.flow size={17} /></span>
                  {(access?.canManageWorkflows || (r.status === "DRAFT" && access?.canEditOwnedDrafts))
                    ? <Link href={`/files/workflows/builder?id=${r.id}`} className="min-w-0 truncate text-[12px] font-semibold text-slate-900 hover:text-[var(--wd-primary)]">{r.name}</Link>
                    : <span className="min-w-0 truncate text-[12px] font-semibold text-slate-900">{r.name}</span>}
                  {r.status === "ACTIVE" && <span className="workflow-status-badge">{ar ? "فعال" : "Active"}</span>}
                  {r.status === "DRAFT" && <span className="workflow-draft-badge">{ar ? "مسودة" : "Draft"}</span>}
                </div>
                <div className="mt-1 ps-10 text-[9.5px] text-slate-400">{ar ? "أنشأته أنت" : "Created by you"} · {new Date(r.createdAt).toLocaleString()}</div>
              </div>

              <span className="text-[10.5px] text-slate-600">{r.resourceType === "FOLDER" ? (ar ? "مجلدات" : "Folder-based") : (ar ? "ملفات" : "File-based")}</span>
              <span className="text-[10.5px] text-slate-500">{new Date(r.updatedAt).toLocaleString()}</span>
              <span className="text-[10.5px] text-emerald-600">0</span>

              <div>
                {access?.canManageWorkflows ? (
                  <button type="button" disabled={busy === r.id} onClick={() => void toggle(r)} className={`workflow-status-toggle ${r.status === "ACTIVE" ? "is-on" : ""}`} aria-label={r.status === "ACTIVE" ? (ar ? "تعطيل" : "Deactivate") : (ar ? "تفعيل" : "Activate")}>
                    <span />
                  </button>
                ) : <span className="text-[9px] text-slate-400">{r.status === "ACTIVE" ? (ar ? "متاح" : "Available") : (ar ? "مسودة" : "Draft")}</span>}
              </div>

              <div className="relative flex justify-end">
                {access?.canManageWorkflows ? <>
                  <button type="button" className="workflow-row-menu-button" aria-label={ar ? "المزيد" : "More"} aria-expanded={menuOpen === r.id} onClick={() => setMenuOpen(menuOpen === r.id ? null : r.id)}><Icons.dots size={18} /></button>
                  {menuOpen === r.id && <div className="workflow-row-menu">
                    <button type="button" onClick={() => startEdit(r)}><Icons.pencil size={14} />{ar ? "تعديل الاسم والوصف" : "Edit name & description"}</button>
                    <button type="button" onClick={() => { setMenuOpen(null); router.push(`/files/workflows/builder?id=${r.id}`); }}><Icons.eye size={14} />{ar ? "عرض سير العمل" : "View workflow"}</button>
                    <button type="button" onClick={() => { setMenuOpen(null); router.push(`/files/workflows/runs?workflowId=${encodeURIComponent(r.id)}`); }}><Icons.history size={14} />{ar ? "تتبع سير العمل" : "Track workflow"}</button>
                    <button type="button" onClick={() => void duplicate(r)}><Icons.copy size={14} />{ar ? "نسخ سير العمل" : "Clone workflow"}</button>
                    <button type="button" data-danger="true" onClick={() => void remove(r)}><Icons.trash size={14} />{ar ? "حذف" : "Delete"}</button>
                  </div>}
                </> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>

    {createOpen && <div className="workflow-modal-backdrop" dir={ar ? "rtl" : "ltr"}>
      <div className="workflow-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-workflow-title">
        <div className="workflow-create-header">
          <div>
            <h2 id="create-workflow-title">{ar ? "إنشاء سير عمل" : "Create Workflow"}</h2>
          </div>
          <button type="button" className="workflow-modal-close" onClick={() => setCreateOpen(false)} aria-label={ar ? "إغلاق" : "Close"}><Icons.x size={18} /></button>
        </div>

        <div className="workflow-create-body">
          <div className="workflow-mode-switch">
            <button type="button" onClick={() => setMode("MANUAL")} className={mode === "MANUAL" ? "is-active" : ""}>{ar ? "يدوي" : "Manual"}</button>
            <button type="button" onClick={() => setMode("AUTOMATIC")} className={mode === "AUTOMATIC" ? "is-active" : ""}>{ar ? "تلقائي" : "Automatic"}</button>
          </div>
          <p className="workflow-create-help">
            {mode === "MANUAL"
              ? (ar ? "يجب بدء سير العمل يدوياً من ملف أو مجلد." : "This workflow must be started manually from a file/folder.")
              : (ar ? "يبدأ سير العمل تلقائياً عند حدوث حدث مطابق." : "This workflow starts automatically when a matching event occurs.")}
            {" "}
            <Link href="/files/workflows/builder" className="text-[var(--wd-primary)] hover:underline">{ar ? "تعرف على إنشاء سير عمل مخصص" : "Learn more about creating a custom workflow"}</Link>
          </p>

          <label className="workflow-form-field">
            <span>{ar ? "الاسم" : "Name"}</span>
            <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={ar ? "أدخل اسم سير العمل" : "Enter a workflow name. Eg: Design Review"} />
          </label>

          <label className="workflow-form-field">
            <span>{ar ? "الوصف" : "Description"} <em>({ar ? "اختياري" : "Optional"})</em></span>
            <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} placeholder={ar ? "أضف وصفاً قصيراً عن سير العمل" : "Add a short description about the workflow"} rows={2} />
          </label>

          <div className="workflow-type-label">{ar ? "النوع" : "Type"}</div>
          <div className="workflow-type-grid">
            <button type="button" onClick={() => setResourceType("FILE")} className={`workflow-type-card ${resourceType === "FILE" ? "is-active" : ""}`}>
              <span className="workflow-radio" />
              <div><strong>{ar ? "ملفات" : "File-based"}</strong><p>{ar ? "أتمتة الأحداث المرتبطة بالملفات." : "Automate file-based events."}</p><small>{ar ? "مثال: إرسال ملف للمراجعة، طلب تغييرات، وحفظ نسخة بعد الموافقة." : "E.g., start a workflow to send a file for review, request changes, and save a copy once approved."}</small></div>
            </button>
            <button type="button" onClick={() => setResourceType("FOLDER")} className={`workflow-type-card ${resourceType === "FOLDER" ? "is-active" : ""}`}>
              <span className="workflow-radio" />
              <div><strong>{ar ? "مجلدات" : "Folder-based"}</strong><p>{ar ? "أتمتة الأحداث المرتبطة بالمجلدات." : "Automate folder-based events."}</p><small>{ar ? "مثال: إنشاء هيكل مجلدات أو إرسال المجلد للمراجعة والموافقة." : "E.g., create a folder hierarchy or send it for review and approval."}</small></div>
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <WorkflowRecipePicker ar={ar} value={recipe} onChange={setRecipe} />
          </div>
        </div>

        <div className="workflow-create-footer">
          <button type="button" onClick={() => setCreateOpen(false)} className="wd-pill wd-pill-record">{ar ? "إلغاء" : "Cancel"}</button>
          <button type="button" onClick={openBuilder} className="wd-pill wd-pill-new">{ar ? "إنشاء" : "Create"}</button>
        </div>
      </div>
    </div>}

    {editing && <div className="workflow-modal-backdrop" dir={ar ? "rtl" : "ltr"}>
      <div className="workflow-edit-modal" role="dialog" aria-modal="true">
        <div className="workflow-create-header">
          <div><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--wd-primary)]">{ar ? "سير العمل" : "Workflow"}</div><h2>{ar ? "تعديل الاسم والوصف" : "Edit name & description"}</h2></div>
          <button type="button" className="workflow-modal-close" onClick={() => setEditing(null)} aria-label={ar ? "إغلاق" : "Close"}><Icons.x size={18} /></button>
        </div>
        <div className="workflow-create-body">
          <label className="workflow-form-field"><span>{ar ? "الاسم" : "Name"}</span><input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} disabled={editing.status === "ACTIVE"} /></label>
          <label className="workflow-form-field"><span>{ar ? "الوصف" : "Description"} <em>({ar ? "اختياري" : "Optional"})</em></span><textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} disabled={editing.status === "ACTIVE"} /></label>
          {editing.status === "ACTIVE" && <p className="mt-3 text-[9.5px] text-amber-700">{ar ? "سير العمل النشط منشور كنسخة ثابتة. عطّله أولاً قبل تعديل الاسم أو الوصف." : "Active workflows are published as immutable versions. Deactivate it before editing the name or description."}</p>}
        </div>
        <div className="workflow-create-footer">
          <button type="button" onClick={() => setEditing(null)} className="wd-pill wd-pill-record">{ar ? "إلغاء" : "Cancel"}</button>
          <button type="button" disabled={!editName.trim() || busy === editing.id || editing.status === "ACTIVE"} onClick={() => void saveEdit()} className="wd-pill wd-pill-new">{editing.status === "ACTIVE" ? (ar ? "عطّل أولاً" : "Deactivate first") : (ar ? "حفظ" : "Save")}</button>
        </div>
      </div>
    </div>}
  </WorkflowShell>;
}
