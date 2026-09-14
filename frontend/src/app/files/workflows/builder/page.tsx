"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { useLocale } from "@/components/locale-provider";
import { createWorkflow, getWorkflow, updateWorkflow, type Workflow } from "@/lib/api/workflows";

type Action = { type: string; config: Record<string, unknown> };
type WorkflowField = { id: string; name: string; description: string; type: string; required: boolean; defaultValue?: string; max?: number; options?: string[] };
type StateDraft = { name: string; description: string; terminal: boolean };
type TransitionDraft = {
  from: number;
  to: number;
  name: string;
  description: string;
  trigger: string;
  condition: unknown;
  execution: "AUTOMATIC" | "MANUAL";
  before: Action[];
  during: Action[];
  after: Action[];
};
type Position = { x: number; y: number };
type Phase = "before" | "during" | "after";

const BLUE = "#1B66EA";
const GREEN = "#0B8F55";
const TRIGGERS = [
  ["upload", "File uploaded"], ["create", "File/folder created"], ["move", "File/folder moved"],
  ["copy", "File/folder copied"], ["rename", "File renamed"], ["delete", "File moved to trash"],
  ["properties_updated", "Properties updated"], ["ready", "File marked as ready"],
] as const;
const FIELD_TYPES = [
  ["single", "Single line text", "▭"], ["multi", "Multi line text", "▤"], ["number", "Number", "123"],
  ["datetime", "Date & time", "◷"], ["date", "Date", "□"], ["boolean", "Yes/No", "◉"],
  ["choice", "Choice", "▾"], ["email", "Email", "@"],
] as const;
const ACTIONS = [
  ["notify", "System notification"], ["move", "Move"], ["copy", "Copy"], ["generate_link", "Generate link"],
  ["share", "Share"], ["request_approval", "Request approval"], ["favorite", "Add to favorites"],
  ["tag", "Add tag"], ["mark_final", "Mark as final"], ["create_folder", "Create folder"],
] as const;

const DEFAULT_POSITIONS: Position[] = [
  { x: 120, y: 120 }, { x: 430, y: 120 }, { x: 740, y: 120 }, { x: 430, y: 360 },
  { x: 740, y: 360 }, { x: 1050, y: 360 },
];

function action(type: string, config: Record<string, unknown> = {}): Action { return { type, config }; }
function transitionDefaults(from: number, to: number, n: number): TransitionDraft {
  return { from, to, name: n === 1 ? "Complete" : `Transition ${n}`, description: "", trigger: "", condition: "any", execution: "AUTOMATIC", before: [], during: [], after: [] };
}
function normalizePhaseActions(raw: unknown): { before: Action[]; during: Action[]; after: Action[] } {
  if (Array.isArray(raw)) return { before: [], during: raw as Action[], after: [] };
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clean = (v: unknown) => Array.isArray(v) ? v.map((x) => ({ type: String((x as Record<string, unknown>)?.type ?? "notify"), config: ((x as Record<string, unknown>)?.config && typeof (x as Record<string, unknown>).config === "object" ? (x as Record<string, unknown>).config : {}) as Record<string, unknown> })) : [];
  return { before: clean(obj.before), during: clean(obj.during), after: clean(obj.after) };
}

