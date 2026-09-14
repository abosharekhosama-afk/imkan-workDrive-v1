"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { createWorkflow, getWorkflow, updateWorkflow, type Workflow, type WorkflowAction, type WorkflowTransition } from "@/lib/api/workflows";

const BLUE = "#2f6fed";
const GREEN = "#0b8f4d";
const FIELD_TYPES = ["Single line text", "Multi line text", "Number", "Date & time", "Date", "Yes/No", "Choice", "Email"] as const;
const TRIGGERS = [
  ["upload", "File uploaded"], ["create", "File/folder created"], ["move", "File/folder moved"], ["copy", "File/folder copied"],
  ["rename", "File renamed"], ["delete", "File moved to trash"], ["properties_updated", "Properties updated"], ["ready", "File marked as ready"],
] as const;
const ACTIONS = [
  ["notify", "Notify"], ["move", "Move"], ["copy", "Copy"], ["generate_link", "Generate link"], ["share", "Share"],
  ["request_approval", "Request approval"], ["favorite", "Add to favorites"], ["tag", "Add tag"], ["mark_final", "Mark as final"], ["create_folder", "Create folder"],
] as const;

type Action = WorkflowAction & { phase?: "before" | "during" | "after" };
type StateDraft = { id?: string; name: string; description: string; terminal: boolean };
type NodePoint = { x: number; y: number };
type FieldDraft = { id: string; name: string; description?: string; type: string; required: boolean; maxCharacters?: number; defaultValue?: string; options?: string[] };
type TransitionDraft = { id?: string; from: number; to: number; name: string; description: string; trigger: "automatic" | "manual"; condition: unknown; actions: Action[]; completion: "continue" | "wait" | "complete" };
type StartConfig = { name: string; description: string; trigger: "automatic" | "manual"; to: number; condition: unknown };

const uid = () => Math.random().toString(36).slice(2, 10);
const actionLabel = (type: string) => ACTIONS.find(([id]) => id === type)?.[1] ?? type;
const iconFor = (type: string) => ({ notify: "♧", move: "↗", copy: "▣", generate_link: "↗", share: "♧", request_approval: "✓", favorite: "☆", tag: "◇", mark_final: "✓", create_folder: "+" }[type] ?? "•");
function cx(...items: Array<string | false | null | undefined>) { return items.filter(Boolean).join(" "); }

