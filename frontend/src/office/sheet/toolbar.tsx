/* eslint-disable react/no-unescaped-entities */
'use client';
<<<<<<< HEAD
import type { ReactNode } from 'react';
import type { SheetCell, NumberFormat } from './model';

type Tab = 'home'|'insert'|'data'|'view';
type Props={
 cell?:SheetCell; tab?:Tab; onTabChange?:(v:Tab)=>void;
 onCopy?:()=>void; onCut?:()=>void; onPaste?:()=>void; onClear?:()=>void;
 onFreezeToggle?:()=>void; onBold:()=>void; onItalic:()=>void; onColor:(v:string)=>void; onBg:(v:string)=>void;
 onAlign:(v:'start'|'center'|'end')=>void; onFormat:(v:NumberFormat)=>void;
 onAddSheet:()=>void; onDeleteSheet:()=>void; onRename:()=>void; onFreeze:()=>void; onSort:()=>void; onMerge:()=>void; onUnmerge:()=>void;
 onFilter:()=>void; onValidation:()=>void; onNamedRange:()=>void; onTable:()=>void; onPivot:()=>void; onChart:()=>void; onConditional:()=>void;
 onInsertRows:()=>void; onDeleteRows:()=>void; onInsertColumns:()=>void; onDeleteColumns:()=>void;
};

const paths:Record<string,string>={
 copy:'M8 8h10v10H8z M6 6h10v2 M6 16V6', cut:'M6 6l12 12 M18 6L6 18 M7 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4 M17 13a2 2 0 1 1 0 4 2 2 0 0 1 0-4', paste:'M8 5h8v3H8z M6 8h12v11H6z', undo:'M9 8 5 12l4 4 M5 12h8a5 5 0 0 1 5 5', redo:'M15 8l4 4-4 4 M19 12h-8a5 5 0 0 0-5 5', bold:'M7 5h6a3 3 0 0 1 0 6H7zm0 6h7a3 3 0 0 1 0 6H7z', italic:'M10 5h8 M6 19h8 M14 5 10 19', fill:'M5 19h14 M7 5h10v8H7z', align:'M5 7h14 M7 12h10 M5 17h14', merge:'M6 6h12v12H6z M10 12h4', filter:'M4 6h16l-6 7v5l-4 2v-7z', sort:'M7 6v12 M4 9l3-3 3 3 M17 18V6 M14 15l3 3 3-3', chart:'M5 19V9h3v10H5zm6 0V5h3v14h-3zm6 0v-7h3v7h-3z', table:'M5 5h14v14H5z M5 10h14 M10 5v14 M15 5v14', pivot:'M6 6h12v12H6z M9 9h6v6H9z', freeze:'M5 5h14v14H5z M5 10h14 M10 5v14', plus:'M12 5v14 M5 12h14', minus:'M5 12h14', trash:'M7 7h10v12H7z M9 4h6l1 3H8z M10 10v6 M14 10v6', rename:'M5 19h14 M7 16l9-9 3 3-9 9H7z', validation:'M5 5h14v14H5z M8 12l3 3 5-6', conditional:'M5 5h14v14H5z M8 15l3-6 5 6', name:'M5 5h14v14H5z M8 9h8 M8 13h5',
};
function Icon({name}:{name:string}){return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]||paths.table}/></svg>}
function Action({icon,label,onClick,active,disabled}:{icon:string;label:string;onClick:()=>void;active?:boolean;disabled?:boolean}){return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`group flex min-w-[52px] flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ${active?'bg-[#dce6f1] text-[#185abd]':'text-[#242424] hover:bg-[#e8edf3]'} disabled:opacity-35`}><span className="flex h-7 w-8 items-center justify-center"><Icon name={icon}/></span><span className="whitespace-nowrap leading-none">{label}</span></button>}
function Divider(){return <span className="mx-1 h-12 w-px bg-[#d9dde3]"/>}
function Group({label,children}:{label:string;children:ReactNode}){return <div className="flex h-[78px] flex-col justify-between px-1"><div className="flex flex-1 items-center gap-0.5">{children}</div><div className="border-t border-[#e2e5e9] pt-1 text-center text-[9px] font-medium text-[#616161]">{label}</div></div>}

