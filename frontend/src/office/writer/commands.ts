import type { WriterBlock, WriterDocument, WriterRun, WriterSection, WriterCitation, WriterCaption, WriterCrossReference, WriterIndexEntry } from './model';

export function cloneWriterDocument(doc: WriterDocument): WriterDocument { return JSON.parse(JSON.stringify(doc)) as WriterDocument; }
export function setBlockType(doc: WriterDocument, id: string, type: WriterBlock['type']): WriterDocument { const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id); if(block) block.type=type; return next; }
export function setBlockAlignment(doc: WriterDocument, id: string, align: WriterBlock['align']): WriterDocument { const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id); if(block) block.align=align; return next; }
export function setBlockSpacing(doc: WriterDocument, id: string, patch: Pick<WriterBlock,'lineSpacing'|'spaceBefore'|'spaceAfter'>): WriterDocument { const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id); if(block) Object.assign(block,patch); return next; }
export function toggleList(doc: WriterDocument, id: string, ordered: boolean): WriterDocument { const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id); if(block){ if(block.type==='list-item'&&block.ordered===ordered) block.type='paragraph'; else {block.type='list-item';block.ordered=ordered;} } return next; }
export function addParagraph(doc: WriterDocument, afterId?: string): WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'paragraph',align:'start',runs:[{text:''}],lineSpacing:1.5,spaceAfter:8}; const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(index<0?next.blocks.length:index+1,0,block); return next; }
export function removeBlock(doc: WriterDocument,id:string):WriterDocument{const next=cloneWriterDocument(doc);if(next.blocks.length<=1)return next;next.blocks=next.blocks.filter(x=>x.id!==id);return next;}
export function insertPageBreak(doc: WriterDocument, afterId?: string): WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'page-break',align:'start',runs:[]}; const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(index<0?next.blocks.length:index+1,0,block); return next; }
export function insertTable(doc: WriterDocument, rows=3, cols=3, afterId?: string): WriterDocument { const next=cloneWriterDocument(doc); const table=Array.from({length:rows},()=>Array.from({length:cols},()=>({id:crypto.randomUUID(),runs:[{text:''}]}))); const block:WriterBlock={id:crypto.randomUUID(),type:'table',align:'start',runs:[],table:{rows:table,bordered:true},spaceAfter:12}; const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(index<0?next.blocks.length:index+1,0,block); return next; }
export function insertImage(doc: WriterDocument, src:string, alt='Image', afterId?:string):WriterDocument{const next=cloneWriterDocument(doc);const block:WriterBlock={id:crypto.randomUUID(),type:'image',align:'center',runs:[],image:{src,alt,width:560},spaceAfter:12};const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1;next.blocks.splice(index<0?next.blocks.length:index+1,0,block);return next;}
export function updatePageSettings(doc: WriterDocument, patch: Partial<WriterDocument['page']>): WriterDocument { const next=cloneWriterDocument(doc); next.page={...next.page,...patch}; return next; }
export function mergeAdjacentRuns(runs: WriterRun[]): WriterRun[] { const out:WriterRun[]=[]; for(const run of runs){const p=out[out.length-1]; if(p&&p.bold===run.bold&&p.italic===run.italic&&p.underline===run.underline&&p.strike===run.strike&&p.fontFamily===run.fontFamily&&p.fontSize===run.fontSize&&p.color===run.color&&p.href===run.href&&p.highlight===run.highlight&&p.verticalAlign===run.verticalAlign)p.text+=run.text;else out.push({...run});} return out.length?out:[{text:''}]; }


