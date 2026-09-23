/* eslint-disable react/no-unescaped-entities */
'use client';
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
}
