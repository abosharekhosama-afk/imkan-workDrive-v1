'use client';
import {useMemo,useState} from 'react';
import type {ReactNode} from 'react';

type Action=()=>void;
export type OfficeRibbonProps={
 type:'WRITER'|'SHEET'|'SHOW'; ar?:boolean; saved?:boolean; saving?:boolean;
 actions?:Record<string,Action|undefined>;
 presence?:ReactNode;
};
const labels:any={
 WRITER:{Home:['Undo','Redo','Bold','Italic','Underline','Align','Find'],Insert:['Table','Image','Page Break','TOC','Bookmark','Footnote'],Review:['Comments','Track Changes','Snapshot'],View:['Print','Fullscreen']},
 SHEET:{Home:['Undo','Redo','Bold','Italic','Format','Fill Down'],Insert:['Chart','Table','Pivot','Sheet'],Data:['Sort','Filter','Validation','Named Range'],View:['Freeze','Fullscreen']},
 SHOW:{Home:['Undo','Redo','Present'],Insert:['Text','Image','Shape','Video','Audio','Table'],Slide:['New Slide','Duplicate','Delete','Transition'],View:['Navigator','Fullscreen']}
};
const key=(s:string)=>s.toLowerCase().replaceAll(' ','');
export function OfficeRibbon({type,ar=false,saved=true,saving=false,actions={},presence}:OfficeRibbonProps){
 const tabs=useMemo(()=>Object.keys(labels[type]),[type]); const [tab,setTab]=useState(tabs[0]);
 const names:any={Undo:ar?'تراجع':'Undo',Redo:ar?'إعادة':'Redo',Bold:ar?'عريض':'Bold',Italic:ar?'مائل':'Italic',Underline:ar?'تحته خط':'Underline',Align:ar?'محاذاة':'Align',Find:ar?'بحث':'Find',Table:ar?'جدول':'Table',Image:ar?'صورة':'Image','Page Break':ar?'فاصل صفحة':'Page Break',TOC:'TOC',Bookmark:ar?'إشارة مرجعية':'Bookmark',Footnote:ar?'حاشية':'Footnote',Comments:ar?'تعليقات':'Comments','Track Changes':ar?'تتبع التغييرات':'Track Changes',Snapshot:ar?'لقطة':'Snapshot',Print:ar?'طباعة':'Print',Fullscreen:ar?'ملء الشاشة':'Fullscreen',Format:ar?'تنسيق':'Format','Fill Down':ar?'تعبئة لأسفل':'Fill Down',Chart:ar?'رسم':'Chart',Pivot:'Pivot',Sheet:ar?'ورقة':'Sheet',Sort:ar?'فرز':'Sort',Filter:ar?'تصفية':'Filter',Validation:ar?'تحقق':'Validation','Named Range':ar?'نطاق مسمى':'Named Range',Freeze:ar?'تجميد':'Freeze',Present:ar?'عرض':'Present',Text:ar?'نص':'Text',Shape:ar?'شكل':'Shape',Video:ar?'فيديو':'Video',Audio:ar?'صوت':'Audio','New Slide':ar?'شريحة جديدة':'New Slide',Duplicate:ar?'تكرار':'Duplicate',Delete:ar?'حذف':'Delete',Transition:ar?'انتقال':'Transition',Navigator:ar?'المستكشف':'Navigator'};
 const available=(n:string)=>actions[key(n)]||actions[n]||actions[n.replaceAll(' ','_')];
 return <div className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm print:hidden">
   <div className="flex h-9 items-center gap-1 overflow-x-auto px-2 text-xs"><div className="me-2 hidden font-semibold text-[var(--wd-primary)] sm:block">IMKAN Office</div>{tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded px-3 py-1.5 ${tab===t?'bg-slate-100 font-semibold text-slate-900':'text-slate-500 hover:bg-slate-50'}`}>{ar?({Home:'الرئيسية',Insert:'إدراج',Review:'مراجعة',View:'عرض',Data:'بيانات',Slide:'شريحة'} as any)[t]||t:t}</button>)}<span className="ms-auto hidden sm:block text-[10px] text-slate-400">{saving?(ar?'جارٍ الحفظ…':'Saving…'):(saved?(ar?'تم الحفظ':'Saved'):(ar?'غير محفوظ':'Unsaved'))}</span>{presence}</div>
   <div className="flex min-h-14 items-center gap-1 overflow-x-auto px-2 pb-2 pt-1">{labels[type][tab].map((n:string)=>{const fn=available(n);return <button key={n} disabled={!fn} onClick={()=>fn?.()} title={names[n]||n} className="flex min-w-[58px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"><span className="flex h-7 w-8 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs">{n==='Undo'?'↶':n==='Redo'?'↷':n==='Bold'?'B':n==='Italic'?'I':n==='Underline'?'U':n==='Table'?'▦':n==='Chart'?'▥':n==='Pivot'?'◫':n==='Find'?'⌕':n==='Print'?'⎙':n==='Fullscreen'?'⛶':n==='Present'?'▶':n==='Image'?'▧':n==='Video'?'▶':n==='Audio'?'♫':n==='Delete'?'⌫':'•'}</span><span className="whitespace-nowrap">{names[n]||n}</span></button>})}</div>
 </div>;
}
