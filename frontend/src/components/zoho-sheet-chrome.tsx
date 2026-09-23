'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Menu = 'File'|'Edit'|'View'|'Insert'|'Format'|'Data'|'Review'|'Tools'|'Help'|null;
type Props = {
  title: string;
  selected: string;
  formulaValue: string;
  display: string;
  editing: boolean;
  saved: boolean;
  saving: boolean;
  ar?: boolean;
  gridlines: boolean;
  canUndo: boolean;
  canRedo: boolean;
  fontFamily: string;
  fontSize: number;
  onFontFamily: (v:string)=>void;
  onFontSize: (v:number)=>void;
  onFormulaChange: (v:string)=>void;
  onFormulaCommit: ()=>void;
  onBeginEdit: ()=>void;
  onUndo: ()=>void;
  onRedo: ()=>void;
  onSave: ()=>void;
  onPrint: ()=>void;
  onExport: ()=>void;
  onFind: ()=>void;
  onCopy: ()=>void;
  onCut: ()=>void;
  onPaste: ()=>void;
  onClear: ()=>void;
  onPaint: ()=>void;
  onBorder: ()=>void;
  onBold: ()=>void;
  onItalic: ()=>void;
  onUnderline: ()=>void;
  onStrike: ()=>void;
  onColor: (v:string)=>void;
  onBg: (v:string)=>void;
  onAlign: (v:'start'|'center'|'end')=>void;
  onFormat: (v:string)=>void;
  onMerge: ()=>void;
  onSort: ()=>void;
  onFilter: ()=>void;
  onValidation: ()=>void;
  onConditional: ()=>void;
  onNamedRange: ()=>void;
  onTable: ()=>void;
  onPivot: ()=>void;
  onChart: ()=>void;
  onAddSheet: ()=>void;
  onDeleteSheet: ()=>void;
  onRename: ()=>void;
  onFreeze: ()=>void;
  onGridlines: ()=>void;
  onInsertRows: ()=>void;
  onDeleteRows: ()=>void;
  onInsertColumns: ()=>void;
  onDeleteColumns: ()=>void;
  onHideRow: ()=>void;
  onHideColumn: ()=>void;
  onUnhideRows: ()=>void;
  onUnhideColumns: ()=>void;
  onAddComment: ()=>void;
  onHelp: ()=>void;
  onInsertFunction: (fn:string)=>void;
  children?: ReactNode;
};

const fonts=['Roboto','Zoho Puvi','Lato','Open Sans','Droid Sans','Droid Serif','Liberation Serif','Patrick Hand','Roboto Mono','Roboto Slab','Source Sans Pro','Ubuntu'];
const functions=[['ABS','Mathematical','Returns the absolute value of a number. The absolute value of any number is its value without the +/- sign.'],['ACOS','Mathematical','Returns the arccosine of a number.'],['ACOT','Mathematical','Returns the arccotangent of a number.'],['ACOTH','Mathematical','Returns the inverse hyperbolic cotangent.'],['ASIN','Mathematical','Returns the arcsine of a number.'],['ATAN','Mathematical','Returns the arctangent of a number.'],['AVERAGE','Statistical','Returns the average of its arguments.'],['COUNT','Statistical','Counts the number of numeric values in a range.'],['IF','Logical','Returns one value if a condition is true and another value if it is false.'],['SUM','Mathematical','Adds all numbers in a range.']];