export function SheetToolbar(p:Props){
 const tab=p.tab||'home';
 const tabs:[Tab,string][]=[['home','Home'],['insert','Insert'],['data','Data'],['view','View']];
 return <div className="border-b border-[#c8cdd3] bg-[#f7f7f7] shadow-[0_1px_3px_rgba(0,0,0,.08)] print:hidden" dir="ltr">
   <div className="flex h-9 items-end border-b border-[#d5d8dc] bg-white px-3">
    {tabs.map(([id,label])=><button key={id} onClick={()=>p.onTabChange?.(id)} className={`relative h-9 min-w-[68px] px-4 text-[12px] font-medium ${tab===id?'text-[#185abd]':'text-[#444] hover:bg-[#f3f5f7]'}`}>{label}{tab===id&&<span className="absolute inset-x-2 bottom-0 h-[2px] bg-[#185abd]"/>}</button>)}
   </div>
   <div className="flex min-h-[82px] items-stretch overflow-x-auto px-2 py-0.5">
    {tab==='home'&&<>
      <Group label="Clipboard"><Action icon="copy" label="Copy" onClick={p.onCopy||(()=>{})}/><Action icon="cut" label="Cut" onClick={p.onCut||(()=>{})}/><Action icon="paste" label="Paste" onClick={p.onPaste||(()=>{})}/><Action icon="undo" label="Undo" onClick={()=>{}} disabled/></Group><Divider/>
      <Group label="Font"><Action icon="bold" label="Bold" onClick={p.onBold} active={!!p.cell?.format?.bold}/><Action icon="italic" label="Italic" onClick={p.onItalic} active={!!p.cell?.format?.italic}/><label className="flex h-[58px] min-w-[50px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-2 text-[10px] hover:bg-[#e8edf3]" title="Font Color"><span className="text-[16px] font-bold leading-none" style={{color:p.cell?.format?.color||'#242424'}}>A</span><input aria-label="Font color" type="color" value={p.cell?.format?.color??'#242424'} onChange={e=>p.onColor(e.target.value)} className="h-2 w-7 cursor-pointer border-0 p-0"/><span>Color</span></label><label className="flex h-[58px] min-w-[50px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-2 text-[10px] hover:bg-[#e8edf3]" title="Fill Color"><span className="h-4 w-5 border" style={{background:p.cell?.format?.background||'#fff'}}/><input aria-label="Cell fill" type="color" value={p.cell?.format?.background??'#ffffff'} onChange={e=>p.onBg(e.target.value)} className="h-2 w-7 cursor-pointer border-0 p-0"/><span>Fill</span></label></Group><Divider/>
      <Group label="Alignment"><select aria-label="Alignment" value={p.cell?.format?.align??'start'} onChange={e=>p.onAlign(e.target.value as 'start'|'center'|'end')} className="h-8 rounded border border-[#c9cdd2] bg-white px-2 text-[10px]"><option value="start">Left</option><option value="center">Center</option><option value="end">Right</option></select><Action icon="merge" label="Merge" onClick={p.onMerge}/><select aria-label="Number format" value={p.cell?.format?.numberFormat??'general'} onChange={e=>p.onFormat(e.target.value as NumberFormat)} className="h-8 rounded border border-[#c9cdd2] bg-white px-2 text-[10px]"><option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="date">Date</option></select></Group><Divider/>
      <Group label="Number"><select aria-label="Number format" value={p.cell?.format?.numberFormat??'general'} onChange={e=>p.onFormat(e.target.value as NumberFormat)} className="h-8 w-[88px] rounded border border-[#c9cdd2] bg-white px-2 text-[10px]"><option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="date">Date</option></select></Group><Divider/>
      <Group label="Cells"><Action icon="plus" label="Insert Row" onClick={p.onInsertRows}/><Action icon="minus" label="Delete Row" onClick={p.onDeleteRows}/><Action icon="plus" label="Insert Col" onClick={p.onInsertColumns}/><Action icon="minus" label="Delete Col" onClick={p.onDeleteColumns}/></Group>
    </>}
    {tab==='insert'&&<>
      <Group label="Tables"><Action icon="table" label="Table" onClick={p.onTable}/><Action icon="pivot" label="PivotTable" onClick={p.onPivot}/><Action icon="chart" label="Chart" onClick={p.onChart}/></Group><Divider/><Group label="Defined Names"><Action icon="name" label="Named Range" onClick={p.onNamedRange}/></Group><Divider/><Group label="Sheets"><Action icon="plus" label="New Sheet" onClick={p.onAddSheet}/></Group>
    </>}
    {tab==='data'&&<>
      <Group label="Sort & Filter"><Action icon="sort" label="Sort" onClick={p.onSort}/><Action icon="filter" label="Filter" onClick={p.onFilter}/></Group><Divider/><Group label="Data Tools"><Action icon="validation" label="Validation" onClick={p.onValidation}/><Action icon="conditional" label="Conditional" onClick={p.onConditional}/></Group><Divider/><Group label="Names"><Action icon="name" label="Named Range" onClick={p.onNamedRange}/></Group>
    </>}
    {tab==='view'&&<>
      <Group label="Window"><Action icon="freeze" label="Freeze Panes" onClick={p.onFreezeToggle||p.onFreeze}/></Group><Divider/><Group label="Sheets"><Action icon="plus" label="New Sheet" onClick={p.onAddSheet}/><Action icon="rename" label="Rename" onClick={p.onRename}/><Action icon="trash" label="Delete" onClick={p.onDeleteSheet}/></Group><Divider/><Group label="Merge"><Action icon="merge" label="Merge" onClick={p.onMerge}/><Action icon="merge" label="Unmerge" onClick={p.onUnmerge}/></Group>
    </>}
   </div>
 </div>
=======

import { useState, type ReactNode } from 'react';
import type { SheetCell, NumberFormat } from './model';

type Tab = 'home'|'insert'|'data'|'view';
type Menu = 'File'|'Edit'|'View'|'Insert'|'Format'|'Data'|'Review'|'Tools'|'Help';

type Props = {
  cell?: SheetCell;
  tab?: Tab;
  onTabChange?: (v: Tab) => void;
  onCopy?:()=>void; onCut?:()=>void; onPaste?:()=>void; onClear?:()=>void;
  onUndo?:()=>void; onRedo?:()=>void;
  onSave?:()=>void; onPrint?:()=>void; onExport?:()=>void; onFind?:()=>void;
  onFreezeToggle?:()=>void; onGridlinesToggle?:()=>void; gridlines?:boolean;
  onBold:()=>void; onItalic:()=>void; onUnderline?:()=>void; onStrike?:()=>void;
  onColor:(v:string)=>void; onBg:(v:string)=>void;
  onAlign:(v:'start'|'center'|'end')=>void; onFormat:(v:NumberFormat)=>void;
  onAddSheet:()=>void; onDeleteSheet:()=>void; onRename:()=>void; onFreeze:()=>void;
  onSort:()=>void; onMerge:()=>void; onUnmerge:()=>void; onFilter:()=>void;
  onValidation:()=>void; onNamedRange:()=>void; onTable:()=>void; onPivot:()=>void;
  onChart:()=>void; onConditional:()=>void;
  onInsertRows:()=>void; onDeleteRows:()=>void; onInsertColumns:()=>void; onDeleteColumns:()=>void;
  onHelp?:()=>void;
  ar?:boolean;
};

const labels:Record<string,string>={
  File:'ملف', Edit:'تحرير', View:'عرض', Insert:'إدراج', Format:'تنسيق', Data:'بيانات',
  Review:'مراجعة', Tools:'أدوات', Help:'مساعدة',
  Home:'الرئيسية', Clipboard:'الحافظة', Font:'الخط', Alignment:'المحاذاة',
  Number:'الرقم', Cells:'الخلايا', Sheets:'الأوراق', DataTools:'أدوات البيانات',
  Save:'حفظ', Print:'طباعة', Export:'تصدير XLSX', Find:'بحث',
  Undo:'تراجع', Redo:'إعادة', Copy:'نسخ', Cut:'قص', Paste:'لصق', Clear:'مسح',
  Bold:'عريض', Italic:'مائل', Underline:'تحته خط', Strike:'يتوسطه خط',
  Left:'يسار', Center:'وسط', Right:'يمين', Merge:'دمج', Unmerge:'إلغاء الدمج',
  General:'عام', Number:'رقم', Currency:'عملة', Percent:'نسبة', Date:'تاريخ',
  InsertRow:'إدراج صف', DeleteRow:'حذف صف', InsertColumn:'إدراج عمود', DeleteColumn:'حذف عمود',
  Freeze:'تجميد الأجزاء', Gridlines:'خطوط الشبكة', NewSheet:'ورقة جديدة', Rename:'إعادة تسمية', Delete:'حذف',
  Sort:'فرز', Filter:'تصفية', Validation:'التحقق من البيانات', Conditional:'تنسيق شرطي',
  Table:'جدول', Pivot:'جدول محوري', Chart:'رسم بياني', NamedRange:'نطاق مسمى',
  Refresh:'إعادة حساب', Comments:'التعليقات', Audit:'سجل التدقيق', VersionHistory:'سجل الإصدارات',
  Shortcuts:'اختصارات لوحة المفاتيح', About:'حول IMKAN Sheet', Theme:'نسق',
  InsertFunction:'إدراج دالة', InsertRows:'صف', InsertColumns:'عمود', InsertSheet:'ورقة',
};

const iconPaths:Record<string,string>={
  undo:'M9 8 5 12l4 4 M5 12h8a5 5 0 0 1 5 5',
  redo:'M15 8l4 4-4 4 M19 12h-8a5 5 0 0 0-5 5',
  copy:'M8 8h10v10H8z M6 6h10v2 M6 16V6',
  cut:'M6 6l12 12 M18 6L6 18 M7 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4 M17 13a2 2 0 1 1 0 4 2 2 0 0 1 0-4',
  paste:'M8 5h8v3H8z M6 8h12v11H6z',
  bold:'M7 5h6a3 3 0 0 1 0 6H7zm0 6h7a3 3 0 0 1 0 6H7z',
  italic:'M10 5h8 M6 19h8 M14 5 10 19',
  underline:'M6 5v7a6 6 0 0 0 12 0V5 M5 21h14',
  strike:'M5 12h14 M8 7c1-2 7-2 8 1 M16 17c-1 2-7 2-8-1',
  align:'M5 7h14 M8 12h8 M5 17h14',
  merge:'M6 6h12v12H6z M10 12h4',
  filter:'M4 6h16l-6 7v5l-4 2v-7z',
  sort:'M7 6v12 M4 9l3-3 3 3 M17 18V6 M14 15l3 3 3-3',
  chart:'M5 19V9h3v10H5zm6 0V5h3v14h-3zm6 0v-7h3v7h-3z',
  table:'M5 5h14v14H5z M5 10h14 M10 5v14 M15 5v14',
  pivot:'M6 6h12v12H6z M9 9h6v6H9z',
  freeze:'M5 5h14v14H5z M5 10h14 M10 5v14',
  plus:'M12 5v14 M5 12h14',
  minus:'M5 12h14',
  trash:'M7 7h10v12H7z M9 4h6l1 3H8z M10 10v6 M14 10v6',
  name:'M5 5h14v14H5z M8 9h8 M8 13h5',
  search:'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15 M16 16l4 4',
  print:'M6 9V4h12v5 M6 17H4V9h16v8h-2 M7 14h10v6H7z',
  download:'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  refresh:'M20 11a8 8 0 1 0 1 5 M20 5v6h-6',
};

function Icon({name}:{name:string}) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name] || iconPaths.table}/></svg>;
}