export type WriterRunPatch = Partial<Pick<WriterRun,'bold'|'italic'|'underline'|'strike'|'fontFamily'|'fontSize'|'color'|'highlight'|'verticalAlign'>>;
export function patchBlockRuns(doc: WriterDocument, id: string, patch: WriterRunPatch): WriterDocument {
  const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id); if(!block)return next;
  block.runs=block.runs.map(r=>({...r,...patch})); return next;
}
export function setListOrdered(doc: WriterDocument, id: string, ordered: boolean): WriterDocument {
  const next=cloneWriterDocument(doc); const block=next.blocks.find(x=>x.id===id);
  if(block){ block.type='list-item'; block.ordered=ordered; } return next;
}
export function addTableRow(doc: WriterDocument,id:string,index?:number):WriterDocument{
 const next=cloneWriterDocument(doc);const b=next.blocks.find(x=>x.id===id);if(!b?.table)return next;const cols=b.table.rows[0]?.length||1;const row=Array.from({length:cols},()=>({id:crypto.randomUUID(),runs:[{text:''}]}));const at=Math.max(0,Math.min(index??b.table.rows.length,b.table.rows.length));b.table.rows.splice(at,0,row);return next;
}
export function removeTableRow(doc: WriterDocument,id:string,index:number):WriterDocument{
 const next=cloneWriterDocument(doc);const b=next.blocks.find(x=>x.id===id);if(!b?.table||b.table.rows.length<=1)return next;b.table.rows.splice(Math.max(0,Math.min(index,b.table.rows.length-1)),1);return next;
}
export function addTableColumn(doc: WriterDocument,id:string,index?:number):WriterDocument{
 const next=cloneWriterDocument(doc);const b=next.blocks.find(x=>x.id===id);if(!b?.table)return next;const cols=b.table.rows[0]?.length||0;const at=Math.max(0,Math.min(index??cols,cols));b.table.rows.forEach(row=>row.splice(at,0,{id:crypto.randomUUID(),runs:[{text:''}]}));return next;
}
export function removeTableColumn(doc: WriterDocument,id:string,index:number):WriterDocument{
 const next=cloneWriterDocument(doc);const b=next.blocks.find(x=>x.id===id);if(!b?.table)return next;const cols=b.table.rows[0]?.length||0;if(cols<=1)return next;b.table.rows.forEach(row=>row.splice(Math.max(0,Math.min(index,cols-1)),1));return next;
}
export function toggleTableBorders(doc: WriterDocument,id:string):WriterDocument{const next=cloneWriterDocument(doc);const b=next.blocks.find(x=>x.id===id);if(b?.table)b.table.bordered=b.table.bordered===false;return next;}
export function insertHorizontalRule(doc: WriterDocument,afterId?:string):WriterDocument{const next=cloneWriterDocument(doc);const b:WriterBlock={id:crypto.randomUUID(),type:'paragraph',align:'start',runs:[{text:'────────────'}],spaceAfter:12};const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1;next.blocks.splice(i<0?next.blocks.length:i+1,0,b);return next;}

export function updateBlockLayout(doc: WriterDocument, id: string, patch: Partial<Pick<WriterBlock,'indentLeftMm'|'indentRightMm'|'firstLineIndentMm'|'keepWithNext'>>): WriterDocument {
 const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b) Object.assign(b,patch); return next;
}
export function insertTableOfContents(doc: WriterDocument, afterId?: string): WriterDocument {
 const next=cloneWriterDocument(doc); const headings=next.blocks.filter(b=>/^heading[1-3]$/.test(b.type)).map((b,i)=>({text:`${i+1}. ${b.runs.map(r=>r.text).join('')}`}));
 const block:WriterBlock={id:crypto.randomUUID(),type:'paragraph',align:'start',runs:[{text:headings.length?headings.map(x=>x.text).join('\n'):'Table of Contents\n(Add Heading 1/2/3 blocks, then refresh the TOC.)'}],spaceAfter:16,keepWithNext:false};
 const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(index<0?next.blocks.length:index+1,0,block); return next;
}
export function addBookmark(doc: WriterDocument, blockId: string, name: string): WriterDocument {
 const next=cloneWriterDocument(doc); const clean=name.trim().replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,120); if(!clean)return next;
 next.bookmarks=next.bookmarks.filter(x=>x.name!==clean); next.bookmarks.push({id:crypto.randomUUID(),name:clean,blockId}); return next;
}
export function addFootnote(doc: WriterDocument, blockId: string, text: string): WriterDocument {
 const next=cloneWriterDocument(doc); const value=text.trim(); if(!value)return next; const marker=String(next.footnotes.length+1); next.footnotes.push({id:crypto.randomUUID(),marker,text:value.slice(0,4000),blockId});
 const b=next.blocks.find(x=>x.id===blockId); if(b) b.runs=[...b.runs,{text:` [${marker}]`,verticalAlign:'superscript'}]; return next;
}

export function replaceAllText(doc: WriterDocument, find: string, replace: string): WriterDocument {
 const next=cloneWriterDocument(doc); const q=find; if(!q)return next;
 for(const b of next.blocks){ b.runs=b.runs.map(r=>({...r,text:r.text.split(q).join(replace)})); if(b.table) for(const row of b.table.rows) for(const c of row) c.runs=c.runs.map(r=>({...r,text:r.text.split(q).join(replace)})); }
 return next;
}