function ActionEditor({ actions, onChange, resourceType }: { actions: Action[]; onChange: (next: Action[]) => void; resourceType: string }) {
  const [dragged, setDragged] = useState<number | null>(null);
  const update = (i: number, key: string, value: unknown) => onChange(actions.map((a, idx) => idx === i ? { ...a, config: { ...a.config, [key]: value } } : a));
  const add = (type: string) => { if (actions.length < 5) onChange([...actions, action(type)]); };
  const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));
  const move = (from: number, to: number) => { if (from === to || from === null || to < 0 || to >= actions.length) return; const next = [...actions]; const [item] = next.splice(from, 1); next.splice(to, 0, item); onChange(next); };
  return <div className="space-y-2">
    {actions.map((a, i) => <div key={`${a.type}-${i}`} draggable onDragStart={() => setDragged(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragged !== null) move(dragged, i); setDragged(null); }} className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-2"><span className="cursor-grab text-slate-400">⋮⋮</span><span className="flex-1 text-[11.5px] font-medium text-slate-800">{ACTIONS.find((x) => x[0] === a.type)?.[1] ?? a.type}</span><button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-600">×</button></div>
      {a.type === "notify" && <><input value={String(a.config.title ?? "")} onChange={(e) => update(i, "title", e.target.value)} placeholder="Notification title" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/><textarea value={String(a.config.message ?? "")} onChange={(e) => update(i, "message", e.target.value)} placeholder="Notification message. Use {{fieldId}} or {{file.name}}" rows={2} className="mt-1.5 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/></>}
      {(["move", "copy"] as string[]).includes(a.type) && <input value={String(a.config.destinationFolderId ?? "")} onChange={(e) => update(i, "destinationFolderId", e.target.value)} placeholder="Destination folder ID" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/>}
      {a.type === "tag" && <input value={String(a.config.name ?? "")} onChange={(e) => update(i, "name", e.target.value)} placeholder="Tag name" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/>}
      {a.type === "share" && <><input value={Array.isArray(a.config.userIds) ? a.config.userIds.join(", ") : String(a.config.userIds ?? "")} onChange={(e) => update(i, "userIds", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="User IDs, comma separated" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/><select value={String(a.config.permission ?? "VIEW")} onChange={(e) => update(i, "permission", e.target.value)} className="mt-1.5 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"><option value="VIEW">View</option><option value="COMMENT">Comment</option><option value="EDIT">Edit</option></select></>}
      {a.type === "request_approval" && <><input value={String(a.config.userId ?? "")} onChange={(e) => update(i, "userId", e.target.value)} placeholder="Approver user ID" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/><input value={String(a.config.title ?? "")} onChange={(e) => update(i, "title", e.target.value)} placeholder="Approval title" className="mt-1.5 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/></>}
      {a.type === "generate_link" && <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={a.config.canDownload !== false} onChange={(e) => update(i, "canDownload", e.target.checked)}/> Allow download</label>}
      {a.type === "create_folder" && <><input value={String(a.config.name ?? "")} onChange={(e) => update(i, "name", e.target.value)} placeholder="Folder name" className="mt-2 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/><input value={String(a.config.parentFolderId ?? "")} onChange={(e) => update(i, "parentFolderId", e.target.value)} placeholder="Parent folder ID (optional)" className="mt-1.5 w-full rounded border border-slate-200 px-2.5 py-2 text-[11px]"/></>}
      {a.type === "favorite" && resourceType === "FOLDER" && <p className="mt-2 text-[10px] text-amber-600">This action is only available for files.</p>}
    </div>)}
    <select value="" onChange={(e) => { if (e.target.value) add(e.target.value); e.currentTarget.value = ""; }} disabled={actions.length >= 5} className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] text-slate-600"><option value="">＋ Add instant action {actions.length >= 5 ? "(5 max)" : ""}</option>{ACTIONS.filter(([v]) => resourceType === "FILE" || !["favorite", "tag", "mark_final", "share", "generate_link"].includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  </div>;
}

function WorkflowCanvas({ states, transitions, positions, setPositions, selected, onSelect, onAddTransition, zoom, setZoom }: {
  states: StateDraft[]; transitions: TransitionDraft[]; positions: Position[]; setPositions: (p: Position[]) => void; selected: string; onSelect: (v: string) => void; onAddTransition: () => void; zoom: number; setZoom: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ index: number; dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; const next = [...positions]; next[drag.index] = { x: Math.max(30, (e.clientX - rect.left - drag.dx) / zoom), y: Math.max(30, (e.clientY - rect.top - drag.dy) / zoom) }; setPositions(next); };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, positions, setPositions, zoom]);
  const width = Math.max(1300, ...positions.map((p) => p.x + 270), 1300);
  const height = Math.max(800, ...positions.map((p) => p.y + 150), 800);
  const center = (i: number) => ({ x: positions[i]?.x + 125 || 125, y: positions[i]?.y + 50 || 50 });
  return <div className="relative h-full min-h-[720px] overflow-auto bg-[#F8FAFC]">
    <div className="sticky top-0 z-30 flex h-11 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur">
      <div className="flex items-center gap-1.5"><button type="button" onClick={() => setZoom(Math.max(.65, Number((zoom - .1).toFixed(2))))} className="wd-icon-btn">−</button><span className="min-w-[48px] text-center text-[11px] text-slate-500">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(Math.min(1.4, Number((zoom + .1).toFixed(2))))} className="wd-icon-btn">＋</button><button type="button" onClick={() => setZoom(1)} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-600">Reset</button></div>
      <div className="text-[10.5px] text-slate-400">Drag states to arrange your workflow</div>
      <button type="button" onClick={onAddTransition} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10.5px] font-medium text-slate-700 hover:border-[#1B66EA] hover:text-[#1B66EA]">＋ Transition</button>
    </div>
    <div ref={canvasRef} className="relative" style={{ width: width * zoom, height: height * zoom }}>
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(#D7E0EC 1px, transparent 1px)", backgroundSize: `${18 * zoom}px ${18 * zoom}px` }}/>
      <div className="absolute left-6 top-5 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500 shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Start</div>
      <svg className="absolute inset-0 z-10 pointer-events-none" width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs><marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#64748B"/></marker><marker id="wf-arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill={BLUE}/></marker></defs>
        {transitions.map((t, i) => { const a = center(t.from), b = center(t.to); const midX = (a.x + b.x) / 2; const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`; const active = selected === `transition-${i}`; return <g key={`line-${i}`}><path d={d} fill="none" stroke={active ? BLUE : "#94A3B8"} strokeWidth={active ? 2.4 : 1.7} markerEnd={active ? "url(#wf-arrow-selected)" : "url(#wf-arrow)"}/><foreignObject x={midX - 55} y={(a.y + b.y) / 2 - 14} width="110" height="28"><button type="button" onClick={() => onSelect(`transition-${i}`)} className={`pointer-events-auto mx-auto block max-w-[108px] truncate rounded-full border bg-white px-2.5 py-1 text-[9.5px] shadow-sm ${active ? "border-[#1B66EA] text-[#1B66EA]" : "border-slate-200 text-slate-600"}`}>{t.name || "Transition"}</button></foreignObject></g>; })}
      </svg>
      {states.map((s, i) => <div key={`state-${i}`} onPointerDown={(e) => { const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return; setDrag({ index: i, dx: (e.clientX - rect.left) / zoom - positions[i].x, dy: (e.clientY - rect.top) / zoom - positions[i].y }); }} style={{ left: positions[i].x * zoom, top: positions[i].y * zoom, transform: `scale(${zoom})`, transformOrigin: "top left" }} className="absolute z-20 w-[250px] select-none">
        <button type="button" onClick={() => onSelect(`state-${i}`)} className={`w-full rounded-xl border bg-white p-4 text-start shadow-[0_3px_12px_rgba(15,23,42,.08)] ${selected === `state-${i}` ? "border-[#1B66EA] ring-2 ring-[#1B66EA]/10" : "border-slate-200"}`}>
          <div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${i === 0 ? "bg-[#EEF4FF] text-[#1B66EA]" : "bg-slate-100 text-slate-600"}`}>{i === 0 ? "1" : i + 1}</span><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold uppercase tracking-[.13em] text-slate-400">State</div><div className="mt-0.5 truncate text-[13px] font-semibold text-slate-900">{s.name || "Untitled state"}</div><div className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-slate-500">{s.description || "Add a description"}</div></div>{s.terminal && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">FINAL</span>}</div>
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(`state-${i}`); }} className="absolute -bottom-3 left-1/2 z-30 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-[#1B66EA] hover:text-[#1B66EA]">＋</button>
      </div>)}
      <div className="absolute bottom-8 left-8 z-30 w-[210px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"><div className="border-b border-slate-100 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">Workflow map</div><div className="relative h-[105px] bg-[#F8FAFC]"><div className="absolute inset-3 rounded border border-slate-200 bg-white">{states.map((s, i) => <span key={i} className={`absolute h-2 w-3 rounded-sm ${s.terminal ? "bg-emerald-400" : "bg-[#1B66EA]"}`} style={{ left: `${Math.min(88, (positions[i].x / width) * 100)}%`, top: `${Math.min(88, (positions[i].y / height) * 100)}%` }}/>)}</div></div></div>
    </div>
  </div>;
}

