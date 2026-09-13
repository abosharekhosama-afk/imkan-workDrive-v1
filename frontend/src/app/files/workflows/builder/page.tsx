"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SecondarySidebar } from "@/components/layout/secondary-sidebar";
import { useLocale } from "@/components/locale-provider";
import { createWorkflow, getWorkflow, updateWorkflow, type Workflow } from "@/lib/api/workflows";

const BLUE = "#1B66EA";
type Action = { type: string; config: Record<string, unknown> };
type StateDraft = { name: string; description: string; terminal: boolean };
type TransitionDraft = { from: number; to: number; name: string; description?: string; trigger?: string; condition?: unknown; actions: Action[] };

const TRIGGERS = [
  ["upload", "File uploaded"], ["create", "File/folder created"], ["move", "File/folder moved"],
  ["copy", "File/folder copied"], ["rename", "File renamed"], ["delete", "File moved to trash"], ["properties_updated", "Properties updated"], ["ready", "File marked as ready"],
] as const;
const ACTIONS = [
  ["notify", "System notification"], ["move", "Move"], ["copy", "Copy"], ["generate_link", "Generate link"],
  ["share", "Share"], ["request_approval", "Request approval"], ["favorite", "Add to favorites"], ["tag", "Add tag"], ["mark_final", "Mark as final"], ["create_folder", "Create folder"],
] as const;

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function WorkflowBuilderPage() {
  const { label } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const urlId = params.get("id");
  const [workflowId, setWorkflowId] = useState<string | null>(urlId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL">("AUTOMATIC");
  const [resourceType, setResourceType] = useState<"FILE" | "FOLDER">("FILE");
  const [triggers, setTriggers] = useState<string[]>(["upload"]);
  const [condition, setCondition] = useState("any");
  const [extension, setExtension] = useState("");
  const [actions, setActions] = useState<Action[]>([{ type: "notify", config: {} }]);
  const [states, setStates] = useState<StateDraft[]>([
    { name: "Start", description: "Workflow entry point", terminal: false },
    { name: "Completed", description: "", terminal: true },
  ]);
  const [transitions, setTransitions] = useState<TransitionDraft[]>([{ from: 0, to: 1, name: "Complete", actions: [{ type: "notify", config: {} }] }]);
  const [selectedNode, setSelectedNode] = useState<string>("trigger");
  const [loading, setLoading] = useState(Boolean(urlId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draggedAction, setDraggedAction] = useState<number | null>(null);

  useEffect(() => {
    if (!urlId) return;
    void getWorkflow(urlId).then((w: Workflow) => {
      setName(w.name); setDescription(w.description || ""); setMode(w.mode); setResourceType(w.resourceType);
      const tv = w.steps.find((s) => s.kind === "TRIGGER")?.config.value;
      setTriggers(Array.isArray(tv) ? tv.map(String) : [String(tv || "upload")]);
      const cv = w.steps.find((s) => s.kind === "CONDITION")?.config.value;
      if (typeof cv === "string") setCondition(cv); else if (cv && typeof cv === "object" && "extension" in (cv as Record<string, unknown>)) setExtension(String((cv as Record<string, unknown>).extension ?? ""));
      const av = w.steps.find((s) => s.kind === "ACTIONS")?.config.value;
      if (Array.isArray(av)) setActions(av as Action[]);
      if (w.states.length) setStates(w.states.map((s) => ({ name: s.name, description: s.description || "", terminal: s.terminal })));
      if (w.transitions.length) {
        setTransitions(w.transitions.map((t) => ({ from: w.states.findIndex((s) => s.id === t.fromStateId), to: w.states.findIndex((s) => s.id === t.toStateId), name: t.name, description: t.description || "", trigger: t.trigger || undefined, condition: t.condition || undefined, actions: t.actions || [] })));
      }
    }).catch(() => setError(label("error.generic"))).finally(() => setLoading(false));
  }, [urlId, label]);

  const conditionValue = useMemo(() => extension.trim() ? { all: [condition === "any" ? "any" : condition, { extension: extension.trim() }] } : condition, [condition, extension]);

  const save = async (status: "DRAFT" | "ACTIVE") => {
    if (busy) return;
    if (!name.trim()) { setError(label("workflows.nameRequired")); return; }
    if (!states.length || !states.some((s) => s.terminal)) { setError("Add at least one terminal state."); return; }
    if (actions.length > 5) { setError("A state or transition can contain at most 5 actions."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = { name: name.trim(), description, mode, resourceType, trigger: mode === "MANUAL" ? "manual" : triggers, condition: conditionValue, actions, status, states, transitions };
      const saved = workflowId ? await updateWorkflow(workflowId, payload) : await createWorkflow(payload);
      setWorkflowId(saved.id); setMessage(status === "ACTIVE" ? "Workflow activated" : "Draft saved");
      if (status === "ACTIVE") window.setTimeout(() => router.push("/files/workflows"), 500);
    } catch (e) { setError(e instanceof Error ? e.message : label("error.generic")); } finally { setBusy(false); }
  };

  const addAction = (type: string) => { if (actions.length >= 5) return; setActions((v) => [...v, { type, config: {} }]); };
  const removeAction = (i: number) => setActions((v) => v.filter((_, idx) => idx !== i));
  const moveAction = (from: number, to: number) => setActions((v) => { if (to < 0 || to >= v.length) return v; const next = [...v]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  const addState = () => { if (states.length >= 20) return; setStates((v) => [...v, { name: `State ${v.length + 1}`, description: "", terminal: false }]); };
  const removeState = (i: number) => { if (states.length <= 1) return; setStates((v) => v.filter((_, idx) => idx !== i)); setTransitions((v) => v.filter((t) => t.from !== i && t.to !== i).map((t) => ({ ...t, from: t.from > i ? t.from - 1 : t.from, to: t.to > i ? t.to - 1 : t.to }))); };
  const moveState = (from: number, to: number) => { if (to < 0 || to >= states.length) return; setStates((v) => { const next=[...v]; const [item]=next.splice(from,1); next.splice(to,0,item); return next; }); setTransitions((v) => v.map((t) => ({ ...t, from: t.from===from?to:t.from===to?from:t.from, to: t.to===from?to:t.to===to?from:t.to }))); };
  const addTransition = () => { if (states.length < 2) return; const from = Math.max(0, states.length - 2), to = states.length - 1; setTransitions((v) => [...v, { from, to, name: `Transition ${v.length + 1}`, actions: [] }]); };
  const updateActionConfig = (i: number, key: string, value: unknown) => setActions((v) => v.map((a, idx) => idx === i ? { ...a, config: { ...a.config, [key]: value } } : a));

  const exportSpec = () => {
    const spec = { version: 1, name, description, mode, resourceType, trigger: triggers, condition: conditionValue, actions, states, transitions };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name || "workflow"}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importSpec = async (file: File) => {
    try { const spec = JSON.parse(await file.text()) as Record<string, unknown>; setName(String(spec.name ?? "Imported workflow")); setDescription(String(spec.description ?? "")); setMode(spec.mode === "MANUAL" ? "MANUAL" : "AUTOMATIC"); setResourceType(spec.resourceType === "FOLDER" ? "FOLDER" : "FILE"); setTriggers(Array.isArray(spec.trigger) ? spec.trigger.map(String) : [String(spec.trigger ?? "upload")]); setCondition(typeof spec.condition === "string" ? spec.condition : "any"); if (Array.isArray(spec.actions)) setActions(spec.actions as Action[]); if (Array.isArray(spec.states)) setStates(spec.states as StateDraft[]); if (Array.isArray(spec.transitions)) setTransitions(spec.transitions as TransitionDraft[]); setMessage("Workflow JSON imported as draft"); } catch { setError("Invalid workflow JSON file."); }
  };

  if (loading) return <div className="p-8 text-[13px] text-slate-500">Loading…</div>;

  return <div className="flex min-h-0 flex-1 bg-[#F7F9FC]">
    <SecondarySidebar section="workflows" />
    <main className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <div className="flex items-center gap-3"><Link href="/files/workflows" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">←</Link><div><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{label("workflows.builder")}</div><h1 className="mt-0.5 text-[16px] font-semibold text-slate-900">{workflowId ? label("workflows.editTitle") : label("workflows.newTitle")}</h1></div></div>
        <div className="flex items-center gap-2"><label className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 text-[11.5px] text-slate-600 hover:bg-slate-50">Import JSON<input type="file" accept="application/json" className="hidden" onChange={e=>{const f=e.target.files?.[0]; if(f) void importSpec(f); e.currentTarget.value="";}} /></label><button type="button" onClick={exportSpec} className="rounded-md border border-slate-200 px-3 py-2 text-[11.5px] text-slate-600 hover:bg-slate-50">Export JSON</button><button disabled={busy} type="button" onClick={()=>void save("DRAFT")} className="rounded-md border border-slate-200 px-3 py-2 text-[11.5px] font-medium text-slate-700 disabled:opacity-50">{label("workflows.saveDraft")}</button><button disabled={busy} type="button" onClick={()=>void save("ACTIVE")} className="rounded-md px-4 py-2 text-[11.5px] font-semibold text-white disabled:opacity-50" style={{background:BLUE}}>{label("workflows.activate")}</button></div>
      </header>
      <div className="mx-auto max-w-[1500px] p-5">
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">{error}</div>}
        {message && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12px] text-emerald-700">{message}</div>}
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_330px]">
          <aside className="space-y-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-[12px] font-semibold text-slate-900">Workflow details</h2><input value={name} onChange={e=>setName(e.target.value)} placeholder={label("workflows.namePlaceholder")} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-[#1B66EA]"/><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" rows={3} className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-[#1B66EA]"/></section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-[12px] font-semibold">Workflow type</h2><div className="mt-3 grid grid-cols-2 gap-2">{(["AUTOMATIC","MANUAL"] as const).map(v=><button key={v} type="button" onClick={()=>setMode(v)} className={`rounded-lg border px-3 py-2 text-[11px] ${mode===v?"border-[#1B66EA] bg-[#EEF4FF] text-[#1B66EA]":"border-slate-200 text-slate-600"}`}>{v}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2">{(["FILE","FOLDER"] as const).map(v=><button key={v} type="button" onClick={()=>setResourceType(v)} className={`rounded-lg border px-3 py-2 text-[11px] ${resourceType===v?"border-[#1B66EA] bg-[#EEF4FF] text-[#1B66EA]":"border-slate-200 text-slate-600"}`}>{v}</button>)}</div></section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-[12px] font-semibold">Starting triggers</h2><span className="text-[10px] text-slate-400">{triggers.length}/5</span></div>{mode==="MANUAL"?<div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">Manual workflows start from a file or folder action.</div>:<div className="mt-3 space-y-1.5">{TRIGGERS.filter(([v])=>resourceType==="FILE" || !["rename","delete","ready"].includes(v)).map(([v,l])=><label key={v} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"><input type="checkbox" checked={triggers.includes(v)} onChange={e=>setTriggers(x=>e.target.checked ? [...x,v].slice(0,5) : x.filter(t=>t!==v))}/><span className="text-[11.5px] text-slate-700">{l}</span></label>)}</div>}</section>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Design workflow</div><div className="mt-1 text-[12px] text-slate-500">Trigger → condition → states → transitions → actions</div></div>
            <div className="min-h-[650px] overflow-auto bg-[radial-gradient(#dbe4f0_1px,transparent_1px)] [background-size:18px_18px] p-8">
              <div className="mx-auto flex max-w-[760px] flex-col items-center gap-3">
                <button type="button" onClick={()=>setSelectedNode("trigger")} className={`w-full max-w-[560px] rounded-xl border bg-white p-4 text-start shadow-sm ${selectedNode==="trigger"?"border-[#1B66EA] ring-2 ring-[#1B66EA]/10":"border-slate-200"}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEF4FF] text-[#1B66EA]">⚡</span><div><div className="text-[10px] font-semibold uppercase tracking-wider text-[#1B66EA]">Trigger</div><div className="mt-0.5 text-[13px] font-semibold text-slate-900">{mode==="MANUAL"?"Manual start":triggers.map(t=>TRIGGERS.find(x=>x[0]===t)?.[1]??t).join(" • ")}</div></div></div></button>
                <div className="h-7 w-px bg-slate-300" />
                <button type="button" onClick={()=>setSelectedNode("condition")} className={`w-full max-w-[560px] rounded-xl border bg-white p-4 text-start shadow-sm ${selectedNode==="condition"?"border-[#1B66EA] ring-2 ring-[#1B66EA]/10":"border-slate-200"}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">◇</span><div><div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Condition</div><div className="mt-0.5 text-[13px] font-semibold text-slate-900">{condition === "any" ? "Any resource" : condition}{extension ? ` · .${extension}` : ""}</div></div></div></button>
                <div className="h-7 w-px bg-slate-300" />
                {states.map((state,i)=><div key={`${state.name}-${i}`} className="w-full max-w-[560px]"><button type="button" onClick={()=>setSelectedNode(`state-${i}`)} className={`w-full rounded-xl border bg-white p-4 text-start shadow-sm ${selectedNode===`state-${i}`?"border-[#1B66EA] ring-2 ring-[#1B66EA]/10":"border-slate-200"}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{i+1}</span><div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">State</div><div className="mt-0.5 text-[13px] font-semibold text-slate-900">{state.name}</div><div className="mt-0.5 text-[11px] text-slate-500">{state.description}</div></div></div>{state.terminal&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[9.5px] font-semibold text-emerald-700">FINAL</span>}</div></button>{i<states.length-1&&<div className="relative flex h-14 items-center justify-center"><div className="h-full w-px bg-slate-300"/><button type="button" onClick={()=>setSelectedNode(`transition-${i}`)} className="absolute rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] text-slate-600 shadow-sm hover:border-[#1B66EA]">{transitions.find(t=>t.from===i)?.name??"+ transition"}</button></div>}</div>)}
                <button type="button" onClick={addState} className="rounded-full border border-dashed border-slate-300 bg-white px-4 py-2 text-[11px] font-medium text-slate-600 hover:border-[#1B66EA] hover:text-[#1B66EA]">＋ Add state</button>
              </div>
            </div>
          </section>

          <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Configuration</div></div>
            <div className="p-4">
              {selectedNode === "trigger" && <div className="space-y-3"><h3 className="text-[13px] font-semibold">Starting trigger</h3><p className="text-[11px] leading-5 text-slate-500">Triggers are attached to the starting transition, matching the WorkDrive workflow model.</p>{mode!=="MANUAL"&&<div className="rounded-lg border border-slate-200 p-2.5 text-[11px] text-slate-600">{triggers.length} trigger(s) selected. Maximum 5.</div>}</div>}
              {selectedNode === "condition" && <div className="space-y-3"><h3 className="text-[13px] font-semibold">Trigger conditions</h3><select value={condition} onChange={e=>setCondition(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"><option value="any">Any type</option><option value="PDF">PDF</option><option value="IMAGE">Image</option><option value="DOCUMENT">Document</option><option value="SPREADSHEET">Spreadsheet</option><option value="PRESENTATION">Presentation</option></select><input value={extension} onChange={e=>setExtension(e.target.value.replace(/^\\./,""))} placeholder="Extension, e.g. pdf" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/></div>}
              {selectedNode.startsWith("state-") && (()=>{const i=Number(selectedNode.split("-")[1]); const st=states[i]; if(!st)return null; return <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold">State</h3><div className="flex items-center gap-2"><button type="button" disabled={i===0} onClick={()=>moveState(i,i-1)} className="text-[11px] text-slate-500 disabled:opacity-30">↑</button><button type="button" disabled={i===states.length-1} onClick={()=>moveState(i,i+1)} className="text-[11px] text-slate-500 disabled:opacity-30">↓</button><button type="button" onClick={()=>removeState(i)} className="text-[11px] text-red-600">Remove</button></div></div><input value={st.name} onChange={e=>setStates(v=>v.map((x,idx)=>idx===i?{...x,name:e.target.value}:x))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/><textarea value={st.description} onChange={e=>setStates(v=>v.map((x,idx)=>idx===i?{...x,description:e.target.value}:x))} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={st.terminal} onChange={e=>setStates(v=>v.map((x,idx)=>idx===i?{...x,terminal:e.target.checked}:x))}/> Final state</label></div>})()}
              {selectedNode.startsWith("transition-") && (()=>{const i=Number(selectedNode.split("-")[1]); const t=transitions.find(x=>x.from===i) ?? {from:i,to:Math.min(i+1,states.length-1),name:"",actions:[]}; const ti=transitions.indexOf(t); return <div className="space-y-3"><h3 className="text-[13px] font-semibold">Transition</h3><input value={t.name} onChange={e=>setTransitions(v=>v.map((x,idx)=>idx===ti?{...x,name:e.target.value}:x))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/><select value={t.to} onChange={e=>setTransitions(v=>v.map((x,idx)=>idx===ti?{...x,to:Number(e.target.value)}:x))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]">{states.map((x,idx)=><option key={idx} value={idx}>{x.name}</option>)}</select></div>})()}
              {selectedNode === "actions" && <div>actions</div>}
              {!selectedNode.startsWith("state-") && !selectedNode.startsWith("transition-") && selectedNode !== "trigger" && selectedNode !== "condition" && <p className="text-[12px] text-slate-500">Select a node to configure it.</p>}
              <div className="mt-6 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold">Actions</h3><span className="text-[10px] text-slate-400">{actions.length}/5</span></div><div className="mt-2 space-y-2">{actions.map((a,i)=><div key={`${a.type}-${i}`} draggable onDragStart={()=>setDraggedAction(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(draggedAction!==null){moveAction(draggedAction,i);setDraggedAction(null)}}} className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center gap-2"><span className="cursor-grab text-slate-400">⋮⋮</span><span className="flex-1 text-[11.5px] font-medium">{ACTIONS.find(x=>x[0]===a.type)?.[1]??a.type}</span><button type="button" onClick={()=>removeAction(i)} className="text-slate-400 hover:text-red-600">×</button></div>{["move","copy"].includes(a.type)&&<input value={String(a.config.destinationFolderId??"")} onChange={e=>updateActionConfig(i,"destinationFolderId",e.target.value)} placeholder="Destination folder ID" className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/>}{a.type==="tag"&&<input value={String(a.config.name??"")} onChange={e=>updateActionConfig(i,"name",e.target.value)} placeholder="Tag name" className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/>}{["share","notify"].includes(a.type)&&<input value={Array.isArray(a.config.userIds)?a.config.userIds.join(","):String(a.config.userIds??"")} onChange={e=>updateActionConfig(i,"userIds",e.target.value.split(",").map(x=>x.trim()).filter(Boolean))} placeholder={a.type==="share"?"User IDs, comma separated":"Recipient user IDs"} className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/>}{a.type==="notify"&&<input value={String(a.config.message??"")} onChange={e=>updateActionConfig(i,"message",e.target.value)} placeholder="Notification message" className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/>}{a.type==="share"&&<select value={String(a.config.permission??"VIEW")} onChange={e=>updateActionConfig(i,"permission",e.target.value)} className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"><option value="VIEW">View</option><option value="COMMENT">Comment</option><option value="EDIT">Edit</option></select>}{a.type==="request_approval"&&<input value={String(a.config.userId??"")} onChange={e=>updateActionConfig(i,"userId",e.target.value)} placeholder="Approver user ID" className="mt-2 w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/>}{a.type==="create_folder"&&<div className="mt-2 space-y-1.5"><input value={String(a.config.name??"")} onChange={e=>updateActionConfig(i,"name",e.target.value)} placeholder="Folder name" className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/><input value={String(a.config.parentFolderId??"")} onChange={e=>updateActionConfig(i,"parentFolderId",e.target.value)} placeholder="Parent folder ID (optional)" className="w-full rounded border border-slate-200 px-2 py-1.5 text-[11px]"/></div>}</div>)}</div><select value="" onChange={e=>{if(e.target.value){addAction(e.target.value);e.currentTarget.value=""}}} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px]"><option value="">+ Add action</option>{ACTIONS.filter(([v])=>resourceType==="FILE" || !["favorite","tag","mark_final","share","generate_link"].includes(v)).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  </div>;
}