export function updateSection(doc: WriterDocument, sectionId: string, patch: Partial<WriterSection>): WriterDocument { const next=cloneWriterDocument(doc); const section=next.sections.find(s=>s.id===sectionId); if(section) Object.assign(section,patch); return next; }
export function addSection(doc: WriterDocument, afterBlockId?: string, patch: Partial<WriterSection> = {}): WriterDocument { const next=cloneWriterDocument(doc); const section:WriterSection={id:crypto.randomUUID(),columns:1,columnGapMm:8,breakType:'next-page',...patch}; const at=afterBlockId?next.blocks.findIndex(b=>b.id===afterBlockId):-1; const target=next.blocks[Math.max(0,at<0?next.blocks.length-1:at+1)]; section.startBlockId=target?.id; next.sections.push(section); if(target) target.sectionId=section.id; return next; }
export function insertSectionBreak(doc: WriterDocument, afterBlockId?: string, columns=1, breakType:'next-page'|'continuous'|'even-page'|'odd-page'='next-page'): WriterDocument { const next=addSection(doc,afterBlockId,{columns:Math.max(1,Math.min(4,columns)),columnGapMm:8,breakType}); const at=afterBlockId?next.blocks.findIndex(b=>b.id===afterBlockId):-1; const sec=next.sections[next.sections.length-1]; const breakBlock:WriterBlock={id:crypto.randomUUID(),type:'page-break',align:'start',runs:[],sectionId:sec?.id}; if(breakType==='continuous'){ next.blocks.splice(at<0?next.blocks.length:at+1,0,{...breakBlock,type:'paragraph',runs:[]}); } else { next.blocks.splice(at<0?next.blocks.length:at+1,0,breakBlock); } if(sec) sec.startBlockId=breakBlock.id; return next; }
export function insertEquation(doc: WriterDocument, expression:string, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'equation',align:'center',runs:[{text:expression.trim()||'x = y'}],spaceAfter:12}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function insertSymbol(doc: WriterDocument, symbol:string, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'symbol',align:'center',runs:[{text:symbol||'©'}],spaceAfter:8}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function addCitation(doc: WriterDocument, citation: Omit<WriterCitation,'id'>, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const c={id:crypto.randomUUID(),...citation}; next.citations.push(c); const text=`[${next.citations.length}]`; const block:WriterBlock={id:crypto.randomUUID(),type:'paragraph',align:'start',runs:[{text}],spaceAfter:4}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function insertBibliography(doc: WriterDocument, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'bibliography',align:'start',runs:[{text:'Bibliography'}],spaceBefore:12,spaceAfter:8}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function insertIndex(doc: WriterDocument, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'index',align:'start',runs:[{text:'Index'}],spaceBefore:12,spaceAfter:8}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function addCaption(doc: WriterDocument, blockId:string, label='Figure', text=''):WriterDocument { const next=cloneWriterDocument(doc); const number=next.captions.filter(c=>c.label===label).length+1; next.captions.push({id:crypto.randomUUID(),blockId,label,text,number}); return next; }
export function addCrossReference(doc: WriterDocument, targetId:string, name:string, display:'label'|'number'|'text'='label'):WriterDocument { const next=cloneWriterDocument(doc); next.crossReferences.push({id:crypto.randomUUID(),targetId,name,display}); const target=next.blocks.find(b=>b.id===targetId); if(target) target.runs=[...(target.runs||[]),{text:` [${name}]`,verticalAlign:'superscript'}]; return next; }
export function addIndexEntry(doc: WriterDocument, blockId:string, term:string, subentry?:string):WriterDocument { const next=cloneWriterDocument(doc); const value=term.trim(); if(value) next.indexEntries.push({id:crypto.randomUUID(),blockId,term:value,subentry}); return next; }
export function updateImage(doc: WriterDocument, id:string, patch: NonNullable<WriterBlock['image']>):WriterDocument { const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b?.image) b.image={...b.image,...patch}; return next; }
export function updateTableOptions(doc: WriterDocument, id:string, patch: NonNullable<WriterBlock['table']>):WriterDocument { const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b?.table) b.table={...b.table,...patch}; return next; }
export function setTableCellVerticalAlign(doc: WriterDocument,id:string,row:number,col:number,verticalAlign:'top'|'middle'|'bottom'):WriterDocument { const next=cloneWriterDocument(doc); const c=next.blocks.find(x=>x.id===id)?.table?.rows[row]?.[col]; if(c) c.verticalAlign=verticalAlign; return next; }
export function addNestedTable(doc: WriterDocument,id:string,row:number,col:number,rows=2,cols=2):WriterDocument { const next=cloneWriterDocument(doc); const c=next.blocks.find(x=>x.id===id)?.table?.rows[row]?.[col]; if(!c)return next; c.nestedTable={bordered:true,rows:Array.from({length:rows},()=>Array.from({length:cols},()=>({id:crypto.randomUUID(),runs:[{text:''}],verticalAlign:'top' as const}))) }; return next; }
