"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "./locale-provider";
import { getWorkflow, listWorkflowParticipantOptions, listWorkflows, startWorkflow, type Workflow, type WorkflowParticipantOptions } from "../lib/api/workflows";
import { Modal } from "./modal";

type Field = { id:string; name:string; description?:string; type:string; required?:boolean; defaultValue?:string; max?:number; options?:string[] };
type Rule = { type:"USER"|"GROUP"|"ROLE"; ids?:string[]; roles?:string[] };

// Backend stores transition actions by execution phase ({before,during,after}),
// while older workflows may store a plain array. Normalize both shapes before
// the UI inspects the actions so a valid workflow can never crash on `.some()`.
function transitionActions(raw: unknown): Workflow["transitions"][number]["actions"] {
  if (Array.isArray(raw)) return raw as Workflow["transitions"][number]["actions"];
  if (!raw || typeof raw !== "object") return [];
  const value = raw as Record<string, unknown>;
  return [value.before, value.during, value.after]
    .flatMap((phase) => Array.isArray(phase) ? phase : [])
    .filter((action): action is { type: string; config?: Record<string, unknown> } => !!action && typeof action === "object" && typeof (action as Record<string, unknown>).type === "string");
}

function hasStarterParticipants(workflow: Workflow): boolean {
  return workflow.transitions.some((transition) =>
    transitionActions(transition.actions).some((action) =>
      action.type === "request_approval" && action.config?.allowStarterParticipants === true
    )
  );
}

