import type { WriterBlock, WriterDocument, WriterRun, WriterSection, WriterCitation, WriterCitationSource, WriterCitationStyle, WriterCaption, WriterCrossReference, WriterIndexEntry } from './model';

export function cloneWriterDocument(doc: WriterDocument): WriterDocument { return JSON.parse(JSON.stringify(doc)) as WriterDocument; }

export function setParagraphStyle(doc: WriterDocument, id: string, style: 'paragraph'|'title'|'subtitle'|'heading1'|'heading2'|'heading3'): WriterDocument {
 const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(!b)return next;
 b.type=style;
 const spacing:{spaceBefore?:number;spaceAfter?:number;lineSpacing?:number}={paragraph:{spaceAfter:8,lineSpacing:1.5},title:{spaceBefore:0,spaceAfter:16,lineSpacing:1.1},subtitle:{spaceBefore:0,spaceAfter:12,lineSpacing:1.2},heading1:{spaceBefore:16,spaceAfter:8,lineSpacing:1.2},heading2:{spaceBefore:12,spaceAfter:6,lineSpacing:1.25},heading3:{spaceBefore:8,spaceAfter:4,lineSpacing:1.3}}[style]; Object.assign(b,spacing); return next;
}

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

export function setBlockDirection(doc: WriterDocument, id: string, direction: WriterBlock['direction']): WriterDocument {
  return normalizeWriterDocument({...doc, blocks: doc.blocks.map(b => b.id === id ? {...b, direction: direction || 'auto'} : b)});
}

export function updateBlockLayout(doc: WriterDocument, id: string, patch: Partial<Pick<WriterBlock,'indentLeftMm'|'indentRightMm'|'firstLineIndentMm'|'keepWithNext'>>): WriterDocument {
 const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b) Object.assign(b,patch); return next;
}
function writerBlockPlainText(block: WriterBlock): string {
 return block.runs?.map(r => r.text || '').join('') || '';
}

function estimatedPageNumbers(doc: WriterDocument): Map<string, number> {
 const pages = new Map<string, number>();
 let page = Math.max(1, doc.page.pageNumberStart ?? 1);
 for (const block of doc.blocks) {
   if (block.type === 'page-break') { page += 1; continue; }
   pages.set(block.id, page);
 }
 return pages;
}

function tocRuns(doc: WriterDocument): WriterRun[] {
 const pages = estimatedPageNumbers(doc);
 const headings = doc.blocks.filter(b => ['heading1','heading2','heading3'].includes(b.type));
 const runs: WriterRun[] = [{text:'Table of Contents'}, {text:'\n'}];
 for (const h of headings) {
   const level = h.type === 'heading1' ? 0 : h.type === 'heading2' ? 1 : 2;
   const indent = '  '.repeat(level);
   const title = writerBlockPlainText(h).trim() || '(Untitled heading)';
   const page = pages.get(h.id) ?? 1;
   runs.push({text:`${indent}${title} ................................ ${page}\n`});
 }
 if (!headings.length) runs.push({text:'(No headings yet)'});
 return runs;
}

export function rebuildTableOfContents(doc: WriterDocument): WriterDocument {
 const next=cloneWriterDocument(doc);
 next.blocks.filter(b=>b.type==='toc').forEach(b=>{ b.runs=tocRuns(next); b.spaceAfter=16; b.keepWithNext=false; });
 return next;
}