export default function WorkflowBuilderPage() {
  const { label } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const urlId = params.get("id");
  const [workflowId, setWorkflowId] = useState<string | null>(urlId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(params.get("name") || "");
  const [description, setDescription] = useState(params.get("description") || "");
  const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL">(params.get("mode") === "MANUAL" ? "MANUAL" : "AUTOMATIC");
  const [resourceType, setResourceType] = useState<"FILE" | "FOLDER">(params.get("resourceType") === "FOLDER" ? "FOLDER" : "FILE");
  const [triggers, setTriggers] = useState<string[]>(["upload"]);
  const [fields, setFields] = useState<WorkflowField[]>([]);
  const [states, setStates] = useState<StateDraft[]>([{ name: "Start", description: "Workflow entry point", terminal: false }, { name: "Completed", description: "", terminal: true }]);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([transitionDefaults(0, 1, 1)]);
  const [positions, setPositionsState] = useState<Position[]>(DEFAULT_POSITIONS.slice(0, 2));
  const [selected, setSelected] = useState("state-0");
  const [phase, setPhase] = useState<Phase>("during");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(urlId));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldDraft, setFieldDraft] = useState<WorkflowField | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);

  const setPositions = (next: Position[]) => { setPositionsState(next); if (typeof window !== "undefined" && workflowId) localStorage.setItem(`workflow-layout:${workflowId}`, JSON.stringify(next)); };

  useEffect(() => {
    if (!urlId) return;
    void getWorkflow(urlId).then((w: Workflow) => {
      setWorkflowId(w.id); setName(w.name); setDescription(w.description || ""); setMode(w.mode); setResourceType(w.resourceType);
      const tv = w.steps.find((s) => s.kind === "TRIGGER")?.config.value;
      if (Array.isArray(tv)) setTriggers(tv.map(String)); else if (typeof tv === "string") setTriggers([tv]);
      const fv = w.steps.find((s) => s.kind === "WORKFLOW_FIELDS")?.config.value;
      if (Array.isArray(fv)) setFields(fv as WorkflowField[]);
      if (w.states.length) setStates(w.states.map((s) => ({ name: s.name, description: s.description || "", terminal: s.terminal })));
      if (w.transitions.length) setTransitions(w.transitions.map((t) => { const phases = normalizePhaseActions(t.actions); return { from: w.states.findIndex((s) => s.id === t.fromStateId), to: w.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description || "", trigger: t.trigger || "", condition: t.condition || "any", execution: t.trigger === "manual" ? "MANUAL" : "AUTOMATIC", ...phases }; }));
      const saved = typeof window !== "undefined" ? localStorage.getItem(`workflow-layout:${w.id}`) : null;
      if (saved) { try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setPositionsState(parsed); } catch { /* ignore */ } }
    }).catch(() => setError(label("error.generic"))).finally(() => setLoading(false));
  }, [urlId, label]);

  useEffect(() => { setPositionsState((old) => states.map((_, i) => old[i] || DEFAULT_POSITIONS[i % DEFAULT_POSITIONS.length] || { x: 120 + (i % 3) * 310, y: 120 + Math.floor(i / 3) * 240 })); }, [states.length]);
  useEffect(() => { if (!urlId && mode === "MANUAL") setTransitions((v) => v.map((t, i) => i === 0 ? { ...t, execution: "MANUAL" } : t)); }, [mode, urlId]);

  const selectedStateIndex = selected.startsWith("state-") ? Number(selected.split("-")[1]) : -1;
  const selectedTransitionIndex = selected.startsWith("transition-") ? Number(selected.split("-")[1]) : -1;
  const selectedTransition = selectedTransitionIndex >= 0 ? transitions[selectedTransitionIndex] : null;
  const activeActions = selectedTransition ? selectedTransition[phase] : [];
  const updateTransition = (i: number, patch: Partial<TransitionDraft>) => setTransitions((v) => v.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  const conditionLabel = (condition: unknown) => typeof condition === "string" ? condition : "Custom conditions";

  const addState = () => { if (states.length >= 20) return; const next = [...states, { name: `State ${states.length + 1}`, description: "", terminal: false }]; setStates(next); setPositions([...positions, DEFAULT_POSITIONS[states.length % DEFAULT_POSITIONS.length] || { x: 120, y: 120 }]); setSelected(`state-${next.length - 1}`); };
  const removeState = (i: number) => { if (states.length <= 1 || i === 0) return; const nextStates = states.filter((_, idx) => idx !== i); const nextTransitions = transitions.filter((t) => t.from !== i && t.to !== i).map((t) => ({ ...t, from: t.from > i ? t.from - 1 : t.from, to: t.to > i ? t.to - 1 : t.to })); setStates(nextStates); setTransitions(nextTransitions); setPositions(positions.filter((_, idx) => idx !== i)); setSelected("state-0"); };
  const addTransition = () => { if (states.length < 2) { setError("Add at least two states before creating a transition."); return; } const from = Math.max(0, states.length - 2), to = states.length - 1; const next = [...transitions, transitionDefaults(from, to, transitions.length + 1)]; setTransitions(next); setSelected(`transition-${next.length - 1}`); setError(""); };
  const addTransitionFrom = (from: number) => { const to = states.findIndex((_, i) => i !== from && i === Math.min(from + 1, states.length - 1)); const safeTo = to >= 0 && to !== from ? to : (from === 0 ? 1 : 0); const next = [...transitions, transitionDefaults(from, safeTo, transitions.length + 1)]; setTransitions(next); setSelected(`transition-${next.length - 1}`); };

  const addField = (type: string) => { const base = { id: `${type}_${Date.now().toString(36)}`, name: "", description: "", type, required: false }; setFieldDraft(base); };
  const saveField = () => { if (!fieldDraft?.name.trim()) return; setFields((v) => [...v, { ...fieldDraft, name: fieldDraft.name.trim() }]); setFieldDraft(null); };
  const removeField = (id: string) => setFields((v) => v.filter((f) => f.id !== id));

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (!name.trim()) issues.push("Workflow name is required.");
    if (!states.length) issues.push("Add at least one state.");
    if (!states.some((s) => s.terminal)) issues.push("Add at least one final state.");
    if (mode === "AUTOMATIC" && triggers.length === 0) issues.push("Select at least one starting trigger.");
    states.forEach((s, i) => { if (!s.name.trim()) issues.push(`State ${i + 1} needs a name.`); });
    transitions.forEach((t, i) => { if (t.from === t.to) issues.push(`Transition ${i + 1} cannot point to the same state.`); if (!t.name.trim()) issues.push(`Transition ${i + 1} needs a name.`); if (t.before.length + t.during.length + t.after.length > 15) issues.push(`Transition ${i + 1} has too many actions.`); });
    return issues;
  }, [name, states, transitions, mode, triggers]);

  const buildPayload = (status: "DRAFT" | "ACTIVE") => ({
    name: name.trim(), description: description.trim(), mode, resourceType, trigger: mode === "MANUAL" ? "manual" : triggers,
    condition: "any", actions: [], status, fields,
    states, transitions: transitions.map((t) => ({ from: t.from, to: t.to, name: t.name.trim(), description: t.description, trigger: t.execution === "MANUAL" ? "manual" : t.trigger || undefined, condition: t.condition, actions: { before: t.before, during: t.during, after: t.after } })),
  });

  const save = async (status: "DRAFT" | "ACTIVE") => {
    if (busy) return; setError(""); setMessage("");
    if (validation.length && status === "ACTIVE") { setError(validation[0]); setStep(3); return; }
    if (!name.trim()) { setError(label("workflows.nameRequired")); setStep(1); return; }
    setBusy(true);
    try { const saved = workflowId ? await updateWorkflow(workflowId, buildPayload(status)) : await createWorkflow(buildPayload(status)); setWorkflowId(saved.id); setMessage(status === "ACTIVE" ? "Workflow activated successfully." : "Draft saved successfully."); if (status === "ACTIVE") window.setTimeout(() => router.push("/files/workflows"), 700); } catch (e) { setError(e instanceof Error ? e.message : label("error.generic")); } finally { setBusy(false); }
  };

  const exportSpec = () => { const blob = new Blob([JSON.stringify(buildPayload("DRAFT"), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name || "workflow"}.json`; a.click(); URL.revokeObjectURL(a.href); };
  const importSpec = async (file: File) => { try { const spec = JSON.parse(await file.text()) as Record<string, unknown>; setName(String(spec.name ?? "Imported workflow")); setDescription(String(spec.description ?? "")); setMode(spec.mode === "MANUAL" ? "MANUAL" : "AUTOMATIC"); setResourceType(spec.resourceType === "FOLDER" ? "FOLDER" : "FILE"); if (Array.isArray(spec.trigger)) setTriggers(spec.trigger.map(String)); if (Array.isArray(spec.fields)) setFields(spec.fields as WorkflowField[]); if (Array.isArray(spec.states)) setStates(spec.states as StateDraft[]); if (Array.isArray(spec.transitions)) setTransitions((spec.transitions as Record<string, unknown>[]).map((t, i) => { const phases = normalizePhaseActions(t.actions); return { from: Number(t.from ?? 0), to: Number(t.to ?? 1), name: String(t.name ?? `Transition ${i + 1}`), description: String(t.description ?? ""), trigger: String(t.trigger ?? ""), condition: t.condition ?? "any", execution: t.trigger === "manual" ? "MANUAL" : "AUTOMATIC", ...phases }; })); setMessage("Workflow JSON imported as draft."); } catch { setError("Invalid workflow JSON file."); } };

  if (loading) return <div className="p-8 text-[13px] text-slate-500">Loading…</div>;

  return <div className="flex min-h-0 flex-1 bg-white">
    <SecondarySidebar section="workflows" />
    <main className="min-w-0 flex-1 overflow-hidden">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex min-w-0 items-center gap-3"><Link href="/files/workflows" className="text-slate-500 hover:text-slate-900">‹</Link><div className="min-w-0"><div className="truncate text-[14px] font-semibold text-slate-900">{name || "Create workflow"} {mode === "MANUAL" && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">Manual</span>}</div></div></div>
        <div className="flex items-center gap-1.5"><label className="cursor-pointer rounded-md border border-slate-200 px-2.5 py-1.5 text-[10.5px] text-slate-600 hover:bg-slate-50">Import JSON<input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSpec(f); e.currentTarget.value = ""; }}/></label><button type="button" onClick={exportSpec} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10.5px] text-slate-600">Export JSON</button><button disabled={busy} type="button" onClick={() => void save("DRAFT")} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10.5px] font-medium text-slate-700">Save draft</button><button disabled={busy} type="button" onClick={() => setActivationOpen(true)} className="rounded-md bg-[#1B66EA] px-4 py-1.5 text-[10.5px] font-semibold text-white">Activate</button></div>
      </header>
      <div className="flex h-[calc(100vh-56px)] min-h-0 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-slate-200 bg-white"><div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[11px] font-medium"><button type="button" onClick={() => setStep(1)} className={`rounded-full px-4 py-2 ${step === 1 ? "bg-emerald-600 text-white shadow-sm" : "text-slate-700"}`}><b className="mr-1">1</b> Configure fields</button><button type="button" onClick={() => setStep(2)} className={`rounded-full px-4 py-2 ${step === 2 ? "bg-emerald-600 text-white shadow-sm" : "text-slate-700"}`}><b className="mr-1">2</b> Design workflow</button><button type="button" onClick={() => setStep(3)} className={`rounded-full px-4 py-2 ${step === 3 ? "bg-emerald-600 text-white shadow-sm" : "text-slate-700"}`}><b className="mr-1">3</b> Review</button></div><button type="button" onClick={() => setStep(1)} className="absolute right-5 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div>
        {error && <div className="mx-5 mt-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
        {message && <div className="mx-5 mt-2 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">{message}</div>}

        {step === 1 && <div className="flex min-h-0 flex-1 flex-col bg-[#F7F7F7]">
          <div className="flex min-h-0 flex-1 gap-4 p-5"><aside className="w-[365px] shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6"><p className="text-[12px] leading-5 text-slate-600">Create custom workflow fields by dragging and dropping them or clicking the + icon.</p><div className="mt-5 space-y-3">{FIELD_TYPES.map(([v, l, icon]) => <button key={v} type="button" onClick={() => addField(v)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 text-start hover:border-[#1B66EA] hover:bg-[#F8FBFF]"><span className="flex items-center gap-3 text-[13px] font-medium text-slate-800"><span className="w-6 text-center text-slate-500">{icon}</span>{l}</span><span className="text-[19px] font-light text-[#1B66EA]">＋</span></button>)}</div></aside>
            <section className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-7"><div className="mx-auto max-w-[920px]"><h2 className="text-[18px] font-semibold text-slate-900">Workflow Fields</h2><p className="mt-1 text-[12px] leading-5 text-slate-500">Workflow fields collect feedback, assignees, approvers, and other information during transitions.</p><div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">{fields.length === 0 ? <div className="p-12 text-center text-[12px] text-slate-400">No custom fields yet. Choose a field type from the left.</div> : fields.map((f) => <div key={f.id} className="flex items-center gap-4 p-4"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-600">{FIELD_TYPES.find((x) => x[0] === f.type)?.[2] ?? "□"}</div><div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-slate-900">{f.name}</div><div className="mt-0.5 text-[10.5px] text-slate-500">{FIELD_TYPES.find((x) => x[0] === f.type)?.[1]}{f.required ? " · Mandatory" : ""}{f.description ? ` · ${f.description}` : ""}</div></div><button type="button" onClick={() => setFieldDraft(f)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px]">Edit</button><button type="button" onClick={() => removeField(f.id)} className="rounded-md px-2 py-1.5 text-[10px] text-red-600">Delete</button></div>)}</div><div className="mt-5 text-[10px] text-slate-400">* Drag or add custom fields here</div></div></section>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><button type="button" onClick={() => router.push("/files/workflows")} className="rounded-full border border-slate-300 px-5 py-2 text-[12px]">Back</button><button type="button" onClick={() => setStep(2)} className="rounded-full bg-[#0B8F55] px-5 py-2 text-[12px] font-semibold text-white">Go to next step</button></div>
        </div>}

        {step === 2 && <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1"><aside className="w-[285px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Workflow details</div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (Optional)" rows={3} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/><div className="mt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Starting trigger</div><div className="mt-2 space-y-1.5">{mode === "MANUAL" ? <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">Manual trigger — users start this workflow from a file or folder.</div> : TRIGGERS.map(([v, l]) => <label key={v} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={triggers.includes(v)} onChange={(e) => setTriggers((x) => e.target.checked ? [...x, v].slice(0, 5) : x.filter((t) => t !== v))} className="wd-check"/>{l}</label>)}</div><div className="mt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Workflow type</div><div className="mt-2 grid grid-cols-2 gap-1.5">{(["FILE", "FOLDER"] as const).map((v) => <button type="button" key={v} onClick={() => setResourceType(v)} className={`rounded-lg border px-2 py-2 text-[10.5px] ${resourceType === v ? "border-[#1B66EA] bg-[#EEF4FF] text-[#1B66EA]" : "border-slate-200 text-slate-600"}`}>{v === "FILE" ? "File-based" : "Folder-based"}</button>)}</div><div className="mt-5 rounded-lg bg-[#F7FAFF] p-3 text-[10.5px] leading-5 text-slate-500">A transition links states. Select a state or transition on the canvas to configure it in the right panel.</div></aside>
            <section className="min-w-0 flex-1"><WorkflowCanvas states={states} transitions={transitions} positions={positions} setPositions={setPositions} selected={selected} onSelect={setSelected} onAddTransition={addTransition} zoom={zoom} setZoom={setZoom}/></section>
            <aside className="w-[365px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Configuration</div></div>
              <div className="p-5">
                {selectedStateIndex >= 0 && states[selectedStateIndex] && <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-[16px] font-semibold text-slate-900">State</h3><button type="button" disabled={selectedStateIndex === 0} onClick={() => removeState(selectedStateIndex)} className="text-[10.5px] text-red-600 disabled:opacity-30">Delete</button></div><label className="block text-[10.5px] font-medium text-slate-600">State name<input value={states[selectedStateIndex].name} onChange={(e) => setStates((v) => v.map((s, i) => i === selectedStateIndex ? { ...s, name: e.target.value } : s))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><label className="block text-[10.5px] font-medium text-slate-600">Description<textarea value={states[selectedStateIndex].description} onChange={(e) => setStates((v) => v.map((s, i) => i === selectedStateIndex ? { ...s, description: e.target.value } : s))} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><label className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={states[selectedStateIndex].terminal} onChange={(e) => setStates((v) => v.map((s, i) => i === selectedStateIndex ? { ...s, terminal: e.target.checked } : s))}/> Mark as final state</label><div className="border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><h4 className="text-[12px] font-semibold">Outgoing transitions</h4><button type="button" onClick={() => addTransitionFrom(selectedStateIndex)} className="text-[11px] font-medium text-[#1B66EA]">＋ Add</button></div><div className="mt-2 space-y-1.5">{transitions.map((t, i) => t.from === selectedStateIndex && <button type="button" key={i} onClick={() => setSelected(`transition-${i}`)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-start hover:border-[#1B66EA]"><span className="text-[11px] font-medium">{t.name}</span><span className="text-[10px] text-slate-400">→ {states[t.to]?.name}</span></button>)}</div></div></div>}
                {selectedTransition && <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="text-[16px] font-semibold text-slate-900">Transition</h3><button type="button" onClick={() => { setTransitions((v) => v.filter((_, i) => i !== selectedTransitionIndex)); setSelected("state-0"); }} className="text-[10.5px] text-red-600">Delete</button></div><label className="block text-[10.5px] font-medium text-slate-600">Transition name<input value={selectedTransition.name} onChange={(e) => updateTransition(selectedTransitionIndex, { name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><label className="block text-[10.5px] font-medium text-slate-600">Description<textarea value={selectedTransition.description} onChange={(e) => updateTransition(selectedTransitionIndex, { description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><div className="grid grid-cols-2 gap-2"><label className="text-[10.5px] font-medium text-slate-600">From<select value={selectedTransition.from} onChange={(e) => updateTransition(selectedTransitionIndex, { from: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[11px]">{states.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label><label className="text-[10.5px] font-medium text-slate-600">To<select value={selectedTransition.to} onChange={(e) => updateTransition(selectedTransitionIndex, { to: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[11px]">{states.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label></div><div className="rounded-lg border border-slate-200 p-3"><div className="text-[10.5px] font-semibold text-slate-700">Execution</div><div className="mt-2 grid grid-cols-2 gap-1.5">{(["AUTOMATIC", "MANUAL"] as const).map((v) => <button type="button" key={v} onClick={() => updateTransition(selectedTransitionIndex, { execution: v })} className={`rounded-md border px-2 py-2 text-[10px] ${selectedTransition.execution === v ? "border-[#1B66EA] bg-[#EEF4FF] text-[#1B66EA]" : "border-slate-200 text-slate-600"}`}>{v === "AUTOMATIC" ? "Automatic" : "Manual"}</button>)}</div></div><label className="block text-[10.5px] font-medium text-slate-600">Trigger<select value={selectedTransition.trigger} onChange={(e) => updateTransition(selectedTransitionIndex, { trigger: e.target.value })} disabled={selectedTransition.execution === "MANUAL"} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px]"><option value="">Any matching event</option>{TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="block text-[10.5px] font-medium text-slate-600">Condition<select value={typeof selectedTransition.condition === "string" ? selectedTransition.condition : "any"} onChange={(e) => updateTransition(selectedTransitionIndex, { condition: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[11px]"><option value="any">Any resource</option><option value="PDF">PDF</option><option value="IMAGE">Image</option><option value="DOCUMENT">Document</option><option value="SPREADSHEET">Spreadsheet</option><option value="PRESENTATION">Presentation</option></select></label><div className="border-t border-slate-100 pt-4"><div className="flex gap-1 rounded-lg bg-slate-100 p-1">{(["before", "during", "after"] as Phase[]).map((p) => <button type="button" key={p} onClick={() => setPhase(p)} className={`flex-1 rounded-md px-2 py-2 text-[10.5px] font-medium capitalize ${phase === p ? "bg-white text-[#1B66EA] shadow-sm" : "text-slate-600"}`}>{p}</button>)}</div><p className="mt-3 text-[10.5px] leading-5 text-slate-500">{phase === "before" ? "Actions that run before the resource changes state." : phase === "during" ? "Collect feedback or execute transition actions while this transition is in progress." : "Actions that run after the resource reaches the next state."}</p><div className="mt-3"><ActionEditor actions={activeActions} onChange={(next) => updateTransition(selectedTransitionIndex, { [phase]: next } as Partial<TransitionDraft>)} resourceType={resourceType}/></div></div></div>}
                {selectedStateIndex < 0 && !selectedTransition && <div className="text-[12px] text-slate-500">Select a state or transition to configure it.</div>}
              </div>
            </aside>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-6 py-4"><button type="button" onClick={() => setStep(1)} className="rounded-full border border-slate-300 px-5 py-2 text-[12px]">Back</button><button type="button" onClick={() => setStep(3)} className="rounded-full bg-[#0B8F55] px-5 py-2 text-[12px] font-semibold text-white">Go to next step</button></div>
        </div>}

        {step === 3 && <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F7F7] p-7"><div className="mx-auto max-w-[980px] rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-[20px] font-semibold text-slate-900">Review workflow</h2><p className="mt-1 text-[12px] text-slate-500">Check the configuration before enabling the workflow.</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${validation.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{validation.length ? `${validation.length} issue${validation.length > 1 ? "s" : ""}` : "Ready to activate"}</span></div><div className="mt-6 grid grid-cols-2 gap-4"><div className="rounded-xl border border-slate-200 p-4"><div className="text-[10px] uppercase tracking-wider text-slate-400">Workflow</div><div className="mt-1 text-[14px] font-semibold">{name || "Untitled"}</div><div className="mt-1 text-[11px] text-slate-500">{mode === "MANUAL" ? "Manual" : "Automatic"} · {resourceType === "FILE" ? "File-based" : "Folder-based"}</div></div><div className="rounded-xl border border-slate-200 p-4"><div className="text-[10px] uppercase tracking-wider text-slate-400">Configuration</div><div className="mt-1 text-[11px] text-slate-600">{fields.length} fields · {states.length} states · {transitions.length} transitions</div><div className="mt-1 text-[11px] text-slate-500">{mode === "MANUAL" ? "Manual start" : `${triggers.length} starting trigger${triggers.length === 1 ? "" : "s"}`}</div></div></div><div className="mt-5 rounded-xl border border-slate-200"><div className="border-b border-slate-100 px-4 py-3 text-[12px] font-semibold">Validation</div>{validation.length ? <div className="divide-y divide-slate-100">{validation.map((x, i) => <div key={i} className="flex gap-2 px-4 py-3 text-[11px] text-amber-700"><span>!</span>{x}</div>)}</div> : <div className="px-4 py-5 text-[11px] text-emerald-700">All required configuration checks passed. You can activate this workflow.</div>}</div><div className="mt-5 rounded-xl bg-[#F7FAFF] p-4 text-[11px] leading-5 text-slate-600">Activation creates a live workflow. Automatic workflows respond to matching file/folder events; manual workflows appear as available actions to users.</div></div></div>}
      </div>
      {fieldDraft && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"><div className="w-[min(620px,94vw)] rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-6 py-4"><h2 className="text-[17px] font-semibold">Create custom field</h2><p className="mt-1 text-[11px] text-slate-500">Field type: {FIELD_TYPES.find((x) => x[0] === fieldDraft.type)?.[1]}</p></div><div className="space-y-3 p-6"><label className="block text-[11px] font-medium">Field name<input autoFocus value={fieldDraft.name} onChange={(e) => setFieldDraft({ ...fieldDraft, name: e.target.value })} placeholder="Enter field name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><label className="block text-[11px] font-medium">Field description<textarea value={fieldDraft.description} onChange={(e) => setFieldDraft({ ...fieldDraft, description: e.target.value })} placeholder="Add field description" rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label>{["single", "multi"].includes(fieldDraft.type) && <label className="block text-[11px] font-medium">Maximum characters<input type="number" min={1} value={fieldDraft.max ?? ""} onChange={(e) => setFieldDraft({ ...fieldDraft, max: e.target.value ? Number(e.target.value) : undefined })} placeholder="Set maximum characters" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label>}{fieldDraft.type === "choice" && <label className="block text-[11px] font-medium">Choices<input value={(fieldDraft.options ?? []).join(", ")} onChange={(e) => setFieldDraft({ ...fieldDraft, options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Approved, Rejected, Needs changes" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label>}<label className="block text-[11px] font-medium">Default value<input value={fieldDraft.defaultValue ?? ""} onChange={(e) => setFieldDraft({ ...fieldDraft, defaultValue: e.target.value })} placeholder="Specify a default value" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[12px]"/></label><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={fieldDraft.required} onChange={(e) => setFieldDraft({ ...fieldDraft, required: e.target.checked })}/> Make this custom field mandatory</label></div><div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><button type="button" onClick={() => setFieldDraft(null)} className="rounded-full border border-slate-300 px-4 py-2 text-[11px]">Cancel</button><button type="button" disabled={!fieldDraft.name.trim()} onClick={saveField} className="rounded-full bg-[#0B8F55] px-5 py-2 text-[11px] font-semibold text-white disabled:opacity-40">Create</button></div></div></div>}
      {activationOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"><div className="w-[min(560px,94vw)] rounded-xl bg-white p-7 shadow-2xl"><h2 className="text-[18px] font-semibold text-slate-900">Activate Workflow?</h2><p className="mt-3 text-[12px] leading-5 text-slate-600">You are about to activate the <b>{name || "new workflow"}</b> workflow. Review the configuration carefully before enabling it.</p>{validation.length > 0 && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">Activation is blocked until the validation issues are resolved.</div>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setActivationOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-[11px]">Cancel</button><button type="button" disabled={busy || validation.length > 0} onClick={() => { setActivationOpen(false); void save("ACTIVE"); }} className="rounded-md bg-[#1B66EA] px-5 py-2 text-[11px] font-semibold text-white disabled:opacity-40">Activate</button></div></div></div>}
    </main>
  </div>;
}