export function WorkflowPicker({resourceType,resourceId,resourceName,onClose,onStarted}:{resourceType:"FILE"|"FOLDER";resourceId:string;resourceName:string;onClose:()=>void;onStarted:()=>void}){
 const {label}=useLocale(); const [rows,setRows]=useState<Workflow[]>([]); const [loading,setLoading]=useState(true); const [detail,setDetail]=useState<Workflow|null>(null); const [options,setOptions]=useState<WorkflowParticipantOptions|null>(null); const [fieldValues,setFieldValues]=useState<Record<string,unknown>>({}); const [users,setUsers]=useState<string[]>([]); const [groups,setGroups]=useState<string[]>([]); const [roles,setRoles]=useState<string[]>([]); const [comment,setComment]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 useEffect(()=>{ void listWorkflows().then(r=>setRows(r.filter(x=>x.mode==="MANUAL"&&x.resourceType===resourceType&&x.status==="ACTIVE"))).catch(e=>setError(e instanceof Error?e.message:"Unable to load workflows")).finally(()=>setLoading(false)); },[resourceType]);
 const loadDetail=async(w:Workflow)=>{setError("");setOptions(null);setUsers([]);setGroups([]);setRoles([]);setComment("");try{
   // Always fetch the canonical workflow definition before starting it. The
   // collection endpoint can contain a lightweight/stale step projection,
   // while GET /workflows/:id returns the exact active definition that the
   // backend will validate at start time. This also guarantees required fields
   // are rendered before the POST /start request is made.
   const full=await getWorkflow(w.id);
   if(full.mode!=="MANUAL"||full.status!=="ACTIVE"||full.resourceType!==resourceType){
     throw new Error(resourceType==="FOLDER"?"This workflow is not available for folders.":"This workflow is not available for files.");
   }
   setDetail(full);
   const rawFields=full.steps.find(s=>s.kind==="WORKFLOW_FIELDS")?.config.value;
   const fields=Array.isArray(rawFields)?rawFields.filter((f):f is Field=>!!f&&typeof f==="object"&&typeof (f as Field).id==="string"&&typeof (f as Field).name==="string"):[];
   setFieldValues(Object.fromEntries(fields.filter(f=>f.defaultValue!==undefined).map(f=>[f.id,f.defaultValue])));

   const needsParticipants=hasStarterParticipants(full);
   if(needsParticipants){
     const opts=await listWorkflowParticipantOptions();
     setOptions(opts);
   }
  }catch(e){setDetail(null);setOptions(null);setError(e instanceof Error?e.message:"Unable to load workflow details");}};
 const fields=useMemo(()=>((detail?.steps.find(s=>s.kind==="WORKFLOW_FIELDS")?.config.value as Field[]|undefined)??[]),[detail]);
 const needsStarterParticipants=useMemo(()=>detail ? hasStarterParticipants(detail) : false,[detail]);
 const rules:Rule[]=[...(users.length?[{type:"USER" as const,ids:users}]:[]),...(groups.length?[{type:"GROUP" as const,ids:groups}]:[]),...(roles.length?[{type:"ROLE" as const,roles}]:[])];
 const start=async()=>{
  if(!detail)return;
  if(detail.mode!=="MANUAL"||detail.status!=="ACTIVE"||detail.resourceType!==resourceType){
    setError(resourceType==="FOLDER" ? "This workflow is not available for folders." : "This workflow is not available for files.");
    return;
  }
  const missing=fields.filter(f=>f.required===true&&(fieldValues[f.id]===undefined||fieldValues[f.id]===null||(typeof fieldValues[f.id]==="string"&&!String(fieldValues[f.id]).trim())));
  if(missing.length){
    setError(`Required workflow fields: ${missing.map(f=>f.name).join(", ")}`);
    return;
  }
  if(needsStarterParticipants&&!rules.length){
    setError("Select at least one workflow participant before starting.");
    return;
  }
  setBusy(true);setError("");
  try{
    await startWorkflow(detail.id,{
      fileId:resourceId,
      resourceId,
      folderId:resourceType === "FOLDER" ? resourceId : undefined,
      name:resourceName,
      resourceType,
      userId:"",
      startInput:{
        fieldValues,
        participantRules:needsStarterParticipants?rules:undefined,
        comment
      }
    });
      onStarted();
      onClose();}catch(e){setError(e instanceof Error?e.message:label("error.generic"));}finally{setBusy(false)}};
 return <Modal title={label("menu.assignWorkflow")} onClose={onClose}><div className="space-y-3">
   <p className="text-[12px] text-slate-500">{resourceName}</p>{error&&<div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
   {!detail ? loading?<p className="text-[12px] text-slate-500">{label("common.loading")}</p>:rows.length===0?<p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">No manual workflows are available.</p>:<div className="max-h-80 space-y-2 overflow-y-auto">{rows.map(w=><button key={w.id} onClick={(event)=>{event.preventDefault();event.stopPropagation();void loadDetail(w)}} className="wd-card w-full p-3 text-start transition hover:border-[var(--wd-primary)]"><div className="text-[12px] font-semibold">{w.name}</div><div className="mt-1 text-[10.5px] text-slate-500">{w.description||"Manual workflow"}</div><div className="mt-2 text-[9px] text-slate-400">{w.states.length} states · {w.transitions.length} transitions</div></button>)}</div>
   :<><div className="wd-card flex items-start gap-2 bg-slate-50 p-3"><button onClick={(event)=>{event.preventDefault();event.stopPropagation();setDetail(null)}} className="wd-pill wd-pill-record">←</button><div className="min-w-0"><div className="text-[13px] font-semibold text-slate-900">{detail.name}</div><div className="mt-1 text-[10px] text-slate-500">{detail.description||"Manual workflow"}</div></div></div>
    {fields.length>0&&<div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-semibold text-slate-700">Workflow details</div><div className="mt-2 space-y-2">{fields.map(f=><label key={f.id} className="block text-[10px] font-medium text-slate-600">{f.name}{f.required&&<span className="ms-1 text-red-500">*</span>}<div className="mt-1">{f.type==="multi"?<textarea value={String(fieldValues[f.id]??"")} maxLength={f.max} onChange={e=>setFieldValues(v=>({...v,[f.id]:e.target.value}))} rows={3} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10.5px]"/>:f.type==="choice"?<select value={String(fieldValues[f.id]??"")} onChange={e=>setFieldValues(v=>({...v,[f.id]:e.target.value}))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10.5px]"><option value="">Select…</option>{(f.options??[]).map(o=><option key={o}>{o}</option>)}</select>:f.type==="boolean"?<select value={fieldValues[f.id]===true?"true":fieldValues[f.id]===false?"false":""} onChange={e=>setFieldValues(v=>({...v,[f.id]:e.target.value==="true"}))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10.5px]"><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></select>:<input type={f.type==="email"?"email":f.type==="number"?"number":f.type==="date"?"date":f.type==="datetime"?"datetime-local":"text"} value={String(fieldValues[f.id]??"")} maxLength={f.max} onChange={e=>setFieldValues(v=>({...v,[f.id]:f.type==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value}))} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[10.5px]"/>}</div>{f.description&&<div className="mt-1 text-[9px] text-slate-400">{f.description}</div>}</label>)}</div></div>}
    {needsStarterParticipants&&options&&<div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-semibold text-slate-700">Participants</div><p className="mt-1 text-[9.5px] text-slate-500">Choose the users, groups, or roles who should receive the approval task.</p><div className="mt-2 grid gap-2">{options.users.length>0&&<select multiple value={users} onChange={e=>setUsers(Array.from(e.target.selectedOptions).map(o=>o.value))} className="h-24 w-full rounded-lg border border-slate-200 px-2 py-2 text-[10px]">{options.users.map(u=><option key={u.id} value={u.id}>{u.name||u.email} · {u.email}</option>)}</select>}{options.groups.length>0&&<select multiple value={groups} onChange={e=>setGroups(Array.from(e.target.selectedOptions).map(o=>o.value))} className="h-20 w-full rounded-lg border border-slate-200 px-2 py-2 text-[10px]">{options.groups.map(g=><option key={g.id} value={g.id}>{g.name} · {g.memberCount??0}</option>)}</select>}<div className="flex flex-wrap gap-1">{options.roles.map(role=><label key={role} className="rounded-md border border-slate-200 px-2 py-1 text-[8.5px] text-slate-600"><input type="checkbox" className="me-1 accent-[#1B66EA]" checked={roles.includes(role)} onChange={e=>setRoles(v=>e.target.checked?[...v,role]:v.filter(x=>x!==role))}/>{role}</label>)}</div></div></div>}
    <label className="block text-[10px] font-medium text-slate-600">Comment <textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={4000} rows={2} placeholder="Optional start comment" className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-2.5 py-2 text-[10.5px]"/></label>
    <div className="flex justify-end gap-2"><button onClick={(event)=>{event.preventDefault();event.stopPropagation();setDetail(null)}} disabled={busy} className="wd-pill wd-pill-record">Cancel</button><button onClick={(event)=>{event.preventDefault();event.stopPropagation();void start()}} disabled={busy||!detail} className="wd-pill wd-pill-new disabled:opacity-50">{busy?"Starting…":"Start workflow"}</button></div>
   </>}
 </div></Modal>;
}
