"use client";

import { useEffect, useState } from "react";
import {
  createTemplateVariable,
  deleteTemplateVariable,
  listTemplateVariables,
  updateTemplateVariable,
  type TemplateVariable,
  type TemplateVariableType,
} from "@/lib/api/templates";

const TYPES: TemplateVariableType[] = ["TEXT","NUMBER","DATE","BOOLEAN","EMAIL","URL","CURRENCY","IMAGE","USER","FILE","CHOICE"];

export function TemplateVariablesPanel({ templateId, ar, canManage, onClose }: { templateId: string; ar: boolean; canManage: boolean; onClose: () => void }) {
  const [items,setItems]=useState<TemplateVariable[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [editing,setEditing]=useState<TemplateVariable|null>(null);
  const [name,setName]=useState(""); const [label,setLabel]=useState(""); const [type,setType]=useState<TemplateVariableType>("TEXT");
  const [defaultValue,setDefaultValue]=useState(""); const [required,setRequired]=useState(false); const [description,setDescription]=useState(""); const [options,setOptions]=useState("");

  const load=async()=>{setBusy(true);setError("");try{setItems(await listTemplateVariables(templateId));}catch(e){setError(e instanceof Error?e.message:"Unable to load variables.");}finally{setBusy(false);}};
  useEffect(()=>{void load();},[templateId]);

  const reset=()=>{setEditing(null);setName("");setLabel("");setType("TEXT");setDefaultValue("");setRequired(false);setDescription("");setOptions("");};
  const edit=(v:TemplateVariable)=>{setEditing(v);setName(v.name);setLabel(v.label);setType(v.type);setDefaultValue(v.defaultValue??"");setRequired(v.required);setDescription(v.description??"");setOptions((v.options??[]).join(", "));};
  const save=async()=>{
    if(!name.trim()||!label.trim())return; setBusy(true);setError("");
    const payload={name:name.trim(),label:label.trim(),type,defaultValue:defaultValue||null,required,description:description.trim()||null,options:type==="CHOICE"?options.split(",").map(x=>x.trim()).filter(Boolean):undefined,format:null,position:editing?.position??items.length};
    try{if(editing)await updateTemplateVariable(templateId,editing.id,payload);else await createTemplateVariable(templateId,payload);reset();await load();}catch(e){setError(e instanceof Error?e.message:"Unable to save variable.");}finally{setBusy(false);}
  };
  const remove=async(v:TemplateVariable)=>{if(!window.confirm(ar?`حذف المتغير «${v.label}»؟`:`Delete variable “${v.label}”?`))return;setBusy(true);try{await deleteTemplateVariable(templateId,v.id);await load();}catch(e){setError(e instanceof Error?e.message:"Unable to delete variable.");}finally{setBusy(false);}};

  return <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" dir={ar?"rtl":"ltr"}>
    <div className="absolute inset-0 bg-black/35" onClick={()=>!busy&&onClose()}/>
    <div className="relative w-[min(900px,96vw)] max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{ar?"متغيرات القالب":"Template Variables"}</h2><p className="mt-1 text-[11px] text-slate-500">{ar?"حقول قابلة لإعادة الاستخدام داخل Writer وSheet وShow.":"Reusable fields for Writer, Sheet and Show."}</p></div><button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-slate-100">✕</button></div>
      <div className="grid max-h-[76vh] grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-semibold text-slate-800">{ar?"الحقول":"Fields"}</h3>{canManage&&<button onClick={reset} className="rounded-lg bg-[var(--wd-primary)] px-3 py-2 text-[11px] font-medium text-white">{ar?"متغير جديد":"New variable"}</button>}</div>
          {error&&<div className="mb-3 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
          <div className="space-y-2">{items.map(v=><div key={v.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="font-semibold text-[12px] text-slate-800">{v.label}</div><div className="mt-1 text-[10px] text-slate-400">{`{{${v.name}}}`} · {v.type}{v.required?" · required":""}</div></div>{canManage&&<><button onClick={()=>edit(v)} className="rounded-md px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100">{ar?"تعديل":"Edit"}</button><button onClick={()=>void remove(v)} className="rounded-md px-2 py-1 text-[10px] text-red-600 hover:bg-red-50">{ar?"حذف":"Delete"}</button></>}</div>{v.description&&<p className="mt-2 text-[10px] leading-4 text-slate-500">{v.description}</p>}{v.type==="CHOICE"&&<div className="mt-2 text-[9px] text-slate-400">{(v.options??[]).join(" · ")}</div>}</div>)}{!items.length&&<div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-[11px] text-slate-400">{ar?"لا توجد متغيرات بعد.":"No variables yet."}</div>}</div>
        </div>
        {canManage&&<div className="rounded-xl border border-slate-200 p-4"><h3 className="text-[12px] font-semibold text-slate-800">{editing?(ar?"تعديل المتغير":"Edit variable"):(ar?"إضافة متغير":"Add variable")}</h3>
          <label className="mt-4 block text-[10px] font-medium text-slate-600">{ar?"الاسم البرمجي":"Variable name"}</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="customer_name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/>
          <label className="mt-3 block text-[10px] font-medium text-slate-600">{ar?"التسمية":"Label"}</label><input value={label} onChange={e=>setLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/>
          <label className="mt-3 block text-[10px] font-medium text-slate-600">{ar?"النوع":"Type"}</label><select value={type} onChange={e=>setType(e.target.value as TemplateVariableType)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]">{TYPES.map(x=><option key={x}>{x}</option>)}</select>
          <label className="mt-3 block text-[10px] font-medium text-slate-600">{ar?"القيمة الافتراضية":"Default value"}</label><input value={defaultValue} onChange={e=>setDefaultValue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/>
          {type==="CHOICE"&&<><label className="mt-3 block text-[10px] font-medium text-slate-600">{ar?"الخيارات بفواصل":"Options, comma separated"}</label><input value={options} onChange={e=>setOptions(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/></>}
          <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)}/>{ar?"مطلوب":"Required"}</label>
          <label className="mt-3 block text-[10px] font-medium text-slate-600">{ar?"الوصف":"Description"}</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px]"/>
          <div className="mt-4 flex gap-2"><button disabled={busy||!name.trim()||!label.trim()} onClick={()=>void save()} className="rounded-lg bg-[var(--wd-primary)] px-4 py-2 text-[11px] font-medium text-white disabled:opacity-50">{ar?"حفظ":"Save"}</button>{editing&&<button onClick={reset} className="rounded-lg border border-slate-200 px-4 py-2 text-[11px]">{ar?"إلغاء":"Cancel"}</button>}</div>
        </div>}
      </div>
    </div>
  </div>;
}