export default function WorkflowBuilderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const urlId = params.get("id");
  const initialMode = params.get("mode") === "MANUAL" ? "MANUAL" : "AUTOMATIC";
  const initialResource = params.get("resource") === "FOLDER" ? "FOLDER" : "FILE";
  const initialName = params.get("name") ?? "";
  const initialDescription = params.get("description") ?? "";

  const [workflowId, setWorkflowId] = useState<string | null>(urlId);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL">(initialMode);
  const [resourceType, setResourceType] = useState<"FILE" | "FOLDER">(initialResource);
  const [triggerEvents, setTriggerEvents] = useState<string[]>(["upload"]);
  const [globalCondition, setGlobalCondition] = useState<unknown>("any");
  const [globalActions, setGlobalActions] = useState<Action[]>([]);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [states, setStates] = useState<StateDraft[]>([{ name: "Draft", description: "Initial workflow state", terminal: false }, { name: "Completed", description: "Final state", terminal: true }]);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([{ from: 0, to: 1, name: "Complete", description: "", trigger: "manual", condition: "any", actions: [], completion: "continue" }]);
  const [start, setStart] = useState<StartConfig>({ name: mode === "MANUAL" ? "Manual Start" : "File uploaded", description: "", trigger: mode === "MANUAL" ? "manual" : "automatic", to: 0, condition: "any" });
  const [positions, setPositions] = useState<NodePoint[]>([{ x: 430, y: 130 }, { x: 430, y: 340 }]);
  const [step, setStep] = useState<1 | 2 | 3>(urlId ? 2 : 1);
  const [selected, setSelected] = useState<{ kind: "start" | "state" | "transition"; index?: number }>({ kind: "start" });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(Boolean(urlId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [fieldEditor, setFieldEditor] = useState<{ type: string; index: number | null } | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [transitionDraft, setTransitionDraft] = useState<{ from: number; to: number }>({ from: 0, to: 0 });
  const [activateOpen, setActivateOpen] = useState(false);
  const dragRef = useRef<{ index: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!urlId) return;
    void getWorkflow(urlId).then((w: Workflow) => {
      setWorkflowId(w.id); setName(w.name); setDescription(w.description ?? ""); setMode(w.mode); setResourceType(w.resourceType);
      const trigger = w.steps.find(s => s.kind === "TRIGGER")?.config.value;
      const triggerObj = trigger && typeof trigger === "object" && !Array.isArray(trigger) ? trigger as Record<string, unknown> : null;
      setTriggerEvents(Array.isArray(triggerObj?.events) ? triggerObj.events.map(String) : Array.isArray(trigger) ? trigger.map(String) : [String(triggerObj?.events ?? trigger ?? "upload")]);
      setGlobalCondition(w.steps.find(s => s.kind === "CONDITION")?.config.value ?? "any");
      const a = w.steps.find(s => s.kind === "ACTIONS")?.config.value;
      if (Array.isArray(a)) setGlobalActions(a as Action[]);
      const f = w.steps.find(s => s.kind === "WORKFLOW_FIELDS")?.config.value;
      if (Array.isArray(f)) setFields(f as FieldDraft[]);
      const mappedStates = w.states.map(s => ({ id: s.id, name: s.name, description: s.description ?? "", terminal: s.terminal }));
      setStates(mappedStates);
      setPositions(mappedStates.map((_, i) => ({ x: 430 + (i % 2) * 310, y: 130 + Math.floor(i / 2) * 190 })));
      const mappedTransitions = w.transitions.map((t: WorkflowTransition) => ({ id: t.id, from: w.states.findIndex(s => s.id === t.fromStateId), to: w.states.findIndex(s => s.id === t.toStateId), name: t.name, description: t.description ?? "", trigger: t.trigger === "manual" ? "manual" : "automatic", condition: t.condition ?? "any", actions: (t.actions ?? []) as Action[], completion: "continue" as const }));
      setTransitions(mappedTransitions);
      if (triggerObj?.start && typeof triggerObj.start === "object") setStart(triggerObj.start as StartConfig);
    }).catch(() => setError("Unable to load workflow")).finally(() => setLoading(false));
  }, [urlId]);

  useEffect(() => {
    if (!workflowId) return;
    try {
      const raw = localStorage.getItem(`imkan-workflow-layout:${workflowId}`);
      if (raw) setPositions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [workflowId]);

  useEffect(() => {
    if (!workflowId || !positions.length) return;
    try { localStorage.setItem(`imkan-workflow-layout:${workflowId}`, JSON.stringify(positions)); } catch { /* ignore */ }
  }, [workflowId, positions]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const workflowCondition = useMemo(() => globalCondition, [globalCondition]);
  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!name.trim()) issues.push("Workflow name is required.");
    if (mode === "AUTOMATIC" && !triggerEvents.length) issues.push("Choose at least one automatic trigger event.");
    if (!states.length) issues.push("Add at least one state.");
    if (states.length && !states.some(s => s.terminal)) issues.push("Mark at least one state as final.");
    if (states.length && (start.to < 0 || start.to >= states.length)) issues.push("Choose a valid starting state.");
    transitions.forEach((t, i) => {
      if (t.from === t.to) issues.push(`Transition ${i + 1} cannot point to the same state.`);
      if (t.from < 0 || t.from >= states.length || t.to < 0 || t.to >= states.length) issues.push(`Transition ${i + 1} has an invalid state.`);
    });
    return issues;
  }, [name, states, start, transitions, mode, triggerEvents]);

  const payload = () => ({
    name: name.trim(), description, mode, resourceType,
    trigger: { events: mode === "MANUAL" ? ["manual"] : triggerEvents, start },
    condition: workflowCondition, actions: globalActions, status: "DRAFT", fields,
    states, transitions,
  });

  const saveDraft = async (nextStep?: 1 | 2 | 3) => {
    if (busy) return;
    if (!name.trim()) { setError("Enter a workflow name first."); setStep(1); return; }
    setBusy(true); setError("");
    try {
      const saved = workflowId ? await updateWorkflow(workflowId, payload()) : await createWorkflow(payload());
      setWorkflowId(saved.id);
      if (nextStep) setStep(nextStep);
      setToast("Workflow saved");
      if (!urlId) router.replace(`/files/workflows/builder?id=${saved.id}`);
      return saved;
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save workflow"); }
    finally { setBusy(false); }
  };

  const enable = async () => {
    if (validation.length) { setError(validation[0]); return; }
    setBusy(true); setError("");
    try {
      const saved = workflowId ? await updateWorkflow(workflowId, { ...payload(), status: "ACTIVE" }) : await createWorkflow({ ...payload(), status: "ACTIVE" });
      setWorkflowId(saved.id); setActivateOpen(false); setToast("Workflow activated");
      window.setTimeout(() => router.push("/files/workflows"), 600);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to activate workflow"); }
    finally { setBusy(false); }
  };

  const addField = (type: string) => setFieldEditor({ type, index: null });
  const commitField = (field: FieldDraft) => {
    setFields(current => fieldEditor?.index === null || fieldEditor?.index === undefined ? [...current, field] : current.map((x, i) => i === fieldEditor.index ? field : x));
    setFieldEditor(null);
    setToast("Field saved");
  };
  const addState = () => {
    if (states.length >= 20) return;
    const index = states.length;
    setStates(s => [...s, { name: `State ${index + 1}`, description: "", terminal: false }]);
    setPositions(p => [...p, { x: 430 + (index % 2) * 310, y: 130 + Math.floor(index / 2) * 190 }]);
    setSelected({ kind: "state", index });
    setAddMenu(false);
  };
  const removeState = (index: number) => {
    if (states.length <= 1) return;
    setStates(s => s.filter((_, i) => i !== index));
    setPositions(p => p.filter((_, i) => i !== index));
    setTransitions(ts => ts.filter(t => t.from !== index && t.to !== index).map(t => ({ ...t, from: t.from > index ? t.from - 1 : t.from, to: t.to > index ? t.to - 1 : t.to })));
    setStart(s => ({ ...s, to: s.to === index ? 0 : s.to > index ? s.to - 1 : s.to }));
    setSelected({ kind: "start" });
  };
  const addTransition = (from: number, to: number) => {
    if (states.length < 2 || from === to) return;
    const index = transitions.length;
    setTransitions(ts => [...ts, { from, to, name: "New transition", description: "", trigger: "manual", condition: "any", actions: [], completion: "continue" }]);
    setSelected({ kind: "transition", index }); setAddMenu(false);
  };
  const updateState = (index: number, patch: Partial<StateDraft>) => setStates(s => s.map((x, i) => i === index ? { ...x, ...patch } : x));
  const updateTransition = (index: number, patch: Partial<TransitionDraft>) => setTransitions(ts => ts.map((x, i) => i === index ? { ...x, ...patch } : x));
  const removeTransition = (index: number) => { setTransitions(ts => ts.filter((_, i) => i !== index)); setSelected({ kind: "start" }); };
  const addAction = (target: "global" | number, type: string, phase: "before" | "during" | "after" = "during") => {
    const action: Action = { type, config: {}, phase };
    if (target === "global") setGlobalActions(a => a.length < 5 ? [...a, action] : a);
    else setTransitions(ts => ts.map((t, i) => i === target && t.actions.length < 5 ? { ...t, actions: [...t.actions, action] } : t));
  };
  const updateAction = (target: "global" | number, index: number, patch: Record<string, unknown>) => {
    const fn = (a: Action[]) => a.map((x, i) => i === index ? { ...x, ...(typeof patch.phase === "string" ? { phase: patch.phase as Action["phase"] } : {}), config: { ...(x.config ?? {}), ...(patch.config && typeof patch.config === "object" ? patch.config : {}) } } : x);
    if (target === "global") setGlobalActions(fn); else setTransitions(ts => ts.map((t, i) => i === target ? { ...t, actions: fn(t.actions) } : t));
  };
  const removeAction = (target: "global" | number, index: number) => {
    if (target === "global") setGlobalActions(a => a.filter((_, i) => i !== index)); else setTransitions(ts => ts.map((t, i) => i === target ? { ...t, actions: t.actions.filter((_, j) => j !== index) } : t));
  };

  const onNodePointerDown = (event: PointerEvent<HTMLDivElement>, index: number) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,select")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { index, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onNodePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; if (!d) return;
    const canvas = event.currentTarget.closest("[data-workflow-canvas]")?.getBoundingClientRect(); if (!canvas) return;
    const x = Math.max(30, (event.clientX - canvas.left - d.offsetX - pan.x) / zoom);
    const y = Math.max(30, (event.clientY - canvas.top - d.offsetY - pan.y) / zoom);
    setPositions(p => p.map((pos, i) => i === d.index ? { x, y } : pos));
  };
  const onNodePointerUp = () => { dragRef.current = null; };

  if (loading) return <div className="flex min-h-0 flex-1"><SecondarySidebar section="workflows"/><main className="flex-1 p-8 text-sm text-slate-500">Loading workflow…</main></div>;

  return <div className="flex min-h-0 flex-1 bg-[#f7f8fa]">
    <SecondarySidebar section="workflows"/>
    <main className="min-w-0 flex-1 overflow-hidden bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex min-h-[56px] items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-center gap-3"><Link href="/files/workflows" className="text-[20px] text-slate-500">‹</Link><div className="min-w-0"><div className="flex items-center gap-2"><input value={name} onChange={e => setName(e.target.value)} placeholder="Workflow name" className="w-[min(420px,45vw)] bg-transparent text-[16px] font-semibold outline-none"/><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{mode === "MANUAL" ? "Manual" : "Automatic"}</span></div></div></div>
          <div className="flex items-center gap-2"><button onClick={() => void saveDraft()} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[11px] font-medium">Save</button><button onClick={() => setActivateOpen(true)} disabled={busy || validation.length > 0} className="rounded-lg bg-[#2f6fed] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-40">Enable</button><button className="px-2 text-xl text-slate-500">…</button></div>
        </div>
        <div className="flex justify-center border-t border-slate-100 py-2"><div className="flex items-center rounded-full bg-slate-100 p-1 text-[11px]"><button onClick={() => setStep(1)} className={cx("rounded-full px-4 py-1.5", step === 1 ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>1&nbsp; Configure fields</button><button onClick={() => setStep(2)} className={cx("rounded-full px-4 py-1.5", step === 2 ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>2&nbsp; Design workflow</button><button onClick={() => setStep(3)} className={cx("rounded-full px-4 py-1.5", step === 3 ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>3&nbsp; Review</button></div></div>
      </header>

      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-[10.5px] text-red-700">{error}</div>}
      {toast && <div className="absolute right-6 top-20 z-50 rounded-lg bg-slate-900 px-4 py-2 text-[10px] font-medium text-white shadow-lg">{toast}</div>}

      {step === 1 && <FieldsStep fields={fields} setFields={setFields} addField={addField} fieldEditor={fieldEditor} setFieldEditor={setFieldEditor} commitField={commitField} onNext={() => void saveDraft(2)} onBack={() => router.push("/files/workflows")} />}
      {step === 2 && <DesignStep
        states={states} positions={positions} transitions={transitions} start={start} setStart={setStart} selected={selected} setSelected={setSelected} zoom={zoom} setZoom={setZoom} pan={pan} setPan={setPan}
        addState={addState} addTransition={addTransition} addMenu={addMenu} setAddMenu={setAddMenu} transitionDraft={transitionDraft} setTransitionDraft={setTransitionDraft}
        updateState={updateState} removeState={removeState} updateTransition={updateTransition} removeTransition={removeTransition} globalActions={globalActions} globalCondition={globalCondition} setGlobalCondition={setGlobalCondition}
        addAction={addAction} updateAction={updateAction} removeAction={removeAction} triggerEvents={triggerEvents} setTriggerEvents={setTriggerEvents} fields={fields} mode={mode} resourceType={resourceType}
        setMode={setMode} setResourceType={setResourceType} onNext={() => void saveDraft(3)} onBack={() => setStep(1)} onNodePointerDown={onNodePointerDown} onNodePointerMove={onNodePointerMove} onNodePointerUp={onNodePointerUp}
      />}
      {step === 3 && <ReviewStep name={name} description={description} mode={mode} resourceType={resourceType} fields={fields} states={states} transitions={transitions} triggerEvents={triggerEvents} validation={validation} onBack={() => setStep(2)} onEnable={() => setActivateOpen(true)} />}
    </main>

    {activateOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-5"><div className="w-full max-w-[590px] rounded-xl bg-white p-7 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-[18px] font-semibold text-slate-900">Activate Workflow?</h2><p className="mt-3 text-[12px] leading-5 text-slate-600">You are about to activate the <strong>{name || "workflow"}</strong> workflow. Test the workflow with a sample {resourceType.toLowerCase()} after enabling it.</p></div><button onClick={() => setActivateOpen(false)} className="text-xl text-slate-400">×</button></div><div className="mt-5 rounded-lg bg-blue-50 p-4 text-[11px] leading-5 text-slate-600">Once enabled, matching {mode === "MANUAL" ? "manual starts" : "events"} can create workflow runs and pending tasks.</div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setActivateOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-[11px]">Cancel</button><button disabled={busy} onClick={() => void enable()} className="rounded-lg bg-[#0b8f4d] px-5 py-2.5 text-[11px] font-semibold text-white">{busy ? "Activating…" : "Activate"}</button></div></div></div>}
  </div>;
}

function FieldsStep({ fields, setFields, addField, fieldEditor, setFieldEditor, commitField, onNext, onBack }: { fields: FieldDraft[]; setFields: (v: FieldDraft[]) => void; addField: (type: string) => void; fieldEditor: { type: string; index: number | null } | null; setFieldEditor: (v: { type: string; index: number | null } | null) => void; commitField: (v: FieldDraft) => void; onNext: () => void; onBack: () => void; }) {
  return <div className="flex h-[calc(100vh-112px)] min-h-0 flex-col bg-[#f7f8fa]"><div className="flex min-h-0 flex-1 gap-4 p-5"><aside className="w-[330px] shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5"><p className="text-[12px] leading-5 text-slate-600">Create custom workflow fields by dragging and dropping them or clicking the <strong>+</strong> icon.</p><div className="mt-6 space-y-3">{FIELD_TYPES.map(type => <button key={type} onClick={() => addField(type)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-3 text-start text-[11.5px] hover:border-[#2f6fed] hover:bg-blue-50"><span>{type}</span><span className="text-[18px] text-[#2f6fed]">+</span></button>)}</div></aside><section className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-6 py-5"><h2 className="text-[15px] font-semibold">Workflow Fields</h2><p className="mt-1 text-[11px] text-slate-500">Workflow fields collect feedback, assignees, approvers and other information during transitions.</p></div>{fieldEditor ? <FieldEditor initial={fieldEditor.index === null ? undefined : fields[fieldEditor.index]} type={fieldEditor.type} onCancel={() => setFieldEditor(null)} onSave={commitField}/> : fields.length === 0 ? <div className="flex min-h-[440px] items-center justify-center text-center text-[11px] text-slate-400">Add a field from the left panel to get started.</div> : <div className="divide-y divide-slate-100">{fields.map((field, index) => <div key={field.id} className="flex items-center gap-3 px-6 py-4"><div className="h-9 w-9 rounded-lg bg-blue-50 text-center leading-9 text-[#2f6fed]">▦</div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">{field.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{field.type}{field.required ? " · Mandatory" : ""}</div></div><button onClick={() => setFieldEditor({ type: field.type, index })} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px]">Edit</button><button onClick={() => setFields(fields.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-500">×</button></div>)}</div>}<div className="px-6 py-5 text-[10px] text-slate-400">* Drag and drop custom fields here</div></section></div><footer className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3"><button onClick={onBack} className="rounded-lg border border-slate-300 px-4 py-2 text-[11px]">Back</button><button onClick={onNext} className="rounded-lg bg-[#0b8f4d] px-5 py-2 text-[11px] font-semibold text-white">Go to next step</button></footer></div>;
}

function FieldEditor({ initial, type, onCancel, onSave }: { initial?: FieldDraft; type: string; onCancel: () => void; onSave: (field: FieldDraft) => void }) {
  const [name, setName] = useState(initial?.name ?? ""); const [description, setDescription] = useState(initial?.description ?? ""); const [maxCharacters, setMaxCharacters] = useState(String(initial?.maxCharacters ?? "")); const [defaultValue, setDefaultValue] = useState(initial?.defaultValue ?? ""); const [required, setRequired] = useState(initial?.required ?? false); const [options, setOptions] = useState((initial?.options ?? ["Approve", "Reject"]).join("\n"));
  return <div className="m-6 max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><div className="text-[10px] text-slate-400">Field type</div><div className="mt-1 text-[14px] font-semibold">{type}</div></div><div className="space-y-4 p-5"><Field label="Field name"><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Enter field name" className="control"/></Field><Field label="Field description"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add field description" className="control"/></Field>{["Single line text", "Number"].includes(type) && <Field label={type === "Number" ? "Maximum value" : "Maximum characters"}><input type="number" value={maxCharacters} onChange={e => setMaxCharacters(e.target.value)} placeholder="Optional" className="control"/></Field>}{type === "Choice" && <Field label="Choices"><textarea rows={4} value={options} onChange={e => setOptions(e.target.value)} className="control resize-none"/></Field>}<Field label="Default value"><input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder="Specify the default value if no value is given" className="control"/></Field><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)}/> Make this custom field mandatory</label><div className="flex gap-2 pt-2"><button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-[11px]">Cancel</button><button disabled={!name.trim()} onClick={() => onSave({ id: initial?.id ?? uid(), name: name.trim(), description, type, required, maxCharacters: maxCharacters ? Number(maxCharacters) : undefined, defaultValue, options: type === "Choice" ? options.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : undefined })} className="rounded-lg bg-[#0b8f4d] px-5 py-2 text-[11px] font-semibold text-white disabled:opacity-40">Create</button></div></div></div>;
}

function DesignStep(props: {
  states: StateDraft[]; positions: NodePoint[]; transitions: TransitionDraft[]; start: StartConfig; setStart: (v: StartConfig) => void; selected: { kind: "start" | "state" | "transition"; index?: number }; setSelected: (v: { kind: "start" | "state" | "transition"; index?: number }) => void; zoom: number; setZoom: (v: number) => void; pan: { x: number; y: number }; setPan: (v: { x: number; y: number }) => void;
  addState: () => void; addTransition: (from: number, to: number) => void; addMenu: boolean; setAddMenu: (v: boolean) => void; transitionDraft: { from: number; to: number }; setTransitionDraft: (v: { from: number; to: number }) => void; updateState: (i: number, p: Partial<StateDraft>) => void; removeState: (i: number) => void; updateTransition: (i: number, p: Partial<TransitionDraft>) => void; removeTransition: (i: number) => void;
  globalActions: Action[]; globalCondition: unknown; setGlobalCondition: (v: unknown) => void; addAction: (target: "global" | number, type: string, phase?: "before" | "during" | "after") => void; updateAction: (target: "global" | number, i: number, p: Record<string, unknown>) => void; removeAction: (target: "global" | number, i: number) => void;
  triggerEvents: string[]; setTriggerEvents: (v: string[]) => void; fields: FieldDraft[]; mode: "AUTOMATIC" | "MANUAL"; resourceType: "FILE" | "FOLDER"; setMode: (v: "AUTOMATIC" | "MANUAL") => void; setResourceType: (v: "FILE" | "FOLDER") => void; onNext: () => void; onBack: () => void;
  onNodePointerDown: (e: PointerEvent<HTMLDivElement>, i: number) => void; onNodePointerMove: (e: PointerEvent<HTMLDivElement>) => void; onNodePointerUp: () => void;
}) {
  const { states, positions, transitions, start, setStart, selected, setSelected, zoom, setZoom, pan, setPan, addState, addTransition, addMenu, setAddMenu, transitionDraft, setTransitionDraft, updateState, removeState, updateTransition, removeTransition, globalActions, globalCondition, setGlobalCondition, addAction, updateAction, removeAction, triggerEvents, setTriggerEvents, fields, mode, resourceType, setMode, setResourceType, onNext, onBack, onNodePointerDown, onNodePointerMove, onNodePointerUp } = props;
  const selectedTransition = selected.kind === "transition" ? transitions[selected.index ?? -1] : null;
  return <div className="flex h-[calc(100vh-112px)] min-h-0 flex-col"><div className="flex min-h-0 flex-1"><section data-workflow-canvas className="relative min-w-0 flex-1 overflow-hidden bg-[#f8f9fb]"><div className="absolute left-5 top-5 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"><button onClick={() => setZoom(Math.max(.55, +(zoom - .1).toFixed(2)))} className="h-7 w-7">−</button><span className="w-12 text-center text-[10px]">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(1.6, +(zoom + .1).toFixed(2)))} className="h-7 w-7">+</button><button onClick={() => {setZoom(1);setPan({x:0,y:0})}} className="border-s border-slate-200 px-2 text-[10px]">Reset</button></div><button onClick={() => setAddMenu(!addMenu)} className="absolute bottom-6 right-7 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#0b8f4d] text-2xl text-white shadow-lg">+</button>{addMenu && <div className="absolute bottom-[76px] right-7 z-30 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><button onClick={addState} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start hover:bg-slate-50"><span className="text-blue-600">○</span><span><strong className="block text-[11px]">State</strong><small className="text-[9px] text-slate-400">Create a new workflow state</small></span></button><div className="my-1 border-t border-slate-100"/><div className="p-2"><div className="text-[9px] font-semibold text-slate-400">Add transition</div><div className="mt-2 grid grid-cols-2 gap-2"><select value={transitionDraft.from} onChange={e => setTransitionDraft({...transitionDraft, from: Number(e.target.value)})} className="control">{states.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select><select value={transitionDraft.to} onChange={e => setTransitionDraft({...transitionDraft, to: Number(e.target.value)})} className="control">{states.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></div><button onClick={() => addTransition(transitionDraft.from, transitionDraft.to)} className="mt-2 w-full rounded-lg bg-[#2f6fed] px-3 py-2 text-[10px] font-semibold text-white">Create transition</button></div></div>}
    <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
      <svg className="pointer-events-none absolute inset-0 h-[1000px] w-[1200px] overflow-visible">{transitions.map((t,i) => <Connector key={i} from={positions[t.from]} to={positions[t.to]} selected={selected.kind === "transition" && selected.index === i} label={t.name}/>) }{states.length > 0 && <Connector from={{x: 570, y: 55}} to={positions[start.to] ?? {x:430,y:130}} selected={selected.kind === "start"} label={start.name || "Start"}/>}</svg>
      <div className={cx("absolute flex h-12 w-[110px] items-center justify-center rounded-full border-2 bg-white text-[12px] font-semibold shadow-sm", selected.kind === "start" ? "border-[#2f6fed]" : "border-slate-300")} style={{left: 515, top: 30}} onClick={() => setSelected({kind:"start"})}>Start</div>
      {states.map((state,i) => {const pos = positions[i] ?? {x:430 + (i%2)*310, y:130 + Math.floor(i/2)*190}; return <div key={state.id ?? i} onPointerDown={e => onNodePointerDown(e,i)} onPointerMove={onNodePointerMove} onPointerUp={onNodePointerUp} onClick={() => setSelected({kind:"state",index:i})} className={cx("absolute w-[230px] select-none rounded-xl border-2 bg-white shadow-sm", selected.kind === "state" && selected.index === i ? "border-[#2f6fed]" : state.terminal ? "border-emerald-400" : "border-slate-200")} style={{left:pos.x,top:pos.y}}><div className="flex items-center gap-3 p-4"><div className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2", state.terminal ? "border-emerald-500 text-emerald-600" : "border-[#2f6fed] text-[#2f6fed]")}>○</div><div className="min-w-0"><div className="truncate text-[12px] font-semibold">{state.name || `State ${i+1}`}</div><div className="mt-1 text-[9.5px] text-slate-400">{state.terminal ? "Final state" : "State"}</div></div></div><div className="border-t border-slate-100 px-4 py-2 text-[9.5px] text-slate-500">{state.description || "Configure this state"}</div></div>})}
    </div>
    <div className="absolute bottom-5 left-5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] text-slate-400">Drag states · Click nodes or transitions to configure · Use + to add</div><div className="absolute bottom-5 right-5 z-20 h-[130px] w-[190px] rounded-lg border border-slate-200 bg-white p-2 shadow-sm"><div className="mb-1 text-[8px] font-semibold text-slate-400">Mini map</div><div className="relative h-[100px] overflow-hidden rounded border border-slate-100 bg-[#fafbfc]">{states.map((s:any,i:number)=>{const p=positions[i]??{x:430,y:130};return <button key={i} onClick={()=>setSelected({kind:"state",index:i})} className={cx("absolute h-3 w-6 rounded-[2px] border",selected.kind==="state"&&selected.index===i?"border-blue-500 bg-blue-100":"border-slate-300 bg-white")} style={{left:Math.min(160,Math.max(2,p.x/8)),top:Math.min(80,Math.max(2,p.y/5))}} aria-label={s.name}/>})}</div></div>
  </section><aside className="w-[430px] shrink-0 overflow-y-auto border-s border-slate-200 bg-white"><Inspector selected={selected} states={states} start={start} setStart={setStart} updateState={updateState} removeState={removeState} transitions={transitions} updateTransition={updateTransition} removeTransition={removeTransition} selectedTransition={selectedTransition} globalActions={globalActions} globalCondition={globalCondition} setGlobalCondition={setGlobalCondition} addAction={addAction} updateAction={updateAction} removeAction={removeAction} triggerEvents={triggerEvents} setTriggerEvents={setTriggerEvents} fields={fields} mode={mode} resourceType={resourceType} setMode={setMode} setResourceType={setResourceType}/></aside></div><footer className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3"><button onClick={onBack} className="rounded-lg border border-slate-300 px-4 py-2 text-[11px]">Back</button><button onClick={onNext} className="rounded-lg bg-[#0b8f4d] px-5 py-2 text-[11px] font-semibold text-white">Go to next step</button></footer></div>;
}

function Connector({ from, to, selected, label }: { key?: number; from?: any; to?: any; selected: boolean; label: string }) { if (!from || !to) return null; const x1 = from.x + 115, y1 = from.y + 80, x2 = to.x + 115, y2 = to.y; const midY = (y1 + y2) / 2; return <g><path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} fill="none" stroke={selected ? BLUE : "#94a3b8"} strokeWidth={selected ? 2.5 : 1.6}/><path d={`M ${x2-5} ${y2-7} L ${x2} ${y2} L ${x2+5} ${y2-7}`} fill="none" stroke={selected ? BLUE : "#64748b"} strokeWidth="1.6"/><rect x={(x1+x2)/2-38} y={midY-10} width="76" height="20" rx="10" fill="white" stroke={selected ? BLUE : "#e2e8f0"}/><text x={(x1+x2)/2} y={midY+4} textAnchor="middle" fontSize="9" fill={selected ? BLUE : "#475569"}>{label.slice(0,16)}</text></g>; }

function Inspector({ selected, states, start, setStart, updateState, removeState, transitions, updateTransition, removeTransition, selectedTransition, globalActions, globalCondition, setGlobalCondition, addAction, updateAction, removeAction, triggerEvents, setTriggerEvents, fields, mode, resourceType, setMode, setResourceType }: any) {
  if (selected.kind === "start") return <StartInspector {...{start,setStart,states,triggerEvents,setTriggerEvents,fields,mode,resourceType,setMode,setResourceType,globalCondition,setGlobalCondition,globalActions,addAction,updateAction,removeAction}}/>;
  if (selected.kind === "state") { const i = selected.index ?? 0; const s = states[i]; return <div className="p-6"><div className="flex items-center justify-between"><h2 className="text-[17px] font-semibold">State</h2><button onClick={() => removeState(i)} className="text-red-500">⌫</button></div><div className="mt-6 space-y-5"><Field label="Name *"><input value={s.name} onChange={e=>updateState(i,{name:e.target.value})} className="control"/></Field><Field label="Description"><textarea rows={4} value={s.description} onChange={e=>updateState(i,{description:e.target.value})} className="control resize-none"/></Field><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={s.terminal} onChange={e=>updateState(i,{terminal:e.target.checked})}/> Mark as final state</label><div className="rounded-lg bg-slate-50 p-3 text-[10px] leading-5 text-slate-500">A state represents a stage in the workflow. Transitions leaving this state define how users or automatic rules move the item forward.</div></div></div>; }
  if (!selectedTransition) return <div className="p-6 text-sm text-slate-500">Select a transition.</div>;
  const i = selected.index ?? 0; return <TransitionInspector transition={selectedTransition} index={i} states={states} fields={fields} updateTransition={updateTransition} removeTransition={removeTransition} addAction={addAction} updateAction={updateAction} removeAction={removeAction}/>;
}

function StartInspector({ start, setStart, states, triggerEvents, setTriggerEvents, fields, mode, resourceType, setMode, setResourceType, globalCondition, setGlobalCondition, globalActions, addAction, updateAction, removeAction }: any) {
  const [tab,setTab]=useState<"during"|"after">("during");
  const phaseActions=(globalActions as Action[]).filter(a=>(a.phase??"during")===tab);
  const selectMode=(next:"MANUAL"|"AUTOMATIC")=>{setMode(next);setStart({...start,trigger:next==="MANUAL"?"manual":"automatic",name:next==="MANUAL"?"Manual Start":(start.name==="Manual Start"?"File uploaded":start.name)});};
  return <div className="p-6"><h2 className="text-[18px] font-semibold">Create a starting trigger</h2><p className="mt-2 text-[11px] leading-5 text-slate-500">A transition is the link between different states. The starting trigger is the first transition into your workflow.</p><div className="mt-5 flex rounded-lg bg-slate-100 p-1"><button onClick={()=>selectMode("MANUAL")} className={cx("flex-1 rounded-md py-2 text-[10px]",mode==="MANUAL"?"bg-white font-semibold shadow-sm":"text-slate-500")}>Manual</button><button onClick={()=>selectMode("AUTOMATIC")} className={cx("flex-1 rounded-md py-2 text-[10px]",mode==="AUTOMATIC"?"bg-white font-semibold shadow-sm":"text-slate-500")}>Automatic</button></div><div className="mt-6 space-y-5"><Field label="Workflow type"><select value={resourceType} onChange={e=>setResourceType(e.target.value)} className="control"><option value="FILE">File-based</option><option value="FOLDER">Folder-based</option></select></Field><Field label="Transition"><input value={start.name} onChange={e=>setStart({...start,name:e.target.value})} placeholder="Enter a transition name" className="control"/></Field><Field label="Description (Optional)"><textarea rows={3} value={start.description} onChange={e=>setStart({...start,description:e.target.value})} placeholder="Add a short description" className="control resize-none"/></Field>{mode === "AUTOMATIC" && <Field label="Trigger events"><div className="space-y-2">{TRIGGERS.map(([id,label])=><label key={id} className="flex items-center gap-2 text-[10.5px]"><input type="checkbox" checked={triggerEvents.includes(id)} onChange={e=>setTriggerEvents(e.target.checked?[...triggerEvents,id]:triggerEvents.filter(x=>x!==id))}/>{label}</label>)}</div></Field>}<Field label="Start at state"><select value={start.to} onChange={e=>setStart({...start,to:Number(e.target.value)})} className="control">{states.map((s:any,i:number)=><option key={i} value={i}>{s.name || `State ${i+1}`}</option>)}</select></Field><ConditionEditor value={globalCondition} onChange={setGlobalCondition} fields={fields}/><div><div className="flex rounded-lg bg-slate-100 p-1"><button onClick={()=>setTab("during")} className={cx("flex-1 rounded-md py-2 text-[10px]",tab==="during"?"bg-white font-semibold shadow-sm":"text-slate-500")}>During</button><button onClick={()=>setTab("after")} className={cx("flex-1 rounded-md py-2 text-[10px]",tab==="after"?"bg-white font-semibold shadow-sm":"text-slate-500")}>After</button></div><div className="mt-3"><ActionList title={tab==="during"?"Instant actions":"After actions"} actions={phaseActions} fields={fields} add={(t:string)=>addAction("global",t,tab)} remove={(local:number)=>{const target=(globalActions as Action[]).map((a,i)=>({a,i})).filter(x=>(x.a.phase??"during")===tab)[local]?.i;if(target!==undefined)removeAction("global",target)}} update={(local:number,p:Record<string,unknown>)=>{const target=(globalActions as Action[]).map((a,i)=>({a,i})).filter(x=>(x.a.phase??"during")===tab)[local]?.i;if(target!==undefined)updateAction("global",target,p)}}/></div></div></div></div>;
}

function TransitionInspector({ transition, index, states, fields, updateTransition, removeTransition, addAction, updateAction, removeAction }: any) {
  const [tab, setTab] = useState<"before"|"during"|"after">("before");
  const phaseActions = transition.actions.filter((a:Action)=> (a.phase ?? "during") === tab);
  return <div className="p-6"><div className="flex items-start justify-between"><div><h2 className="text-[18px] font-semibold">{transition.name || "Transition"}</h2><p className="mt-1 text-[10px] text-slate-400">Transition between different states</p></div><button onClick={()=>removeTransition(index)} className="text-red-500">⌫</button></div><div className="mt-5 flex rounded-lg bg-slate-100 p-1"><button onClick={()=>setTab("before")} className={cx("flex-1 rounded-md py-2 text-[10px]",tab==="before"?"bg-white font-semibold shadow-sm":"text-slate-500")}>Before</button><button onClick={()=>setTab("during")} className={cx("flex-1 rounded-md py-2 text-[10px]",tab==="during"?"bg-white font-semibold shadow-sm":"text-slate-500")}>During</button><button onClick={()=>setTab("after")} className={cx("flex-1 rounded-md py-2 text-[10px]",tab==="after"?"bg-white font-semibold shadow-sm":"text-slate-500")}>After</button></div><div className="mt-6 space-y-5"><Field label="Transition name"><input value={transition.name} onChange={e=>updateTransition(index,{name:e.target.value})} className="control"/></Field><Field label="To state"><select value={transition.to} onChange={e=>updateTransition(index,{to:Number(e.target.value)})} className="control">{states.map((s:any,i:number)=><option key={i} value={i}>{s.name}</option>)}</select></Field>{tab === "before" && <><Field label="Description"><textarea rows={3} value={transition.description} onChange={e=>updateTransition(index,{description:e.target.value})} className="control resize-none"/></Field><ConditionEditor value={transition.condition} onChange={(v:unknown)=>updateTransition(index,{condition:v})} fields={fields}/></>}{tab === "during" && <><Field label="Execution"><div className="space-y-2"><label className="flex items-center gap-2 text-[10.5px]"><input type="radio" checked={transition.trigger === "manual"} onChange={()=>updateTransition(index,{trigger:"manual"})}/> Manual — requires a user action</label><label className="flex items-center gap-2 text-[10.5px]"><input type="radio" checked={transition.trigger === "automatic"} onChange={()=>updateTransition(index,{trigger:"automatic"})}/> Automatic — continue when conditions match</label></div></Field><ActionList title="Instant actions" actions={phaseActions} fields={fields} add={(t:string)=>addAction(index,t,"during")} remove={(local:number)=>{const global=transition.actions.findIndex((a:Action)=> (a.phase??"during")===tab && transition.actions.indexOf(a)===local);removeAction(index,global)}} update={(local:number,p:Record<string,unknown>)=>{const global=transition.actions.findIndex((a:Action)=> (a.phase??"during")===tab && transition.actions.indexOf(a)===local);updateAction(index,global,p)}}/></>}{tab === "after" && <><ActionList title="After actions" actions={phaseActions} fields={fields} add={(t:string)=>addAction(index,t,"after")} remove={(local:number)=>{const global=transition.actions.findIndex((a:Action)=> (a.phase??"during")===tab && transition.actions.indexOf(a)===local);removeAction(index,global)}} update={(local:number,p:Record<string,unknown>)=>{const global=transition.actions.findIndex((a:Action)=> (a.phase??"during")===tab && transition.actions.indexOf(a)===local);updateAction(index,global,p)}}/><Field label="Completion behavior"><select value={transition.completion} onChange={e=>updateTransition(index,{completion:e.target.value})} className="control"><option value="continue">Continue normally</option><option value="wait">Wait for next action</option><option value="complete">Mark workflow complete</option></select></Field></>}</div></div>;
}

function ConditionEditor({ value, onChange, fields=[] }: { value: unknown; onChange: (v: unknown) => void; fields?: FieldDraft[] }) { const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {}; const enabled = value !== "any"; const [useCondition,setUseCondition] = useState(enabled); const [field,setField] = useState(String(object.field ?? "fileType")); const [operator,setOperator] = useState(String(object.operator ?? "equals")); const [expected,setExpected] = useState(String(object.value ?? "PDF")); useEffect(()=>{setUseCondition(value!=="any"); const obj=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}; setField(String(obj.field??"fileType")); setOperator(String(obj.operator??"equals")); setExpected(String(obj.value??"PDF"));},[value]); return <div><div className="flex items-center justify-between"><label className="text-[10px] font-semibold text-slate-700">Conditions</label><label className="flex items-center gap-2 text-[9.5px]"><input type="checkbox" checked={useCondition} onChange={e=>{setUseCondition(e.target.checked); if(!e.target.checked) onChange("any"); else onChange({field,operator,value:expected})}}/> Configure condition</label></div>{useCondition&&<div className="mt-2 grid grid-cols-3 gap-2"><select value={field} onChange={e=>{setField(e.target.value);onChange({field:e.target.value,operator,value:expected})}} className="control"><option value="fileType">File type</option>{fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}<option value="extension">Extension</option><option value="name">Name</option><option value="folderId">Folder</option></select><select value={operator} onChange={e=>{setOperator(e.target.value);onChange({field,operator:e.target.value,value:expected})}} className="control"><option value="equals">equals</option><option value="contains">contains</option><option value="not_equals">does not equal</option></select><input value={expected} onChange={e=>{setExpected(e.target.value);onChange({field,operator,value:e.target.value})}} className="control"/></div>}</div>; }

function ActionList({ title, actions, fields=[], add, remove, update, readOnly=false }: { title: string; actions: Action[]; fields?: FieldDraft[]; add: (type:string)=>void; remove: (i:number)=>void; update?: (i:number,p:Record<string,unknown>)=>void; readOnly?: boolean }) { return <div><div className="flex items-center justify-between"><label className="text-[10px] font-semibold text-slate-700">{title}</label><span className="text-[9px] text-slate-400">{actions.length}/5</span></div><div className="mt-2 space-y-2">{actions.map((a,i)=><div key={`${a.type}-${i}`} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center gap-2"><span className="text-slate-500">{iconFor(a.type)}</span><span className="flex-1 text-[10.5px] font-medium">{actionLabel(a.type)}</span>{!readOnly&&<button onClick={()=>remove(i)} className="text-slate-300 hover:text-red-500">×</button>}</div>{!readOnly&&update&&<ActionConfig action={a} fields={fields} update={(p)=>update(i,p)}/>}</div>)}</div>{!readOnly&&<select defaultValue="" onChange={e=>{if(e.target.value){add(e.target.value);e.currentTarget.value=""}}} className="control mt-2"><option value="">+ Add Action</option>{ACTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>}</div>; }
function ActionConfig({ action, fields, update }: { action: Action; fields: FieldDraft[]; update: (p: Record<string,unknown>)=>void }) { const config=action.config??{}; if(action.type==="notify") return <div className="mt-2 space-y-2"><input value={String(config.title??"")} onChange={e=>update({config:{title:e.target.value}})} placeholder="Notification title" className="control"/><textarea value={String(config.message??"")} onChange={e=>update({config:{message:e.target.value}})} placeholder="Notification message" rows={2} className="control resize-none"/>{fields.length>0&&<select defaultValue="" onChange={e=>{if(e.target.value)update({config:{message:`${String(config.message??"")} {{${e.target.value}}}`}})}} className="control"><option value="">Insert workflow field…</option>{fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>}<input value={String(config.userId??"")} onChange={e=>update({config:{userId:e.target.value}})} placeholder="Recipient user ID (optional)" className="control"/></div>; if(["move","copy"].includes(action.type)) return <input value={String(config.destinationFolderId??"")} onChange={e=>update({config:{destinationFolderId:e.target.value}})} placeholder="Destination folder ID" className="control mt-2"/>; if(action.type==="tag") return <input value={String(config.name??"")} onChange={e=>update({config:{name:e.target.value}})} placeholder="Tag name" className="control mt-2"/>; if(action.type==="create_folder") return <input value={String(config.name??"")} onChange={e=>update({config:{name:e.target.value}})} placeholder="Folder name" className="control mt-2"/>; if(action.type==="share") return <div className="mt-2 space-y-2"><select value={String(config.permission??"VIEW")} onChange={e=>update({config:{permission:e.target.value}})} className="control"><option value="VIEW">View</option><option value="EDIT">Edit</option></select><input value={String(config.userId??"")} onChange={e=>update({config:{userId:e.target.value}})} placeholder="Recipient user ID" className="control"/></div>; if(action.type==="request_approval") return <div className="mt-2 space-y-2"><input value={String(config.title??"")} onChange={e=>update({config:{title:e.target.value}})} placeholder="Approval title" className="control"/><input value={String(config.userId??"")} onChange={e=>update({config:{userId:e.target.value}})} placeholder="Approver user ID" className="control"/></div>; if(action.type==="generate_link") return <label className="mt-2 flex items-center gap-2 text-[9.5px] text-slate-500"><input type="checkbox" checked={config.canDownload!==false} onChange={e=>update({config:{canDownload:e.target.checked}})}/> Allow download</label>; return null; }

function ReviewStep({ name, description, mode, resourceType, fields, states, transitions, triggerEvents, validation, onBack, onEnable }: { name:string;description:string;mode:string;resourceType:string;fields:FieldDraft[];states:StateDraft[];transitions:TransitionDraft[];triggerEvents:string[];validation:string[];onBack:()=>void;onEnable:()=>void }) { return <div className="h-[calc(100vh-112px)] overflow-y-auto bg-[#f7f8fa] p-7"><div className="mx-auto max-w-5xl space-y-4"><div className="rounded-xl border border-slate-200 bg-white p-6"><div className="flex items-start justify-between"><div><div className="text-[10px] text-slate-400">Review workflow</div><h2 className="mt-1 text-[21px] font-semibold">{name || "Untitled workflow"}</h2><p className="mt-2 text-[11px] text-slate-500">{description || "No description"} · {resourceType} · {mode}</p></div><span className={cx("rounded-full px-3 py-1.5 text-[10px] font-semibold",validation.length?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700")}>{validation.length ? `${validation.length} issue${validation.length>1?"s":""}` : "Ready to enable"}</span></div></div><div className="grid gap-4 sm:grid-cols-4"><Summary label="Fields" value={fields.length}/><Summary label="States" value={states.length}/><Summary label="Transitions" value={transitions.length}/><Summary label="Triggers" value={mode === "MANUAL" ? 1 : triggerEvents.length}/></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-[13px] font-semibold">Workflow path</h3><div className="mt-4 flex flex-wrap items-center gap-2">{states.map((s,i)=><span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px]">{s.name}{s.terminal?" ✓":""}</span>)}</div></div>{validation.length>0&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="text-[11px] font-semibold text-amber-800">Before enabling</div><ul className="mt-2 list-disc ps-5 text-[10.5px] leading-5 text-amber-700">{validation.map(v=><li key={v}>{v}</li>)}</ul></div>}<div className="flex justify-end gap-2"><button onClick={onBack} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[11px]">Go back</button><button disabled={validation.length>0} onClick={onEnable} className="rounded-lg bg-[#0b8f4d] px-5 py-2.5 text-[11px] font-semibold text-white disabled:opacity-40">Enable workflow</button></div></div></div>; }
function Summary({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-slate-200 bg-white p-5"><div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-[23px] font-semibold">{value}</div></div>;}
function Field({label,children}:{label:string;children:ReactNode}){return <div><label className="mb-1.5 block text-[10px] font-semibold text-slate-600">{label}</label>{children}</div>}