function Svg({children}:{children:ReactNode}){return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>}
function ToolButton({label,title,onClick,disabled=false,active=false,children}:{label?:string;title?:string;onClick?:()=>void;disabled?:boolean;active?:boolean;children:ReactNode}){return <button type="button" title={title||label} aria-label={title||label} disabled={disabled} onClick={onClick} className={`flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-[#30343b] ${active?'bg-[#e7f0ff] text-[#1967d2]':'hover:bg-[#eef1f4]'} disabled:opacity-35`}>{children}{label&&<span className="ml-1 text-[11px]">{label}</span>}</button>}
function MenuItem({label,onClick,shortcut,disabled=false,arrow=false,active=false}:{label:string;onClick?:()=>void;shortcut?:string;disabled?:boolean;arrow?:boolean;active?:boolean}){return <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-[13px] ${active?'bg-[#e8f5ed] text-[#0b9f4b]':'text-[#30343b] hover:bg-[#f3f5f7]'} disabled:text-[#a7a7a7]`}>{<span>{label}</span>}<span className="text-[11px] text-[#8b8f94]">{shortcut|| (arrow?'›':'')}</span></button>}
function Divider(){return <div className="my-1 h-px bg-[#e8eaed]"/>}

export function ZohoSheetChrome(p:Props){
 const [menu,setMenu]=useState<Menu>(null);
 const [submenu,setSubmenu]=useState<string|null>(null);
 const [fontOpen,setFontOpen]=useState(false);
 const [sizeOpen,setSizeOpen]=useState(false);
 const [fnOpen,setFnOpen]=useState(true);
 const [fnQuery,setFnQuery]=useState('');
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node)){setMenu(null);setSubmenu(null);setFontOpen(false);setSizeOpen(false)}};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[]);
 const pick=(fn:()=>void)=>{fn();setMenu(null);setSubmenu(null)};
 const filtered=functions.filter(x=>x[0].toLowerCase().includes(fnQuery.toLowerCase())||x[1].toLowerCase().includes(fnQuery.toLowerCase()));
 return <div ref={root} className="print:hidden bg-white text-[#242424]" dir="ltr">
  <div className="flex h-[52px] items-center border-b border-[#e5e5e5] bg-white">
   <button className="flex h-full w-[124px] shrink-0 items-center gap-3 bg-[#0fa85a] px-4 text-white" onClick={()=>window.location.href='/office/new'}><span className="grid h-7 w-7 place-items-center rounded-sm border-2 border-white text-[17px] font-semibold">▦</span><span className="text-[20px] font-medium">Sheet</span></button>
   <div className="flex min-w-0 flex-1 items-center gap-3 px-4"><span className="truncate text-[16px] font-semibold">{p.title||'Untitled Spreadsheet'}</span><button className="text-[#8b8f94] hover:text-[#30343b]" title="Star">☆</button></div>
   <div className="flex items-center gap-2 px-3"><button onClick={p.onFind} className="flex h-8 w-[205px] items-center gap-2 rounded-md bg-[#f5f6f7] px-3 text-left text-[12px] text-[#6d7278]"><span>⌕</span><span>Search in this sheet</span></button><button onClick={()=>{void navigator.clipboard?.writeText(window.location.href);}} className="flex h-8 items-center gap-1 rounded-md border border-[#18a85b] px-3 text-[12px] font-medium text-[#0b9f4b]">Share⌄</button><button onClick={p.onHelp} className="grid h-8 w-8 place-items-center rounded hover:bg-[#f3f5f7]">⚙</button><button onClick={p.onHelp} className="grid h-8 w-8 place-items-center rounded hover:bg-[#f3f5f7]">ⓘ</button><div className="grid h-8 w-8 place-items-center rounded-full bg-[#c6d2e8] text-[11px] font-semibold text-[#36506f]">OS</div></div>
  </div>
  <div className="relative flex h-[34px] items-center border-b border-[#dfe2e5] px-2 text-[13px]">
   {(['File','Edit','View','Insert','Format','Data','Review','Tools','Help'] as const).map(label=><button key={label} onClick={()=>{setMenu(menu===label?null:label);setSubmenu(null)}} className={`h-full px-3 hover:bg-[#f3f5f7] ${menu===label?'font-medium text-[#111]':''}`}>{label}</button>)}
   {menu&&<div className="absolute left-1 top-[33px] z-[90] min-w-[190px] rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]">
    {menu==='File'&&<><MenuItem label="New Spreadsheet" onClick={()=>pick(p.onAddSheet)}/><MenuItem label="Open"/><MenuItem label="Save" shortcut="Ctrl+S" onClick={()=>pick(p.onSave)}/><MenuItem label="Print" shortcut="Ctrl+P" onClick={()=>pick(p.onPrint)}/><MenuItem label="Export" onClick={()=>pick(p.onExport)}/></>}
    {menu==='Edit'&&<><MenuItem label="Undo" shortcut="Ctrl+Z" onClick={()=>pick(p.onUndo)} disabled={!p.canUndo}/><MenuItem label="Redo" shortcut="Ctrl+Y" onClick={()=>pick(p.onRedo)} disabled={!p.canRedo}/><Divider/><MenuItem label="Cut" shortcut="Ctrl+X" onClick={()=>pick(p.onCut)}/><MenuItem label="Copy" shortcut="Ctrl+C" onClick={()=>pick(p.onCopy)}/><MenuItem label="Paste" shortcut="Ctrl+V" onClick={()=>pick(p.onPaste)}/><MenuItem label="Clear" onClick={()=>pick(p.onClear)}/></>}
    {menu==='View'&&<><MenuItem label="Gridlines" onClick={()=>pick(p.onGridlines)} active={p.gridlines}/><MenuItem label="Freeze" onClick={()=>pick(p.onFreeze)}/><Divider/><div className="relative" onMouseEnter={()=>setSubmenu('hide')}><MenuItem label="Hide & Unhide" arrow active={submenu==='hide'}/>{submenu==='hide'&&<div className="absolute left-full top-0 ml-1 w-[215px] rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"><MenuItem label="Hide Rows" shortcut="Ctrl+Alt+9" onClick={()=>pick(p.onHideRow)}/><MenuItem label="Hide Columns" shortcut="Ctrl+Alt+0" onClick={()=>pick(p.onHideColumn)}/><Divider/><MenuItem label="Unhide Rows" shortcut="Ctrl+Shift+9" onClick={()=>pick(p.onUnhideRows)}/><MenuItem label="Unhide Columns" shortcut="Ctrl+Shift+0" onClick={()=>pick(p.onUnhideColumns)}/></div>}</div><MenuItem label="Fullscreen" shortcut="F11" onClick={()=>pick(()=>document.documentElement.requestFullscreen?.())}/></>}
    {menu==='Insert'&&<><MenuItem label="Rows" onClick={()=>pick(p.onInsertRows)}/><MenuItem label="Columns" onClick={()=>pick(p.onInsertColumns)}/><MenuItem label="Chart" onClick={()=>pick(p.onChart)}/><MenuItem label="Table" onClick={()=>pick(p.onTable)}/><MenuItem label="Pivot Table" onClick={()=>pick(p.onPivot)}/><MenuItem label="Named Range" onClick={()=>pick(p.onNamedRange)}/><MenuItem label="New Sheet" onClick={()=>pick(p.onAddSheet)}/></>}
    {menu==='Format'&&<div className="relative" onMouseEnter={()=>setSubmenu('format')}><MenuItem label="Format Cells" arrow active={submenu==='format'}/>{submenu==='format'&&<div className="absolute left-full top-0 ml-1 w-[205px] rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"><MenuItem label="General" onClick={()=>pick(()=>p.onFormat('general'))}/><MenuItem label="Number" onClick={()=>pick(()=>p.onFormat('number'))}/><MenuItem label="Currency" onClick={()=>pick(()=>p.onFormat('currency'))}/><MenuItem label="Date" onClick={()=>pick(()=>p.onFormat('date'))}/><MenuItem label="Percentage" onClick={()=>pick(()=>p.onFormat('percent'))}/><MenuItem label="Text" onClick={()=>pick(()=>p.onFormat('text'))}/><MenuItem label="Custom…" onClick={()=>pick(()=>p.onFormat('general'))}/></div>}<MenuItem label="Conditional Formatting" onClick={()=>pick(p.onConditional)}/><MenuItem label="Bold" shortcut="Ctrl+B" onClick={()=>pick(p.onBold)}/><MenuItem label="Italic" shortcut="Ctrl+I" onClick={()=>pick(p.onItalic)}/><MenuItem label="Underline" shortcut="Ctrl+U" onClick={()=>pick(p.onUnderline)}/></div>}
    {menu==='Data'&&<><MenuItem label="Sort" onClick={()=>pick(p.onSort)}/><MenuItem label="Filter" onClick={()=>pick(p.onFilter)}/><MenuItem label="Data Validation" onClick={()=>pick(p.onValidation)}/><MenuItem label="Named Range" onClick={()=>pick(p.onNamedRange)}/></>}
    {menu==='Review'&&<><div className="relative" onMouseEnter={()=>setSubmenu('comment')}><MenuItem label="Comment" arrow active={submenu==='comment'}/>{submenu==='comment'&&<div className="absolute left-full top-0 ml-1 w-[230px] rounded-md border border-[#dadde0] bg-white py-1 shadow-[0_5px_18px_rgba(0,0,0,.15)]"><MenuItem label="Add Comment…" onClick={()=>pick(p.onAddComment)}/><MenuItem label="Show Comments" onClick={()=>pick(p.onAddComment)}/></div>}</div><MenuItem label="Note" shortcut="Shift+F2"/><MenuItem label="Spreadsheet Statistics…"/><MenuItem label="Translate…"/></>}
    {menu==='Tools'&&<><MenuItem label="Find" shortcut="Ctrl+F" onClick={()=>pick(p.onFind)}/><MenuItem label="Freeze Panes" onClick={()=>pick(p.onFreeze)}/><MenuItem label="Help" onClick={()=>pick(p.onHelp)}/></>}
    {menu==='Help'&&<><MenuItem label="Help Center" onClick={()=>pick(p.onHelp)}/><MenuItem label="Keyboard Shortcuts"/><MenuItem label="About Sheet" onClick={()=>pick(p.onHelp)}/></>}
   </div>}
  </div>
  <div className="flex h-[42px] items-center gap-1 border-b border-[#d9dde1] bg-white px-2 shadow-[0_1px_2px_rgba(0,0,0,.08)]">
   <ToolButton title="Print" onClick={p.onPrint}><Svg><path d="M6 9V4h12v5M6 18H4V10h16v8h-2M7 15h10v5H7z"/></Svg></ToolButton><ToolButton title="Undo" onClick={p.onUndo} disabled={!p.canUndo}><Svg><path d="M9 8 4 12l5 4"/><path d="M4 12h9a6 6 0 0 1 6 6"/></Svg></ToolButton><ToolButton title="Redo" onClick={p.onRedo} disabled={!p.canRedo}><Svg><path d="m15 8 5 4-5 4"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></Svg></ToolButton><ToolButton title="Format Painter" onClick={p.onPaint}><Svg><path d="M8 4h8v5H8zM10 9v11M14 9v11"/></Svg></ToolButton><ToolButton title="Clear Formatting" onClick={p.onClear}><Svg><path d="m5 19 14-14M7 7l10 10"/></Svg></ToolButton><div className="mx-1 h-6 w-px bg-[#e2e5e8]"/>
   <div className="relative"><button onClick={()=>{setFontOpen(!fontOpen);setSizeOpen(false)}} className="flex h-8 min-w-[124px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontFamily}<span>⌄</span></button>{fontOpen&&<div className="absolute left-0 top-9 z-[100] w-[210px] rounded-md border bg-white py-1 shadow-xl">{fonts.map(f=><button key={f} onClick={()=>{p.onFontFamily(f);setFontOpen(false)}} className={`block w-full px-3 py-2 text-left text-[14px] hover:bg-[#f2f4f6] ${f===p.fontFamily?'font-semibold':''}`}>{f}</button>)}</div>}</div>
   <div className="relative"><button onClick={()=>{setSizeOpen(!sizeOpen);setFontOpen(false)}} className="flex h-8 min-w-[54px] items-center justify-between rounded border border-[#d8dce1] bg-white px-2 text-[13px]">{p.fontSize}<span>⌄</span></button>{sizeOpen&&<div className="absolute left-0 top-9 z-[100] grid w-[140px] grid-cols-4 rounded-md border bg-white p-1 shadow-xl">{[8,9,10,11,12,14,16,18,20,24,28,32].map(s=><button key={s} onClick={()=>{p.onFontSize(s);setSizeOpen(false)}} className="rounded px-2 py-2 text-[12px] hover:bg-[#f2f4f6]">{s}</button>)}</div>}</div>
   <ToolButton title="Bold" onClick={p.onBold}><b className="text-[16px]">B</b></ToolButton><ToolButton title="Italic" onClick={p.onItalic}><i className="text-[16px]">I</i></ToolButton><ToolButton title="Underline" onClick={p.onUnderline}><u className="text-[16px]">U</u></ToolButton><ToolButton title="Strikethrough" onClick={p.onStrike}><span className="text-[15px]">S̶</span></ToolButton>
   <label title="Text color" className="grid h-8 w-8 cursor-pointer place-items-center rounded hover:bg-[#eef1f4]"><span className="text-[17px] font-bold" style={{color:'#e21d3e'}}>A</span><input className="sr-only" type="color" onChange={e=>p.onColor(e.target.value)}/></label><label title="Fill color" className="grid h-8 w-8 cursor-pointer place-items-center rounded hover:bg-[#eef1f4]"><span className="h-4 w-5 border-b-2 border-[#e6c900] bg-[#fff]"/><input className="sr-only" type="color" onChange={e=>p.onBg(e.target.value)}/></label>
   <div className="mx-1 h-6 w-px bg-[#e2e5e8]"/><ToolButton title="Borders" onClick={p.onBorder}><Svg><rect x="5" y="5" width="14" height="14"/><path d="M5 10h14M10 5v14"/></Svg></ToolButton><ToolButton title="Merge Cells" onClick={p.onMerge}><Svg><rect x="5" y="7" width="14" height="10"/><path d="M10 12h4"/></Svg></ToolButton><select title="Alignment" aria-label="Alignment" className="h-8 rounded border border-[#d8dce1] bg-white px-2 text-[12px]" onChange={e=>p.onAlign(e.target.value as 'start'|'center'|'end')}><option value="start">≡ Left</option><option value="center">≡ Center</option><option value="end">≡ Right</option></select><select title="Number format" aria-label="Number format" className="h-8 rounded border border-[#d8dce1] bg-white px-2 text-[12px]" onChange={e=>p.onFormat(e.target.value)}><option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">%</option><option value="date">Date</option></select><div className="ml-auto flex items-center gap-2 text-[11px] text-[#73777c]"><span>{p.saving?'Saving…':p.saved?'Saved':'Unsaved'}</span></div>
  </div>
  <div className="flex h-[34px] items-center border-b border-[#d9dde1] bg-[#fbfbfb] px-2"><div className="flex h-7 w-[96px] items-center rounded border border-[#d4d7da] bg-white px-2 font-mono text-[12px] font-semibold">{p.selected}</div><div className="mx-2 text-[16px] font-serif italic text-[#444]">fx</div><div className="flex min-w-0 flex-1 items-center rounded border border-[#d4d7da] bg-white px-2"><input aria-label="Formula bar" className="h-6 min-w-0 flex-1 bg-transparent text-[12px] outline-none" value={p.formulaValue} placeholder={p.display||'Enter value or formula'} onFocus={p.onBeginEdit} onChange={e=>p.onFormulaChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')p.onFormulaCommit()}}/></div><button onClick={p.onFormulaCommit} className="ml-2 rounded border px-2 text-[11px]">✓</button></div>
  <div className="relative">
   {fnOpen&&<aside className="absolute right-0 top-0 z-[70] h-[calc(100vh-162px)] w-[380px] overflow-hidden border-l border-[#e2e5e8] bg-white shadow-[-4px_0_12px_rgba(0,0,0,.08)]"><div className="flex h-10 items-center justify-between border-b px-3"><span className="text-[17px] font-semibold">Functions</span><button onClick={()=>setFnOpen(false)} className="text-[#9aa0a6]">×</button></div><div className="border-b px-3 py-2"><div className="flex h-8 items-center rounded border bg-white px-2"><span className="mr-2 text-[#7d8389]">⌕</span><input value={fnQuery} onChange={e=>setFnQuery(e.target.value)} placeholder="Search function" className="min-w-0 flex-1 text-[12px] outline-none"/></div></div><div className="h-[calc(100%-170px)] overflow-auto">{filtered.map(([name,cat,desc])=><button key={name} onClick={()=>p.onInsertFunction(name)} className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-[#f3f5f7]"><span className="font-mono text-[12px]">{name}</span><span className="text-[10px] text-[#7b8086]">{cat}</span></button>)}</div><div className="border-t bg-white p-4"><div className="text-[12px] font-semibold text-[#18a957]">ƒx {filtered[0]?.[0]||'ABS'}</div><div className="mt-3 text-[12px] leading-5 text-[#333]">{filtered[0]?.[2]||'Select a function to view its description.'}</div><div className="mt-4 text-[12px] text-[#777]">Syntax</div><div className="mt-1 rounded border bg-[#fafafa] px-2 py-2 font-mono text-[11px]">{filtered[0]?.[0]||'ABS'}(number)</div><button onClick={()=>p.onInsertFunction(filtered[0]?.[0]||'ABS')} className="mt-3 w-full rounded bg-[#11a957] py-2 text-[12px] font-semibold text-white">Insert</button></div></aside>}
   {!fnOpen&&<button onClick={()=>setFnOpen(true)} className="absolute right-0 top-0 z-[60] rounded-l border bg-white px-2 py-3 text-[12px] shadow">ƒx</button>}
  </div>
 </div>;
}
