"use client";
import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";
import { listWorkflows, startWorkflow, type Workflow } from "../lib/api/workflows";
import { Modal } from "./modal";
export function WorkflowPicker({resourceType,resourceId,resourceName,onClose,onStarted}:{resourceType:"FILE"|"FOLDER";resourceId:string;resourceName:string;onClose:()=>void;onStarted:()=>void}){
 const{label}=useLocale();const[rows,setRows]=useState<Workflow[]>([]);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState<string|null>(null);const[error,setError]=useState("");
 useEffect(()=>{void listWorkflows().then(r=>setRows(r.filter(x=>x.mode==="MANUAL"&&x.resourceType===resourceType))).catch(()=>setRows([])).finally(()=>setLoading(false))},[resourceType]);
 const start=async(w:Workflow)=>{setBusy(w.id);setError("");try{await startWorkflow(w.id,{fileId:resourceId,name:resourceName,resourceType,userId:""});onStarted();onClose()}catch(e){setError(e instanceof Error?e.message:label("error.generic"))}finally{setBusy(null)}};
 return <Modal title={label("menu.assignWorkflow")} onClose={onClose}><div className="space-y-3"><p className="text-[12px] text-slate-500">{resourceName}</p>{error&&<div className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}{loading?<p className="text-[12px] text-slate-500">{label("common.loading")}</p>:rows.length===0?<p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">No manual workflows are available.</p>:<div className="max-h-72 space-y-2 overflow-y-auto">{rows.map(w=><button key={w.id} disabled={busy===w.id} onClick={()=>void start(w)} className="w-full rounded-lg border border-slate-200 p-3 text-start hover:border-[#1B66EA] hover:bg-[#F7FAFF] disabled:opacity-50"><div className="text-[12px] font-semibold">{w.name}</div><div className="mt-1 text-[10.5px] text-slate-500">{w.description||"Manual workflow"}</div></button>)}</div>}</div></Modal>
}