function Action({icon,label,onClick,active,disabled,compact=false}:{icon:string;label:string;onClick:()=>void;active?:boolean;disabled?:boolean;compact?:boolean}) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    className={`${compact?'min-w-[38px] h-8 px-1':'min-w-[52px] h-[58px] px-2'} group flex flex-col items-center justify-center gap-1 rounded-md text-[10px] transition ${active?'bg-[#dff2e5] text-[#107c41]':'text-[#242424] hover:bg-[#eef3f8]'} disabled:cursor-not-allowed disabled:opacity-35`}>
    <span className="flex h-6 w-8 items-center justify-center"><Icon name={icon}/></span>
    {!compact && <span className="whitespace-nowrap leading-none">{label}</span>}
  </button>;
}

function Divider(){return <span className="mx-1 h-12 w-px shrink-0 bg-[#d9dde3]"/>;}
function Group({label,children}:{label:string;children:ReactNode}) {
  return <div className="flex h-[72px] shrink-0 flex-col justify-between px-1"><div className="flex flex-1 items-center gap-0.5">{children}</div><div className="border-t border-[#e2e5e9] pt-1 text-center text-[9px] font-medium text-[#616161]">{label}</div></div>;
}

function MenuButton({name,active,onClick,ar}:{name:Menu;active:boolean;onClick:()=>void;ar:boolean}) {
  return <button type="button" onClick={onClick} aria-haspopup="menu" aria-expanded={active}
    className={`h-8 rounded px-3 text-[12px] ${active?'bg-[#e8f5ed] text-[#107c41] font-semibold':'text-[#242424] hover:bg-[#f1f3f5]'}`}>
    {ar?(labels[name]||name):name}
  </button>;
}

