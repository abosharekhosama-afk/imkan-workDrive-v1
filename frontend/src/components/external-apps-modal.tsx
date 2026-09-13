"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-provider";
export function ExternalAppsHost(){
 const {locale}=useLocale(); const [open,setOpen]=useState(false);
 useEffect(()=>{const h=()=>setOpen(true); window.addEventListener("workdrive:external-apps",h); return()=>window.removeEventListener("workdrive:external-apps",h)},[]);
 if(!open)return null;
 return createPortal(<div className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="absolute inset-0 bg-black/35" onClick={()=>setOpen(false)}/><div className="relative w-[min(620px,94vw)] rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[16px] font-semibold text-slate-900">{locale==='ar'?'التطبيقات الخارجية':'External apps'}</h2><p className="mt-1 text-[12px] text-slate-500">{locale==='ar'?'اربط خدماتك الخارجية ووسّع مساحة العمل.':'Connect external services and extend your workspace.'}</p></div><button className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={()=>setOpen(false)}>✕</button></div><div className="grid gap-3 p-5 sm:grid-cols-2">{['Google Drive','Dropbox','OneDrive','Slack'].map(name=><button key={name} type="button" className="rounded-xl border border-slate-200 p-4 text-start hover:border-[#1B66EA] hover:bg-[#F7FAFF]" onClick={()=>setOpen(false)}><div className="text-[13px] font-semibold">{name}</div><div className="mt-1 text-[11px] text-slate-500">{locale==='ar'?'فتح إعدادات الاتصال':'Open connection settings'}</div></button>)}</div></div></div>,document.body)
}
