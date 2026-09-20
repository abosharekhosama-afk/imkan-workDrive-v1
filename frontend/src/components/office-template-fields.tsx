"use client";

import { useEffect, useState } from "react";
import { listTemplateVariables, type TemplateVariable } from "@/lib/api/templates";

export function OfficeTemplateFields({ templateId, ar, onInsert }: { templateId?: string | null; ar: boolean; onInsert: (placeholder: string, variable: TemplateVariable) => void }) {
  const [items,setItems]=useState<TemplateVariable[]>([]);
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(!templateId)return;void listTemplateVariables(templateId).then(setItems).catch(()=>setItems([]));},[templateId]);
  if(!templateId||!items.length)return null;
  return <div className="fixed bottom-4 end-4 z-[180] w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-2xl">
    <button onClick={()=>setOpen(v=>!v)} className="flex w-full items-center justify-between px-4 py-3 text-start text-[12px] font-semibold text-slate-800"><span>{ar?"حقول القالب":"Template fields"} <span className="text-[9px] font-normal text-slate-400">({items.length})</span></span><span>{open?"⌄":"⌃"}</span></button>
    {open&&<div className="max-h-72 overflow-y-auto border-t border-slate-100 p-2">{items.map(v=><button key={v.id} onClick={()=>onInsert(`{{${v.name}}}`,v)} className="mb-1 block w-full rounded-xl px-3 py-2 text-start hover:bg-slate-50"><div className="text-[11px] font-semibold text-slate-700">{v.label}</div><div className="mt-0.5 text-[9px] text-slate-400">{`{{${v.name}}}`} · {v.type}{v.required?" · required":""}</div></button>)}</div>}
  </div>;
}