function MenuPanel({items,onSelect,ar}:{items:{label:string;action?:()=>void;disabled?:boolean;separator?:boolean}[];onSelect:()=>void;ar:boolean}) {
  return <div role="menu" className="absolute left-0 top-8 z-[80] min-w-[230px] rounded-md border border-[#d7dbe0] bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,.18)]">
    {items.map((item,i)=>item.separator
      ? <div key={i} className="my-1 border-t border-[#eceff2]"/>
      : <button key={i} role="menuitem" disabled={item.disabled} onClick={()=>{item.action?.();onSelect();}}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-[12px] text-[#242424] hover:bg-[#e8f5ed] disabled:cursor-not-allowed disabled:opacity-35">
          <span>{ar?(labels[item.label]||item.label):item.label}</span>
          {item.disabled?null:<span className="text-[10px] text-[#8a8f95]">{item.label==='Find'?'Ctrl+F':''}</span>}
        </button>
    )}
  </div>;
}

export function SheetToolbar(p:Props){
  const [menu,setMenu]=useState<Menu|null>(null);
  const ar=!!p.ar;
  const tab=p.tab||'home';
  const close=()=>setMenu(null);
  const action=(fn?:()=>void)=>()=>{fn?.();close();};

  const menus:Record<Menu,{label:string;action?:()=>void;disabled?:boolean;separator?:boolean}[]>={
    File:[
      {label:'Save',action:p.onSave},{label:'Export',action:p.onExport},{label:'Print',action:p.onPrint},
      {separator:true,label:''},{label:'Close',action:()=>window.history.back()},
    ],
    Edit:[
      {label:'Undo',action:p.onUndo},{label:'Redo',action:p.onRedo},{separator:true,label:''},
      {label:'Cut',action:p.onCut},{label:'Copy',action:p.onCopy},{label:'Paste',action:p.onPaste},{label:'Clear',action:p.onClear},
      {separator:true,label:''},{label:'Find',action:p.onFind},
    ],
    View:[
      {label:'Freeze',action:p.onFreezeToggle},{label:'Gridlines',action:p.onGridlinesToggle},
      {separator:true,label:''},{label:'Zoom 100%',disabled:true},
    ],
    Insert:[
      {label:'InsertRows',action:p.onInsertRows},{label:'InsertColumns',action:p.onInsertColumns},{label:'InsertSheet',action:p.onAddSheet},
      {separator:true,label:''},{label:'Table',action:p.onTable},{label:'Pivot',action:p.onPivot},{label:'Chart',action:p.onChart},{label:'NamedRange',action:p.onNamedRange},
    ],
    Format:[
      {label:'Bold',action:p.onBold},{label:'Italic',action:p.onItalic},{label:'Underline',action:p.onUnderline},
      {label:'Strike',action:p.onStrike},{separator:true,label:''},{label:'Merge',action:p.onMerge},{label:'Unmerge',action:p.onUnmerge},
      {separator:true,label:''},{label:'Conditional',action:p.onConditional},
    ],
    Data:[
      {label:'Sort',action:p.onSort},{label:'Filter',action:p.onFilter},{label:'Validation',action:p.onValidation},
      {label:'Conditional',action:p.onConditional},{label:'NamedRange',action:p.onNamedRange},
      {separator:true,label:''},{label:'Refresh',disabled:true},
    ],
    Review:[
      {label:'Comments',disabled:true},{label:'Audit',disabled:true},{label:'VersionHistory',disabled:true},
    ],
    Tools:[
      {label:'InsertFunction',disabled:true},{label:'Refresh',disabled:true},{label:'Shortcuts',action:()=>window.alert('Ctrl+C Copy\\nCtrl+X Cut\\nCtrl+V Paste\\nCtrl+Z Undo\\nCtrl+Y Redo\\nCtrl+F Find\\nEnter Edit Cell')},
    ],
    Help:[
      {label:'Shortcuts',action:()=>window.alert('IMKAN Sheet shortcuts\\nCtrl+C Copy\\nCtrl+X Cut\\nCtrl+V Paste\\nCtrl+Z Undo\\nCtrl+Y Redo\\nCtrl+F Find\\nCtrl+Enter Commit')},
      {label:'About',action:p.onHelp},
    ],
  };

  const tabs:[Tab,string][]=[['home','Home'],['insert','Insert'],['data','Data'],['view','View']];

  return <div className="border-b border-[#c8cdd3] bg-[#f7f7f7] shadow-[0_1px_3px_rgba(0,0,0,.08)] print:hidden" dir={ar?'rtl':'ltr'}>
    <div className="relative flex h-9 items-center border-b border-[#d5d8dc] bg-white px-2" onMouseLeave={()=>{}}>
      {(['File','Edit','View','Insert','Format','Data','Review','Tools','Help'] as Menu[]).map(name=>
        <div key={name} className="relative">
          <MenuButton name={name} active={menu===name} onClick={()=>setMenu(menu===name?null:name)} ar={ar}/>
          {menu===name&&<MenuPanel items={menus[name]} onSelect={close} ar={ar}/>}
        </div>
      )}
    </div>

    <div className="flex h-8 items-end border-b border-[#d5d8dc] bg-[#fff] px-2">
      {tabs.map(([id,label])=><button key={id} onClick={()=>p.onTabChange?.(id)} className={`relative h-8 min-w-[64px] px-3 text-[11px] font-medium ${tab===id?'text-[#107c41]':'text-[#444] hover:bg-[#f3f5f7]'}`}>{ar?(labels[label]||label):label}{tab===id&&<span className="absolute inset-x-2 bottom-0 h-[2px] bg-[#107c41]"/>}</button>)}
    </div>

    <div className="flex min-h-[76px] items-stretch overflow-x-auto px-2 py-0.5">
      {tab==='home'&&<>
        <Group label={labels.Clipboard}><Action icon="undo" label={labels.Undo} onClick={p.onUndo||(()=>{})} disabled={!p.onUndo}/><Action icon="redo" label={labels.Redo} onClick={p.onRedo||(()=>{})} disabled={!p.onRedo}/><Action icon="copy" label={labels.Copy} onClick={p.onCopy||(()=>{})}/><Action icon="cut" label={labels.Cut} onClick={p.onCut||(()=>{})}/><Action icon="paste" label={labels.Paste} onClick={p.onPaste||(()=>{})}/></Group><Divider/>
        <Group label={labels.Font}><Action icon="bold" label={labels.Bold} onClick={p.onBold} active={!!p.cell?.format?.bold}/><Action icon="italic" label={labels.Italic} onClick={p.onItalic} active={!!p.cell?.format?.italic}/><Action icon="underline" label={labels.Underline} onClick={p.onUnderline||(()=>{})} active={false}/><Action icon="strike" label={labels.Strike} onClick={p.onStrike||(()=>{})}/></Group><Divider/>
        <Group label={labels.Alignment}><select aria-label={labels.Left} value={p.cell?.format?.align??'start'} onChange={e=>p.onAlign(e.target.value as 'start'|'center'|'end')} className="h-8 rounded border border-[#c9cdd2] bg-white px-2 text-[10px]"><option value="start">{labels.Left}</option><option value="center">{labels.Center}</option><option value="end">{labels.Right}</option></select><Action icon="merge" label={labels.Merge} onClick={p.onMerge}/></Group><Divider/>
        <Group label={labels.Number}><select aria-label="Number format" value={p.cell?.format?.numberFormat??'general'} onChange={e=>p.onFormat(e.target.value as NumberFormat)} className="h-8 w-[92px] rounded border border-[#c9cdd2] bg-white px-2 text-[10px]"><option value="general">{labels.General}</option><option value="number">{labels.Number}</option><option value="currency">{labels.Currency}</option><option value="percent">{labels.Percent}</option><option value="date">{labels.Date}</option></select></Group><Divider/>
        <Group label={labels.Cells}><Action icon="plus" label={labels.InsertRow} onClick={p.onInsertRows}/><Action icon="minus" label={labels.DeleteRow} onClick={p.onDeleteRows}/><Action icon="plus" label={labels.InsertColumn} onClick={p.onInsertColumns}/><Action icon="minus" label={labels.DeleteColumn} onClick={p.onDeleteColumns}/></Group><Divider/>
        <Group label="View"><Action icon="freeze" label={labels.Freeze} onClick={p.onFreezeToggle||p.onFreeze}/><Action icon="table" label={labels.Gridlines} onClick={p.onGridlinesToggle||(()=>{})} active={p.gridlines!==false}/></Group>
      </>}

      {tab==='insert'&&<>
        <Group label="Insert"><Action icon="plus" label={labels.InsertRow} onClick={p.onInsertRows}/><Action icon="plus" label={labels.InsertColumn} onClick={p.onInsertColumns}/><Action icon="plus" label={labels.NewSheet} onClick={p.onAddSheet}/><Action icon="table" label={labels.Table} onClick={p.onTable}/><Action icon="pivot" label={labels.Pivot} onClick={p.onPivot}/><Action icon="chart" label={labels.Chart} onClick={p.onChart}/></Group><Divider/>
        <Group label="Names"><Action icon="name" label={labels.NamedRange} onClick={p.onNamedRange}/></Group>
      </>}

      {tab==='data'&&<>
        <Group label="Sort & Filter"><Action icon="sort" label={labels.Sort} onClick={p.onSort}/><Action icon="filter" label={labels.Filter} onClick={p.onFilter}/></Group><Divider/>
        <Group label={labels.DataTools}><Action icon="table" label={labels.Validation} onClick={p.onValidation}/><Action icon="conditional" label={labels.Conditional} onClick={p.onConditional}/><Action icon="name" label={labels.NamedRange} onClick={p.onNamedRange}/></Group>
      </>}

      {tab==='view'&&<>
        <Group label="Window"><Action icon="freeze" label={labels.Freeze} onClick={p.onFreezeToggle||p.onFreeze}/><Action icon="table" label={labels.Gridlines} onClick={p.onGridlinesToggle||(()=>{})} active={p.gridlines!==false}/></Group><Divider/>
        <Group label={labels.Sheets}><Action icon="plus" label={labels.NewSheet} onClick={p.onAddSheet}/><Action icon="rename" label={labels.Rename} onClick={p.onRename}/><Action icon="trash" label={labels.Delete} onClick={p.onDeleteSheet}/></Group><Divider/>
        <Group label="Merge"><Action icon="merge" label={labels.Merge} onClick={p.onMerge}/><Action icon="merge" label={labels.Unmerge} onClick={p.onUnmerge}/></Group>
      </>}
    </div>
  </div>;
>>>>>>> 0fb98fc (update sheet ui/ux)
}