export function insertTableOfContents(doc: WriterDocument, afterId?: string): WriterDocument {
 const next=cloneWriterDocument(doc);
 const block:WriterBlock={id:crypto.randomUUID(),type:'toc',align:'start',runs:tocRuns(doc),spaceAfter:16,keepWithNext:false};
 const index=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(index<0?next.blocks.length:index+1,0,block);
 return next;
}
export function addBookmark(doc: WriterDocument, blockId: string, name: string): WriterDocument {
 const next=cloneWriterDocument(doc); const clean=name.trim().replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,120); if(!clean)return next;
 next.bookmarks=next.bookmarks.filter(x=>x.name!==clean); next.bookmarks.push({id:crypto.randomUUID(),name:clean,blockId}); return next;
}
export function addEndnote(doc: WriterDocument, blockId: string, text: string): WriterDocument {
 const next=cloneWriterDocument(doc); const value=text.trim(); if(!value)return next; const marker=String(next.endnotes.length+1); next.endnotes.push({id:crypto.randomUUID(),marker,text:value.slice(0,4000),blockId});
 const b=next.blocks.find(x=>x.id===blockId); if(b) b.runs=[...b.runs,{text:` [${marker}]`,verticalAlign:'superscript'}]; return next;
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
export function addCitation(doc: WriterDocument, citation: Omit<WriterCitation,'id'>, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const blockId=crypto.randomUUID(); const sourceId=citation.sourceId||crypto.randomUUID(); const c={id:crypto.randomUUID(),...citation,sourceId,blockId}; next.citations.push(c); if(!next.citationSources.some(s=>s.id===sourceId)){ next.citationSources.push({id:sourceId,type:'other',author:citation.author,year:citation.year,title:citation.title,url:citation.url}); } const text=`[${next.citations.length}]`; const block:WriterBlock={id:blockId,type:'paragraph',align:'start',runs:[{text}],spaceAfter:4}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }

export function setCitationStyle(doc: WriterDocument, style: WriterCitationStyle): WriterDocument { const next=cloneWriterDocument(doc); next.citationStyle=style; return rebuildCitationDisplay(next); }

function citationSourceKey(source: Partial<WriterCitationSource>): string { return [source.type,source.author,source.year,source.title,source.containerTitle,source.publisher,source.edition,source.url,source.doi,source.isbn,source.accessedAt].map(v=>String(v||'').trim().toLowerCase()).join('\u001f'); }

export function findDuplicateCitationSource(doc: WriterDocument, source: Partial<WriterCitationSource>): WriterCitationSource | undefined { const key=citationSourceKey(source); return doc.citationSources.find(existing=>existing.id!==source.id && citationSourceKey(existing)===key); }

export function upsertCitationSource(doc: WriterDocument, source: Omit<WriterCitationSource,'id'> & {id?: string}): WriterDocument { const next=cloneWriterDocument(doc); const duplicate=findDuplicateCitationSource(next,source); const id=source.id||duplicate?.id||crypto.randomUUID(); const existing=next.citationSources.find(x=>x.id===id); const value={id,...source,type:source.type||'other'} as WriterCitationSource; if(existing) Object.assign(existing,value); else next.citationSources.push(value); for(const citation of next.citations){ if(citation.sourceId===duplicate?.id && duplicate?.id!==id) citation.sourceId=id; } return rebuildCitationDisplay(next); }

export function removeCitationSource(doc: WriterDocument, sourceId: string): WriterDocument { const next=cloneWriterDocument(doc); if(next.citations.some(c=>(c.sourceId||c.source)===sourceId)) return next; next.citationSources=next.citationSources.filter(s=>s.id!==sourceId); return next; }

export function rebuildCitationDisplay(doc: WriterDocument): WriterDocument { const next=cloneWriterDocument(doc); const numberBySource=new Map<string,number>(); let n=1; for(const citation of next.citations){ const key=citation.sourceId||citation.source; if(!numberBySource.has(key)) numberBySource.set(key,n++); const block=next.blocks.find(b=>b.id===citation.blockId); if(!block) continue; const number=numberBySource.get(key)!; const text=next.citationStyle==='numeric'?`[${number}]`:formatInlineCitation(next.citationStyle, citation, next.citationSources.find(s=>s.id===citation.sourceId)); block.runs=[{text}]; } return next; }

function authorSurname(author?:string): string { const clean=(author||'Unknown author').trim(); const parts=clean.split(/\s+/).filter(Boolean); return parts[parts.length-1]||clean; }
function formatInlineCitation(style: WriterCitationStyle, citation: WriterCitation, source?: WriterCitationSource): string { const author=source?.author||citation.author||'Unknown author'; const year=source?.year||citation.year||'n.d.'; if(style==='apa') return `(${authorSurname(author)}, ${year})`; if(style==='mla') return `(${authorSurname(author)})`; if(style==='chicago') return `(${authorSurname(author)} ${year})`; return `[1]`; }

export function formatCitationSource(source: WriterCitationSource, style: WriterCitationStyle='numeric'): string { const author=source.author||'Unknown author'; const year=source.year||'n.d.'; const title=source.title||'Untitled source'; const container=source.containerTitle; if(style==='apa'){ const containerText=container?` ${container}.`:''; const publisher=source.publisher?` ${source.publisher}.`:''; const doi=source.doi?` https://doi.org/${source.doi}`:(source.url?` ${source.url}`:''); return `${author} (${year}). ${title}.${containerText}${publisher}${doi}`.replace(/\.\s*\./g,'.'); } if(style==='mla'){ const containerText=container?` ${container},`:''; const publisher=source.publisher?` ${source.publisher},`:''; const yearPart=source.year?` ${year}.`:''; const url=source.url?` ${source.url}.`:''; return `${author}. “${title}.”${containerText}${publisher}${yearPart}${url}`.replace(/,\s*,/g,','); } if(style==='chicago'){ const containerText=container?` ${container}.`:''; const publisher=source.publisher?` ${source.publisher},`:''; const yearPart=source.year?` ${year}.`:''; const url=source.url?` ${source.url}.`:''; return `${author}. “${title}.”${containerText}${publisher}${yearPart}${url}`.replace(/\.\s*\./g,'.'); } const containerText=container?`. ${container}`:''; const publisher=source.publisher?`. ${source.publisher}`:''; const url=source.url?`. ${source.url}`:''; return `${author} (${source.year||''}). ${title}${containerText}${publisher}${url}`.replace(/\(\)\./g,'.').replace(/\.\s*\./g,'.'); }

export function buildBibliographyEntries(doc: WriterDocument): Array<{sourceId:string;number:number;text:string}> { const used=new Set(doc.citations.map(nextCitationSourceKey)); const out:Array<{sourceId:string;number:number;text:string}>=[]; let number=1; for(const source of doc.citationSources){ if(!used.has(source.id)) continue; out.push({sourceId:source.id,number:number++,text:formatCitationSource(source,doc.citationStyle)}); } return out; }
function nextCitationSourceKey(c: WriterCitation){ return c.sourceId||c.source; }
export function insertBibliography(doc: WriterDocument, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'bibliography',align:'start',runs:[{text:'Bibliography'}],spaceBefore:12,spaceAfter:8}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function insertIndex(doc: WriterDocument, afterId?:string):WriterDocument { const next=cloneWriterDocument(doc); const block:WriterBlock={id:crypto.randomUUID(),type:'index',align:'start',runs:[{text:'Index'}],spaceBefore:12,spaceAfter:8}; const i=afterId?next.blocks.findIndex(x=>x.id===afterId):-1; next.blocks.splice(i<0?next.blocks.length:i+1,0,block); return next; }
export function rebuildCaptionsAndCrossReferences(doc: WriterDocument): WriterDocument {
 const next=cloneWriterDocument(doc);
 const counters=new Map<string,number>();
 next.captions=next.captions.filter(c=>c&&c.label&&next.blocks.some(b=>b.id===c.blockId));
 next.captions.forEach(c=>{ const key=c.label.trim().toLocaleLowerCase()||'figure'; const n=(counters.get(key)||0)+1; counters.set(key,n); c.number=n; });
 const targetLabel=(targetId:string,display:'label'|'number'|'text')=>{
   const caption=next.captions.find(c=>c.id===targetId||c.blockId===targetId);
   if(caption){ if(display==='number') return String(caption.number); if(display==='text') return caption.text||`${caption.label} ${caption.number}`; return `${caption.label} ${caption.number}`; }
   const bookmark=next.bookmarks.find(b=>b.id===targetId||b.blockId===targetId);
   if(bookmark) return display==='number'?'1':bookmark.name;
   const block=next.blocks.find(b=>b.id===targetId); return block ? (display==='number'?String(next.blocks.indexOf(block)+1):writerBlockPlainText(block).trim()||'Reference') : 'Reference';
 };
 next.crossReferences=next.crossReferences.filter(r=>r&&r.targetId);
 for(const ref of next.crossReferences){
   const sourceId=ref.sourceBlockId||ref.targetId;
   const block=next.blocks.find(b=>b.id===sourceId); if(!block) continue;
   const text=`[${targetLabel(ref.targetId,ref.display)}]`;
   const existing=(block.runs||[]).filter(r=>!(r.text||'').includes(`[${ref.name}]`));
   block.runs=[...existing,{text,verticalAlign:'superscript'}];
 }
 return next;
}

export function addCaption(doc: WriterDocument, blockId:string, label='Figure', text=''):WriterDocument { const next=cloneWriterDocument(doc); next.captions.push({id:crypto.randomUUID(),blockId,label,text,number:1}); return rebuildCaptionsAndCrossReferences(next); }
export function addCrossReference(doc: WriterDocument, targetId:string, name:string, display:'label'|'number'|'text'='label', sourceBlockId?:string):WriterDocument { const next=cloneWriterDocument(doc); const source=sourceBlockId||targetId; next.crossReferences.push({id:crypto.randomUUID(),targetId,name,sourceBlockId:source,display}); return rebuildCaptionsAndCrossReferences(next); }
export function addIndexEntry(doc: WriterDocument, blockId:string, term:string, subentry?:string):WriterDocument { const next=cloneWriterDocument(doc); const value=term.trim(); if(value) next.indexEntries.push({id:crypto.randomUUID(),blockId,term:value,subentry}); return rebuildIndex(next); }

export function normalizeWriterDocument(doc: WriterDocument): WriterDocument {
 const source:any = doc && typeof doc === 'object' ? doc : {};
 const runs=(value:any):WriterRun[]=>Array.isArray(value)?value.slice(0,500).map((r:any)=>({text:typeof r?.text==='string'?r.text.slice(0,20000):String(r?.text??''),bold:Boolean(r?.bold),italic:Boolean(r?.italic),underline:Boolean(r?.underline),strike:Boolean(r?.strike),fontFamily:typeof r?.fontFamily==='string'?r.fontFamily.slice(0,80):undefined,fontSize:Number.isFinite(Number(r?.fontSize))?Number(r.fontSize):undefined,color:typeof r?.color==='string'?r.color:undefined,href:typeof r?.href==='string'?r.href.slice(0,4000):undefined,highlight:typeof r?.highlight==='string'?r.highlight:undefined,verticalAlign:['baseline','superscript','subscript'].includes(String(r?.verticalAlign))?String(r.verticalAlign) as any:'baseline'})): [{text:''}];
 const blocks=Array.isArray(source.blocks)?source.blocks.slice(0,5000).map((b:any,i:number)=>{
   const type=['paragraph','title','subtitle','heading1','heading2','heading3','list-item','table','image','page-break','equation','symbol','bibliography','index','toc'].includes(String(b?.type))?String(b.type):'paragraph';
   const block:any={id:typeof b?.id==='string'&&b.id?b.id:`block-${i+1}`,type,align:['start','center','end','justify'].includes(String(b?.align))?String(b.align):'start',direction:['auto','ltr','rtl'].includes(String(b?.direction))?String(b.direction):'auto',ordered:Boolean(b?.ordered),runs:runs(b?.runs),lineSpacing:Number.isFinite(Number(b?.lineSpacing))?Number(b.lineSpacing):undefined,spaceBefore:Number.isFinite(Number(b?.spaceBefore))?Number(b.spaceBefore):undefined,spaceAfter:Number.isFinite(Number(b?.spaceAfter))?Number(b.spaceAfter):undefined,sectionId:typeof b?.sectionId==='string'?b.sectionId:undefined};
   if(type==='table'){const t=b?.table&&typeof b.table==='object'?b.table:{};block.table={bordered:t.bordered!==false,rows:Array.isArray(t.rows)?t.rows.slice(0,50).map((row:any)=>Array.isArray(row)?row.slice(0,20).map((c:any)=>({id:typeof c?.id==='string'&&c.id?c.id:crypto.randomUUID(),runs:runs(c?.runs),align:['start','center','end'].includes(String(c?.align))?String(c.align):'start',verticalAlign:['top','middle','bottom'].includes(String(c?.verticalAlign))?String(c.verticalAlign):'top'})):[]):[]};}
   if(type==='image'&&b?.image&&typeof b.image==='object') block.image={...b.image,src:typeof b.image.src==='string'?b.image.src:'',alt:typeof b.image.alt==='string'?b.image.alt:''};
   return block as WriterBlock;
 }):[{id:'p1',type:'paragraph',align:'start',runs:[{text:''}]} as WriterBlock];
 const safe:any={...source, schema:7,type:'WRITER',title:typeof source.title==='string'?source.title:'Untitled document',language:['ar','en','mixed'].includes(String(source.language))?source.language:'mixed',blocks,review:source.review&&typeof source.review==='object'?source.review:{trackChanges:false,comments:[],changes:[],snapshots:[]},citations:Array.isArray(source.citations)?source.citations:[],citationSources:Array.isArray(source.citationSources)?source.citationSources:[],citationStyle:['numeric','apa','mla','chicago'].includes(String(source.citationStyle))?source.citationStyle:'numeric',captions:Array.isArray(source.captions)?source.captions:[],crossReferences:Array.isArray(source.crossReferences)?source.crossReferences:[],indexEntries:Array.isArray(source.indexEntries)?source.indexEntries:[],bookmarks:Array.isArray(source.bookmarks)?source.bookmarks:[],sections:Array.isArray(source.sections)?source.sections:[]};
 let next = safe as WriterDocument;
 try { next = rebuildCitationDisplay(next); } catch { /* keep normalized source */ }
 try { next = rebuildTableOfContents(next); } catch { /* keep normalized source */ }
 try { next = rebuildCaptionsAndCrossReferences(next); } catch { /* keep normalized source */ }
 try { next = rebuildIndex(next); } catch { /* keep normalized source */ }
 return next;
}

export function rebuildIndex(doc: WriterDocument): WriterDocument {
 const next=cloneWriterDocument(doc);
 const pages=estimatedPageNumbers(next);
 const entries=[...next.indexEntries].filter(e=>e.term.trim() && next.blocks.some(b=>b.id===e.blockId));
 entries.sort((a,b)=>a.term.localeCompare(b.term, undefined, {sensitivity:'base'}));
 const lines: WriterRun[]=[{text:'Index\n'}];
 let previous='';
 for(const entry of entries){
   const term=entry.term.trim();
   const key=term.toLocaleLowerCase();
   if(key===previous) continue;
   previous=key;
   const page=pages.get(entry.blockId) ?? 1;
   lines.push({text:`${term}${entry.subentry ? `, ${entry.subentry}` : ''} ................................ ${page}\n`});
 }
 if(entries.length===0) lines.push({text:'(No index entries yet)'});
 next.blocks.filter(b=>b.type==='index').forEach(b=>{b.runs=lines.map(r=>({...r}));b.spaceAfter=16;});
 return next;
}
export function updateImage(doc: WriterDocument, id:string, patch: NonNullable<WriterBlock['image']>):WriterDocument { const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b?.image) b.image={...b.image,...patch}; return next; }
export function updateTableOptions(doc: WriterDocument, id:string, patch: NonNullable<WriterBlock['table']>):WriterDocument { const next=cloneWriterDocument(doc); const b=next.blocks.find(x=>x.id===id); if(b?.table) b.table={...b.table,...patch}; return next; }
export function setTableCellVerticalAlign(doc: WriterDocument,id:string,row:number,col:number,verticalAlign:'top'|'middle'|'bottom'):WriterDocument { const next=cloneWriterDocument(doc); const c=next.blocks.find(x=>x.id===id)?.table?.rows[row]?.[col]; if(c) c.verticalAlign=verticalAlign; return next; }
export function addNestedTable(doc: WriterDocument,id:string,row:number,col:number,rows=2,cols=2):WriterDocument { const next=cloneWriterDocument(doc); const c=next.blocks.find(x=>x.id===id)?.table?.rows[row]?.[col]; if(!c)return next; c.nestedTable={bordered:true,rows:Array.from({length:rows},()=>Array.from({length:cols},()=>({id:crypto.randomUUID(),runs:[{text:''}],verticalAlign:'top' as const}))) }; return next; }
