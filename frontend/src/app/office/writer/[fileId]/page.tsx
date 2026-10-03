'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OfficeOpeningProgress, type OfficeOpenStage } from '@/components/office-opening-progress';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { closeOfficeSession, createOfficeDocument, exportOfficeFile, getOfficeOperations, heartbeatOfficePresence, importOfficeFile, listOfficeDocumentVersions, openOfficeSession, restoreOfficeDocumentVersion, saveOfficeDocument, touchOfficeSession } from '@/lib/api/office';
import { trashFile } from '@/lib/api/files';
import { enqueueWriterChange, flushWriterQueue, useOfficePresence, useOfficeRealtime, writerOfflineQueueCount } from '@/office/collaboration';
import { deriveWriterSaveStatus } from '@/office/writer/save-status';
import { OfficePresence } from '@/components/office-presence';
import { OfficeConflictDialog } from '@/components/office-conflict-dialog';
import { useLocale } from '@/components/locale-provider';
import { OfficeMobile } from '@/components/office-mobile';
import { WriterChrome } from '@/components/writer-zoho-chrome';
import { ShareModal } from '@/components/share-modal';
import { WorkflowPicker } from '@/components/workflow-picker';
import { OfficeTemplateFields } from '@/components/office-template-fields';
import { addParagraph, splitParagraph, addTableColumn, addTableRow, cloneWriterDocument, insertHorizontalRule, insertImage, insertPageBreak, insertColumnBreak, insertTable, mergeAdjacentRuns, patchBlockRuns, removeBlock, removeTableColumn, removeTableRow, setBlockAlignment, setBlockDirection, setBlockSpacing, setParagraphStyle, setListOrdered, toggleList, toggleTableBorders, updatePageSettings, updateBlockLayout, insertTableOfContents, rebuildTableOfContents, rebuildIndex, addBookmark, addFootnote, addEndnote, updateSection, addSection, insertSectionBreak, insertEquation, insertSymbol, addCitation, setCitationStyle, insertBibliography, insertIndex, addCaption, addCrossReference, addIndexEntry, rebuildCaptionsAndCrossReferences, updateImage, updateTableOptions, setTableCellVerticalAlign, addNestedTable, buildBibliographyEntries, mergeTableCells, splitTableCell } from '@/office/writer/commands';
import { applyAutocorrect, replacePlainRange, splitTextToTable, transliterateText } from '@/office/writer/editor-actions';
import { normalizeWriterDocument } from '@/office/writer/model';
import type { WriterBlock, WriterDocument, WriterRun } from '@/office/writer/model';
import { applyWriterPatches } from '@/office/writer/operation-patches';
import { readWriterQueue } from '@/office/writer/collaboration';
import { applyRemoteWriterOperations } from '@/office/writer/realtime';
import { resolveWriterConflict, type WriterConflictChoice } from '@/office/writer/conflict-resolution';
import { addComment, acceptChange, acceptAllChanges, addSnapshot, compareSnapshot, deleteComment, rejectAllChanges, rejectChange, replyComment, setReviewDisplayMode, setShowFormattingChanges, toggleCommentResolved, toggleTrackChanges, recordChange, textOfRuns, setMarkupColor } from '@/office/writer/review';
import { officeClone } from '@/office/performance';
import { prepareWriterPrintExport } from '@/office/writer/pdf';
import { pageDimensionsMm, printBlockStyle, printPageCss, sectionHeaderFooter } from '@/office/writer/print-layout';
import { captureWriterSelection, restoreWriterSelection, type WriterSelectionBookmark } from '@/office/writer/history-selection';
import { normalizeImageInspectorPatch, resetImageCrop, rotateImage } from '@/office/writer/image-inspector';
import { findMatches, nextFindMatch, previousFindMatch, replaceAllMatches, replaceCurrentMatch, matchIndexOf, type FindMatch, type FindOptions } from '@/office/writer/find-replace';
import { resolveWriterShortcut } from '@/office/writer/shortcuts';
import { applyDocumentPageSetup, applySectionPageSetup } from '@/office/writer/page-layout-ops';
import { changeKindFromRuns, nextPendingChange, previousPendingChange, pendingChanges, acceptNextChange, rejectNextChange } from '@/office/writer/review-ops';
import { patchRunsInRange, toggleMarkInRange, clearFormatInRange, type ToggleMark } from '@/office/writer/selection-format';
import { applyEnterAtBlock, applyBackspaceAtBlockStart } from '@/office/writer/editing-keys';
import { applyTableAction, nextTableCell, canMergeSelection, canSplitSelection, type TableActionId } from '@/office/writer/table-ops';
import { buildWriterOutline } from '@/office/writer/navigation';
import { imageWrapStyle, sectionColumnStyle, tableBreakStyle } from '@/office/writer/layout-rendering';
import { cacheOfficeSnapshot, readOfficeSnapshot, offlineQueueCount, installOfflineSync, readOfflineConflict, prepareWriterConflict, rebaseWriterQueue, discardWriterQueue } from '@/office/offline';

function t(ar: boolean, en: string, arText: string) { return ar ? arText : en; }
const cloneWriterValue = <T,>(value:T):T => officeClone(value);
function escapeHtml(text: string) { return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function htmlForRuns(runs: WriterRun[]) { return runs.map(run => { let v=escapeHtml(run.text).replaceAll('\n','<br/>'); if(run.bold)v=`<strong>${v}</strong>`; if(run.italic)v=`<em>${v}</em>`; if(run.underline)v=`<u>${v}</u>`; if(run.strike)v=`<s>${v}</s>`; if(run.href)v=`<a href="${escapeHtml(run.href)}" target="_blank" rel="noreferrer">${v}</a>`; if(run.verticalAlign==='superscript')v=`<sup>${v}</sup>`; if(run.verticalAlign==='subscript')v=`<sub>${v}</sub>`; const style=[run.fontFamily?`font-family:${escapeHtml(run.fontFamily)}`:'',run.fontSize?`font-size:${run.fontSize}px`:'',run.color?`color:${run.color}`:'',run.highlight?`background-color:${run.highlight}`:''].filter(Boolean).join(';'); return style?`<span style="${style}">${v}</span>`:v; }).join('') || '<br />'; }
function runsFromElement(element: HTMLElement): WriterRun[] {
 const runs: WriterRun[]=[];
 const push=(text:string, marks:Omit<WriterRun,'text'>)=>{ if(text)runs.push({text,...marks}); };
 const walk=(node:Node, marks:Omit<WriterRun,'text'>)=>{
  if(node.nodeType===Node.TEXT_NODE){ push(node.textContent??'',marks); return; }
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const el=node as HTMLElement;
  if(el.tagName==='BR'){ push('\n',marks); return; }
  const style=el.style;
  const href=el.tagName==='A'?(el as HTMLAnchorElement).href:marks.href;
  const next={bold:marks.bold||el.tagName==='STRONG'||el.tagName==='B',italic:marks.italic||el.tagName==='EM'||el.tagName==='I',underline:marks.underline||el.tagName==='U',strike:marks.strike||el.tagName==='S'||el.tagName==='DEL',fontFamily:style.fontFamily?.replaceAll('"',''),fontSize:style.fontSize?Number.parseFloat(style.fontSize):marks.fontSize,color:style.color?.startsWith('rgb')?rgbToHex(style.color):style.color||marks.color,highlight:style.backgroundColor?.startsWith('rgb')?rgbToHex(style.backgroundColor):style.backgroundColor||marks.highlight,href,verticalAlign:el.tagName==='SUP'?'superscript':el.tagName==='SUB'?'subscript':marks.verticalAlign};
  const blockLike=el.tagName==='DIV'||el.tagName==='P'||el.tagName==='LI';
  el.childNodes.forEach(c=>walk(c,next));
  if(blockLike && el.nextSibling) push('\n',marks);
 };
 element.childNodes.forEach(c=>walk(c,{}));
 return mergeAdjacentRuns(runs);
}
function rgbToHex(value:string){const m=value.match(/\d+/g);if(!m||m.length<3)return value;return '#'+m.slice(0,3).map(x=>Number(x).toString(16).padStart(2,'0')).join('');}
function blockClass(block:WriterBlock){if(block.type==='title')return 'text-4xl font-bold leading-tight';if(block.type==='subtitle')return 'text-2xl text-slate-600 leading-tight';if(block.type==='heading1')return 'text-3xl font-bold leading-tight';if(block.type==='heading2')return 'text-2xl font-bold leading-tight';if(block.type==='heading3')return 'text-xl font-semibold leading-tight';return 'text-[16px] leading-7';}
function pagesFor(doc:WriterDocument){
 const pages:WriterBlock[][]=[[]];
 let currentSectionId=doc.sections[0]?.id;
 const pushPage=()=>{ if(pages[pages.length-1].length) pages.push([]); };
 const addBlankPage=()=>pages.push([]);
 for(const block of doc.blocks){
  if(block.type==='page-break'){pages.push([]);currentSectionId=block.sectionId||currentSectionId;continue;}
  const section=block.sectionId?doc.sections.find(s=>s.id===block.sectionId):undefined;
  if(section && section.id!==currentSectionId){
   const breakType=section.breakType||'next-page';
   if(breakType==='next-page') pushPage();
   else if(breakType==='even-page'){ pushPage(); if((pages.length)%2!==0) addBlankPage(); }
   else if(breakType==='odd-page'){ pushPage(); if((pages.length)%2===0) addBlankPage(); }
   currentSectionId=section.id;
  }
  if(block.pageBreakBefore) pushPage();
  pages[pages.length-1].push(block);
 }
 return pages.filter((p,i)=>p.length||i===0);
}
function buildWriterPageLayout(doc:WriterDocument){
 const pages=pagesFor(doc);
 const ordinals:number[]=[];
 const counts=new Map<string,number>();
 pages.forEach((page,index)=>{
  const section=page[0]?sectionForBlock(doc,page[0]):doc.sections[0];
  const key=section?.id||'__document__';
  const next=(counts.get(key)||0)+1; counts.set(key,next); ordinals[index]=next;
 });
 return {pages,ordinals};
}
function sectionPageOrdinal(layout:{ordinals:number[]},pageIndex:number){ return Math.max(1,layout.ordinals[pageIndex]||1); }
function pageNumberFor(doc:WriterDocument,layout:{ordinals:number[]},pageIndex:number,pageBlocks:WriterBlock[]){
 const first=pageBlocks[0];
 const section=first?sectionForBlock(doc,first):doc.sections[0];
 if(!section)return (doc.page.pageNumberStart??1)+pageIndex;
 return (section.pageNumberStart??doc.page.pageNumberStart??1)+sectionPageOrdinal(layout,pageIndex)-1;
}


function formatPageNumber(n:number, format:'decimal'|'roman-lower'|'roman-upper'|'letter-upper'|'letter-lower'='decimal'){
 if(format==='decimal')return String(n); if(format.startsWith('letter-')){let x=Math.max(1,n),out='';while(x){x--;out=String.fromCharCode(65+(x%26))+out;x=Math.floor(x/26);}return format==='letter-lower'?out.toLowerCase():out;}
 const vals:[[number,string]]|any=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let x=Math.max(1,n),out='';for(const [v,c] of vals as any)while(x>=v){out+=c;x-=v;}return format==='roman-lower'?out.toLowerCase():out;
}
function sectionForBlock(doc:WriterDocument, block:WriterBlock){return doc.sections.find(s=>s.id===block.sectionId)||doc.sections[0];}
function imageStyle(block:any){const img=block.image;const crop=img?.crop?`inset(${img.crop.top}% ${img.crop.right}% ${img.crop.bottom}% ${img.crop.left}%)`:undefined;return {...imageWrapStyle(img?.wrap),width:img?.width?`${img.width}px`:'auto',maxWidth:'100%',height:img?.height?`${img.height}px`:'auto',transform:`rotate(${img?.rotation??0}deg)`,objectFit:'contain' as const,clipPath:crop?`inset(${img.crop.top}% ${img.crop.right}% ${img.crop.bottom}% ${img.crop.left}%)`:undefined};}


export default function ImkanWriterPage(){
 const {locale}=useLocale();const ar=locale==='ar';const {fileId}=useParams<{fileId:string}>();const router=useRouter();const searchParams=useSearchParams();const templateId=searchParams.get('templateId');
 const [doc,setDoc]=useState<WriterDocument|null>(null);const [openStage,setOpenStage]=useState<OfficeOpenStage>('connecting');
 const [revision,setRevision]=useState(1);
 const [selectionState,setSelectionState]=useState({fontFamily:'Roboto',fontSize:12,color:'#222222',highlight:'#ffe86a',bold:false,italic:false,underline:false,strike:false,superscript:false,subscript:false});const [conflict,setConflict]=useState<any>(()=>readOfflineConflict(fileId));const [sessionId,setSessionId]=useState('');const [activeBlockId,setActiveBlockId]=useState('');const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(true);const [error,setError]=useState('');const [history,setHistory]=useState<WriterDocument[]>([]);const [future,setFuture]=useState<WriterDocument[]>([]);const [historySelections,setHistorySelections]=useState<(WriterSelectionBookmark|null)[]>([]);const [futureSelections,setFutureSelections]=useState<(WriterSelectionBookmark|null)[]>([]);
 const docRef=useRef<WriterDocument|null>(null);const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const dirtyDoc=useRef<WriterDocument|null>(null);const importInputRef=useRef<HTMLInputElement>(null);
 const [pageZoom,setPageZoom]=useState(100);const [docView,setDocView]=useState<'page'|'web'|'reader'>('page');const [hideImages,setHideImages]=useState(false);const [showRuler,setShowRuler]=useState(false);const [showMarks,setShowMarks]=useState(false);const [night,setNight]=useState(false);const [finalized,setFinalized]=useState(false);const [focusTyping,setFocusTyping]=useState(false);const [typewriter,setTypewriter]=useState(false);const [versionsOpen,setVersionsOpen]=useState(false);const [versions,setVersions]=useState<Array<{id:string;versionNumber:number;label?:string|null;createdAt:string}>>([]);const [propsOpen,setPropsOpen]=useState(false);const [titleDraft,setTitleDraft]=useState('');const [replaceMode,setReplaceMode]=useState<null|'translate'|'thesaurus'|'autocorrect'|'dictionary'>(null);const [replaceDraft,setReplaceDraft]=useState('');const [dictFrom,setDictFrom]=useState('');const [dictTo,setDictTo]=useState('');const [draftOpen,setDraftOpen]=useState(false);const [draftText,setDraftText]=useState('');const [shortcutsOpen,setShortcutsOpen]=useState(false);const [bookmarksOpen,setBookmarksOpen]=useState(false);
 const presence=useOfficePresence(fileId,sessionId);
 const realtimeHandler=useCallback((event:{revision?:number})=>{ if(typeof event.revision!=='number'||event.revision<=revision) return; void getOfficeOperations(fileId,revision).then(ops=>{ const current=docRef.current; if(!current)return; const pending=readWriterQueue(fileId); const pendingIds=new Set(pending.map(item=>item.opId)); const remote=ops.filter(op=>!pendingIds.has(op.payload?.opId)); const bookmark=captureWriterSelection(); const result=applyRemoteWriterOperations(current,remote.map(op=>({id:op.id,revision:op.revision,userId:op.user?.id,payload:{opId:op.payload?.opId,patches:op.payload?.patches}})),pending.map(item=>item.patches),bookmark); if(result.conflict){setError(t(ar,'A remote edit overlaps your local work. Review the conflict before continuing.','يوجد تعديل بعيد يتعارض مع عملك المحلي. راجع التعارض قبل المتابعة.'));return;} docRef.current=result.document;dirtyDoc.current=result.document;setDoc(result.document);setRevision(Math.max(event.revision as number,...result.appliedRevisions,revision));setSaved(pending.length===0);if(result.selection)requestAnimationFrame(()=>restoreWriterSelection(result.selection)); }).catch(()=>setOpenStage('connecting');setOpenStage('session');void openOfficeSession(fileId).then(r=>{const next=normalizeWriterDocument(r.document.content);setDoc(next);docRef.current=next;dirtyDoc.current=next;setRevision(r.document.revision);})); },[fileId,revision,ar]);
 useOfficeRealtime(fileId,sessionId,undefined,realtimeHandler);
 const [navigatorOpen,setNavigatorOpen]=useState(false);
 const [findOpen,setFindOpen]=useState(false); const [findTerm,setFindTerm]=useState(''); const [replaceTerm,setReplaceTerm]=useState(''); const [findCaseSensitive,setFindCaseSensitive]=useState(false); const [findWholeWord,setFindWholeWord]=useState(false); const [currentFind,setCurrentFind]=useState<FindMatch>();
 const [reviewTab,setReviewTab]=useState<'comments'|'changes'|'compare'>('comments');const [activeChangeId,setActiveChangeId]=useState('');
 const [reviewOpen,setReviewOpen]=useState(false);
 const [commentDraft,setCommentDraft]=useState('');
 const [commentFilter,setCommentFilter]=useState<'all'|'open'|'resolved'>('open');
 const [changeFilter,setChangeFilter]=useState<'pending'|'accepted'|'rejected'|'all'>('pending');
 const [replyDraft,setReplyDraft]=useState<Record<string,string>>({});
 const [pdfExporting,setPdfExporting]=useState(false);
 const [shareOpen,setShareOpen]=useState(false);
 const [workflowOpen,setWorkflowOpen]=useState(false);
 const [compareId,setCompareId]=useState('');
 const [linkDialogOpen,setLinkDialogOpen]=useState(false);
 const [linkUrl,setLinkUrl]=useState('');
 const [linkSelection,setLinkSelection]=useState<WriterSelectionBookmark|null>(null);
 const [imageDialogOpen,setImageDialogOpen]=useState(false);
 const [imageSrc,setImageSrc]=useState('');
 const [imageAlt,setImageAlt]=useState('');
 const [imageWidth,setImageWidth]=useState(560);
 const [imageHeight,setImageHeight]=useState<number|undefined>(undefined);
 const [imageRotation,setImageRotation]=useState(0);
 const [imageWrap,setImageWrap]=useState<NonNullable<NonNullable<WriterBlock['image']>['wrap']>>('inline');
 const [imageAnchor,setImageAnchor]=useState<NonNullable<NonNullable<WriterBlock['image']>['anchor']>>('paragraph');
 const [cropTop,setCropTop]=useState(0); const [cropRight,setCropRight]=useState(0); const [cropBottom,setCropBottom]=useState(0); const [cropLeft,setCropLeft]=useState(0);
 const [bookmarkDialogOpen,setBookmarkDialogOpen]=useState(false); const [bookmarkName,setBookmarkName]=useState('');
 const [advancedDialog,setAdvancedDialog]=useState<'footnote'|'endnote'|'equation'|'symbol'|'citation'|'caption'|'crossref'|'index'|'table'|null>(null);
 const [advancedText,setAdvancedText]=useState(''); const [advancedTitle,setAdvancedTitle]=useState(''); const [advancedAuthor,setAdvancedAuthor]=useState(''); const [advancedYear,setAdvancedYear]=useState(''); const [advancedUrl,setAdvancedUrl]=useState(''); const [advancedLabel,setAdvancedLabel]=useState('Figure'); const [advancedSubentry,setAdvancedSubentry]=useState(''); const [advancedTarget,setAdvancedTarget]=useState(''); const [advancedDisplay,setAdvancedDisplay]=useState<'label'|'number'|'text'>('label'); const [advancedCitationStyle,setAdvancedCitationStyle]=useState<'numeric'|'apa'|'mla'|'chicago'>('numeric'); const [advancedHeaderRows,setAdvancedHeaderRows]=useState(0); const [advancedRepeatHeader,setAdvancedRepeatHeader]=useState(false); const [advancedAllowBreak,setAdvancedAllowBreak]=useState(true);
 const [pageSetupOpen,setPageSetupOpen]=useState(false); const [pageSetupMode,setPageSetupMode]=useState<'page'|'section'>('page');
 const [pageSetup,setPageSetup]=useState({size:'A4' as WriterDocument['page']['size'],orientation:'portrait' as WriterDocument['page']['orientation'],marginTop:20,marginRight:20,marginBottom:20,marginLeft:20,widthMm:210,heightMm:297,header:'',footer:'',firstHeader:'',firstFooter:'',oddHeader:'',oddFooter:'',evenHeader:'',evenFooter:'',showPageNumbers:true,pageNumberFormat:'decimal' as NonNullable<WriterDocument['page']['pageNumberFormat']>,pageNumberStart:1,differentFirstPage:false,differentOddEven:false,columns:1,columnGapMm:8,breakType:'next-page' as NonNullable<WriterDocument['sections'][number]['breakType']>});
 const [internalLink,setInternalLink]=useState(false); const [linkTarget,setLinkTarget]=useState('');
 const exportPdf=useCallback(async()=>{
   if(!doc||pdfExporting)return;
   setPdfExporting(true);
   const cleanup=prepareWriterPrintExport(doc.title);
   let finished=false;
   const done=()=>{ if(finished)return; finished=true; cleanup(); setPdfExporting(false); window.removeEventListener('afterprint',done); };
   window.addEventListener('afterprint',done,{once:true});
   try {
     if('fonts' in document && document.fonts?.ready) await document.fonts.ready;
     const images=Array.from(document.querySelectorAll('.writer-page img')) as HTMLImageElement[];
     await Promise.all(images.map(img=>img.complete ? Promise.resolve() : new Promise<void>(resolve=>{img.addEventListener('load',()=>resolve(),{once:true});img.addEventListener('error',()=>resolve(),{once:true});})));
     window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>window.print()));
   } catch {
     try { window.print(); } catch { done(); }
   }
   window.setTimeout(done,15000);
 },[doc,pdfExporting]);
 useEffect(()=>{let cancelled=false;void openOfficeSession(fileId).then(r=>{if(cancelled)return;const next=normalizeWriterDocument(r.document.content);setDoc(next);docRef.current=next;dirtyDoc.current=next;setRevision(r.document.revision);setSessionId(r.sessionId);setOpenStage('layout');setOpenStage('ready');setHistory([]);setFuture([]);cacheOfficeSnapshot(fileId,'WRITER',r.document.revision,next);}).catch(e=>{console.error('[office-writer]', { fileId, templateId, error: e });const cached=readOfficeSnapshot(fileId);if(cached?.document){const next=normalizeWriterDocument(cached.document);setDoc(next);docRef.current=next;dirtyDoc.current=next;setRevision(cached.revision);setSaved(offlineQueueCount(fileId)===0);setError(t(ar,'Offline mode: using the latest local copy.','وضع عدم الاتصال: يتم استخدام أحدث نسخة محلية.'));}else setError(e instanceof Error?e.message:t(ar,'Unable to open IMKAN Writer.','تعذر فتح IMKAN Writer.'))});return()=>{cancelled=true;};},[fileId,ar,templateId]);
 useEffect(()=>{const sync=()=>void flushWriterQueue(fileId,sessionId,(r)=>{setRevision(r);if(docRef.current)cacheOfficeSnapshot(fileId,'WRITER',r,docRef.current)},e=>setError(e instanceof Error?e.message:t(ar,'Sync is waiting for reconciliation.','المزامنة تنتظر المصالحة.')));window.addEventListener('online',sync);return()=>window.removeEventListener('online',sync);},[fileId,sessionId,ar]);
 useEffect(()=>installOfflineSync(fileId,()=>sessionId||undefined,{onOnline:()=>void flushWriterQueue(fileId,sessionId,(r)=>setRevision(r),e=>setError(e instanceof Error?e.message:t(ar,'Sync is waiting for reconciliation.','المزامنة تنتظر المصالحة.'))),onOffline:()=>setError(t(ar,'Offline. Changes will sync automatically.','أنت غير متصل. ستتم مزامنة التغييرات تلقائيًا.'))}),[fileId,sessionId,ar]);
 useEffect(()=>{if(!sessionId)return;const beat=()=>void heartbeatOfficePresence(sessionId,{status:document.hidden?'IDLE':'ACTIVE',cursor:{blockId:activeBlockId||null},selection:{blockId:activeBlockId||null}}).catch(()=>undefined);beat();const timer=window.setInterval(beat,2500);return()=>window.clearInterval(timer);},[sessionId,activeBlockId]);
 const settleWriterConflict=useCallback(async(reason:string,mode:'safe'|'adopt')=>{
  const prepared=await prepareWriterConflict(fileId,reason);
  if(!prepared){setConflict(null);setError('');return;}
  const result=await rebaseWriterQueue(fileId,mode);
  if(!result.ok){setConflict(prepared);setError(t(ar,'These changes overlap the remote edit. Reconcile the document manually.','هذه التغييرات تتداخل مع التعديل البعيد. قم بالمصالحة يدويًا.'));return;}
  const next=normalizeWriterDocument(result.document);
  docRef.current=next;dirtyDoc.current=next;setDoc(next);setRevision(result.revision);
  await flushWriterQueue(fileId,sessionId,r=>setRevision(r),async e=>{if(e?.status===409)setConflict(await prepareWriterConflict(fileId,e?.code||'WRITER_OPERATION_CONFLICT'));});
  setSaved(writerOfflineQueueCount(fileId)===0);setSaving(writerOfflineQueueCount(fileId)>0);
  if(result.pendingCount>0){setConflict(prepared);setError(t(ar,'Safe edits were synced. Overlapping edits stayed pending.','تمت مزامنة التعديلات الآمنة. بقيت التعديلات المتداخلة معلّقة.'));}
  else {setConflict(null);setError('');}
 },[fileId,sessionId,ar]);
 const persist=useCallback((previous:WriterDocument,next:WriterDocument)=>{dirtyDoc.current=next;setSaved(false);const operation=enqueueWriterChange(fileId,revision,previous,next,sessionId);if(!operation){setSaved(true);return;}setSaving(true);void flushWriterQueue(fileId,sessionId,(nextRevision)=>{setRevision(nextRevision);if(docRef.current)cacheOfficeSnapshot(fileId,'WRITER',nextRevision,docRef.current);setSaved(writerOfflineQueueCount(fileId)===0);setSaving(writerOfflineQueueCount(fileId)>0);dirtyDoc.current=docRef.current;},(e)=>{if(e?.status===409||e?.code?.includes?.('WRITER_OPERATION_CONFLICT')||e?.code==='OFFICE_OPERATION_CONFLICT'){void settleWriterConflict(e?.code||'WRITER_OPERATION_CONFLICT','safe');}else if(typeof navigator!=='undefined'&&!navigator.onLine)setError(t(ar,'Offline. Changes are queued locally and will sync when you reconnect.','أنت غير متصل. تم حفظ التغييرات محليًا وستتم مزامنتها عند عودة الاتصال.'));else setError(e instanceof Error?e.message:t(ar,'Sync failed.','فشلت المزامنة.'));setSaving(false);});},[fileId,revision,sessionId,ar,settleWriterConflict]);
 const commit=useCallback((candidate:WriterDocument)=>{const next=normalizeWriterDocument(candidate);const current=docRef.current;const bookmark=captureWriterSelection();if(current){setHistory(items=>[...items.slice(-99),cloneWriterDocument(current)]);setHistorySelections(items=>[...items.slice(-99),bookmark]);}if(current)persist(current,next);docRef.current=next;setDoc(next);setFuture([]);setFutureSelections([]);if(bookmark)requestAnimationFrame(()=>restoreWriterSelection(bookmark));},[persist]);
 useEffect(()=>{if(!sessionId)return;const id=setInterval(()=>void touchOfficeSession(sessionId).catch(()=>undefined),30000);return()=>clearInterval(id);},[sessionId]);
 useEffect(()=>()=>{if(saveTimer.current)clearTimeout(saveTimer.current);if(dirtyDoc.current&&sessionId)void closeOfficeSession(sessionId).catch(()=>undefined);},[sessionId]);
 const reloadWriterDocument=useCallback(async()=>{
  if(writerOfflineQueueCount(fileId)>0){
   setError(t(ar,'Sync pending changes before reloading the document.','يجب مزامنة التغييرات المعلقة قبل إعادة تحميل المستند.'));
   return;
  }
  setSaving(true);
  try {
   const r=await openOfficeSession(fileId);
   const next=normalizeWriterDocument(r.document.content);
   docRef.current=next;
   dirtyDoc.current=next;
   setDoc(next);
   setRevision(r.document.revision);
   setSessionId(r.sessionId);
   setHistory([]);
   setFuture([]);
   setHistorySelections([]);
   setFutureSelections([]);
   setSaved(true);
   setError('');
   cacheOfficeSnapshot(fileId,'WRITER',r.document.revision,next);
  } catch(e:any) {
   setError(e instanceof Error?e.message:t(ar,'Unable to reload the latest document version.','تعذر إعادة تحميل أحدث إصدار من المستند.'));
  } finally { setSaving(false); }
 },[fileId,ar]);
 const applyMergedConflict=async(choices:Record<string,WriterConflictChoice>)=>{
  if(!conflict?.local||!conflict?.remote)return;
  const remote=normalizeWriterDocument(conflict.remote);
  const local=normalizeWriterDocument(conflict.local);
  const merged=normalizeWriterDocument(resolveWriterConflict(local,remote,choices));
  discardWriterQueue(fileId);
  docRef.current=merged;dirtyDoc.current=merged;setDoc(merged);setRevision(conflict.remoteRevision);setSaved(false);setError('');
  const operation=enqueueWriterChange(fileId,conflict.remoteRevision,remote,merged,sessionId);
  if(!operation){setSaved(true);setConflict(null);return;}
  setSaving(true);
  await flushWriterQueue(fileId,sessionId,r=>setRevision(r),e=>setError(e instanceof Error?e.message:t(ar,'Merged changes could not be synced.','تعذر مزامنة التغييرات المدمجة.')));
  setSaving(false);setSaved(writerOfflineQueueCount(fileId)===0);
  if(writerOfflineQueueCount(fileId)===0)setConflict(null);
};
 const resolveConflict=async(choice:'local'|'remote')=>{if(choice==='remote'&&conflict?.remote){discardWriterQueue(fileId);const remote=normalizeWriterDocument(conflict.remote);docRef.current=remote;dirtyDoc.current=remote;setDoc(remote);setRevision(conflict.remoteRevision);cacheOfficeSnapshot(fileId,'WRITER',conflict.remoteRevision,remote);setSaved(true);setConflict(null);setError('');return;}await settleWriterConflict(conflict?.reason||'WRITER_OPERATION_CONFLICT','adopt');};
 const activeBlock=useMemo(()=>doc?.blocks.find(b=>b.id===activeBlockId)??doc?.blocks.find(b=>b.type!=='page-break')??null,[doc,activeBlockId]);
 useEffect(()=>{
  const syncSelection=()=>{
   const sel=window.getSelection(); if(!sel||sel.rangeCount===0)return;
   const node=sel.anchorNode?.nodeType===Node.TEXT_NODE?sel.anchorNode.parentElement:sel.anchorNode as HTMLElement|null;
   const el=node?.closest?.('[data-writer-block]') as HTMLElement|null; if(!el)return;
   const blockId=el.getAttribute('data-writer-block'); if(blockId) setActiveBlockId(blockId);
   const style=window.getComputedStyle(node as Element);
   const px=parseFloat(style.fontSize); const color=style.color; const bg=style.backgroundColor;
   const normalizeColor=(value:string,fallback:string)=>{ if(!value||value==='transparent'||value==='rgba(0, 0, 0, 0)')return fallback; const m=value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m?'#'+[m[1],m[2],m[3]].map(x=>Number(x).toString(16).padStart(2,'0')).join(''):value; };
   setSelectionState({fontFamily:style.fontFamily.replace(/['"]/g,''),fontSize:Number.isFinite(px)?Math.round(px):12,color:normalizeColor(color,'#222222'),highlight:normalizeColor(bg,'#ffe86a'),bold:document.queryCommandState('bold'),italic:document.queryCommandState('italic'),underline:document.queryCommandState('underline'),strike:document.queryCommandState('strikeThrough'),superscript:document.queryCommandState('superscript'),subscript:document.queryCommandState('subscript')});
  };
  document.addEventListener('selectionchange',syncSelection); syncSelection(); return()=>document.removeEventListener('selectionchange',syncSelection);
 },[]);
 const applyCommand=(command:ToggleMark)=>{const current=docRef.current;if(!current||!activeBlock)return;const offsets=selectionOffsetsForBlock(activeBlock.id);const block=current.blocks.find(b=>b.id===activeBlock.id);if(!block)return;const before=block.runs.map(r=>({...r}));let nextRuns;if(offsets){nextRuns=toggleMarkInRange(block.runs,offsets.start,offsets.end,command);}else{const fullEnd=block.runs.reduce((n,r)=>n+(r.text||'').length,0);nextRuns=fullEnd?toggleMarkInRange(block.runs,0,fullEnd,command):block.runs;}const next={...current,blocks:current.blocks.map(b=>b.id===activeBlock.id?{...b,runs:nextRuns}:b)};commit(recordChange(next,activeBlock.id,before,nextRuns,'format'));};
 const updateBlockRuns=(blockId:string,element:HTMLElement)=>{const current=docRef.current;if(!current)return;const next=cloneWriterDocument(current);const block=next.blocks.find(x=>x.id===blockId);if(!block)return;const before=cloneWriterValue(current).blocks.find(x=>x.id===blockId)?.runs??[];block.runs=runsFromElement(element);const reviewed=recordChange(next,blockId,before,block.runs,'format');const normalized=normalizeWriterDocument(reviewed);docRef.current=normalized;setDoc(normalized);dirtyDoc.current=normalized;setSaved(false);if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>persist(current,normalized),700);};
 const updateTableCell=(blockId:string,row:number,col:number,element:HTMLElement)=>{const current=docRef.current;if(!current)return;const next=cloneWriterDocument(current);const block=next.blocks.find(x=>x.id===blockId);const cell=block?.table?.rows[row]?.[col];if(!cell)return;cell.runs=runsFromElement(element);const normalized=normalizeWriterDocument(next);docRef.current=normalized;setDoc(normalized);dirtyDoc.current=normalized;persist(current,normalized);};
 const insertTemplateField=(placeholder:string)=>{const current=docRef.current;const target=activeBlock;if(!current||!target)return;const next=cloneWriterDocument(current);const block=next.blocks.find(b=>b.id===target.id);if(!block)return;const last=block.runs[block.runs.length-1];if(last)last.text=(last.text||'')+placeholder;else block.runs=[{text:placeholder}];commit(next);};
 const undo=()=>{const current=docRef.current,previous=history[history.length-1];if(!current||!previous)return;const currentSelection=captureWriterSelection();const previousSelection=historySelections[historySelections.length-1]??null;setHistory(items=>items.slice(0,-1));setHistorySelections(items=>items.slice(0,-1));setFuture(items=>[cloneWriterDocument(current),...items].slice(0,100));setFutureSelections(items=>[currentSelection,...items].slice(0,100));docRef.current=previous;setDoc(previous);persist(current,previous);requestAnimationFrame(()=>restoreWriterSelection(previousSelection));};
 const redo=()=>{const current=docRef.current,next=future[0];if(!current||!next)return;const currentSelection=captureWriterSelection();const nextSelection=futureSelections[0]??null;setFuture(items=>items.slice(1));setFutureSelections(items=>items.slice(1));setHistory(items=>[...items.slice(-99),cloneWriterDocument(current)]);setHistorySelections(items=>[...items.slice(-99),currentSelection]);docRef.current=next;setDoc(next);persist(current,next);requestAnimationFrame(()=>restoreWriterSelection(nextSelection));};
 const splitAtCaret=useCallback((blockId:string)=>{
  const current=docRef.current;
  const el=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;
  const selection=window.getSelection();
  if(!current||!el||!selection||selection.rangeCount===0)return false;
  const range=selection.getRangeAt(0);
  if(!el.contains(range.startContainer)||!el.contains(range.endContainer))return false;
  const beforeRange=document.createRange(); beforeRange.selectNodeContents(el); beforeRange.setEnd(range.startContainer,range.startOffset);
  const afterRange=document.createRange(); afterRange.selectNodeContents(el); afterRange.setStart(range.endContainer,range.endOffset);
  const beforeBox=document.createElement('div'); beforeBox.appendChild(beforeRange.cloneContents());
  const afterBox=document.createElement('div'); afterBox.appendChild(afterRange.cloneContents());
  const before=runsFromElement(beforeBox); const after=runsFromElement(afterBox);
  const next=splitParagraph(current,blockId,before,after);
  const index=next.blocks.findIndex(b=>b.id===blockId);
  const newId=next.blocks[index+1]?.id;
  commit(next);
  if(newId)requestAnimationFrame(()=>{const target=document.querySelector(`[data-writer-block="${newId}"]`) as HTMLElement|null;if(target){target.focus();const r=document.createRange();r.selectNodeContents(target);r.collapse(true);const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(r);}});
  return true;
 },[commit]);
 const focusBlockAt=(blockId:string|null,offset?:number|null)=>{if(!blockId)return;requestAnimationFrame(()=>{const target=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;if(!target)return;target.focus();const sel=window.getSelection();if(!sel)return;const range=document.createRange();if(typeof offset==='number'&&offset>0){let remaining=offset;const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);let node:Node|null;while(node=walker.nextNode()){const len=node.textContent?.length??0;if(remaining<=len){range.setStart(node,remaining);range.collapse(true);sel.removeAllRanges();sel.addRange(range);return;}remaining-=len;}}range.selectNodeContents(target);range.collapse(true);sel.removeAllRanges();sel.addRange(range);});};
 const handleEditorKeyDown=useCallback((event:React.KeyboardEvent<HTMLDivElement>,blockId:string)=>{
  const mod=event.ctrlKey||event.metaKey;
  if(event.key==='Enter' && mod){ event.preventDefault(); const current=docRef.current;if(current)commit(insertPageBreak(current,blockId));return; }
  if(event.key==='Enter'){
    event.preventDefault();
    if(event.shiftKey){ document.execCommand('insertLineBreak'); return; }
    const current=docRef.current; if(!current)return;
    const el=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;
    const selection=window.getSelection();
    let split: {before:any[];after:any[]}|null=null;
    if(el&&selection&&selection.rangeCount>0){
      const range=selection.getRangeAt(0);
      if(el.contains(range.startContainer)){
        const beforeRange=document.createRange(); beforeRange.selectNodeContents(el); beforeRange.setEnd(range.startContainer,range.startOffset);
        const afterRange=document.createRange(); afterRange.selectNodeContents(el); afterRange.setStart(range.endContainer,range.endOffset);
        const beforeBox=document.createElement('div'); beforeBox.appendChild(beforeRange.cloneContents());
        const afterBox=document.createElement('div'); afterBox.appendChild(afterRange.cloneContents());
        split={before:runsFromElement(beforeBox),after:runsFromElement(afterBox)};
      }
    }
    const result=applyEnterAtBlock(current,blockId,split);
    commit(result.document);
    focusBlockAt(result.focusBlockId,0);
    return;
  }
  if(event.key==='Backspace'){
    const selection=window.getSelection();
    if(!selection||selection.rangeCount===0||!selection.isCollapsed)return;
    const el=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;
    if(!el)return;
    const range=selection.getRangeAt(0);
    if(!el.contains(range.startContainer))return;
    const before=document.createRange(); before.selectNodeContents(el); before.setEnd(range.startContainer,range.startOffset);
    if(before.toString().length>0)return; // not at start — let browser handle
    event.preventDefault();
    const current=docRef.current; if(!current)return;
    const result=applyBackspaceAtBlockStart(current,blockId);
    if(result.document===current)return;
    commit(result.document);
    focusBlockAt(result.focusBlockId,result.caretOffset);
    return;
  }
 },[commit]);
 useEffect(()=>{const onKeyDown=(event:KeyboardEvent)=>{
  const action=resolveWriterShortcut(event);
  if(!action)return;
  const target=event.target as HTMLElement|null;
  const inFindInput=Boolean(target?.closest?.('[data-writer-find-panel] input, [data-writer-find-panel] textarea'));
  if(inFindInput && action!=='close-panel' && action!=='find-next' && action!=='find-previous' && action!=='find' && action!=='replace')return;
  event.preventDefault();
  if(action==='undo'){undo();return;}
  if(action==='redo'){redo();return;}
  if(action==='bold'||action==='italic'||action==='underline'||action==='strike'){applyCommand(action);return;}
  if(action==='find'){setFindOpen(true);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('[data-writer-find-input]')?.focus());return;}
  if(action==='replace'){setFindOpen(true);requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('[data-writer-replace-input]')?.focus());return;}
  if(action==='find-next'){if(!doc||!findTerm){setFindOpen(true);return;}const match=nextFindMatch(doc,findTerm,currentFind,{caseSensitive:findCaseSensitive,wholeWord:findWholeWord});if(match){const selector=match.cell?`[data-writer-table-cell="${match.blockId}:${match.cell.row}:${match.cell.col}"]`:`[data-writer-block="${match.blockId}"]`;const el=document.querySelector(selector) as HTMLElement|null;if(el){el.scrollIntoView({block:'center'});const range=document.createRange();let offset=0;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node:Node|null;while(node=walker.nextNode()){const length=node.textContent?.length??0;if(match.start>=offset&&match.start<=offset+length){range.setStart(node,match.start-offset);range.setEnd(node,Math.min(length,match.start-offset+(match.end-match.start)));const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range);break;}offset+=length;}}setCurrentFind(match);}return;}
  if(action==='find-previous'){if(!doc||!findTerm){setFindOpen(true);return;}const match=previousFindMatch(doc,findTerm,currentFind,{caseSensitive:findCaseSensitive,wholeWord:findWholeWord});if(match){setCurrentFind(match);const selector=match.cell?`[data-writer-table-cell="${match.blockId}:${match.cell.row}:${match.cell.col}"]`:`[data-writer-block="${match.blockId}"]`;(document.querySelector(selector) as HTMLElement|null)?.scrollIntoView({block:'center'});}return;}
  if(action==='save'){const current=docRef.current;if(current&&!saving)persist(current,current);return;}
  if(action==='close-panel'){setFindOpen(false);return;}
  if(action==='print'){window.print();return;}
  if(action==='track-changes'){const current=docRef.current;if(current)commit(toggleTrackChanges(current));return;}
  if(action==='review-panel'){setReviewOpen(v=>!v);return;}
  if(action==='next-change'){goNextChange();return;}
  if(action==='prev-change'){goPrevChange();return;}
  if(action==='align-start'||action==='align-center'||action==='align-end'||action==='align-justify'){
    const current=docRef.current;if(!current||!activeBlock)return;
    const align=action==='align-start'?'start':action==='align-center'?'center':action==='align-end'?'end':'justify';
    commit(setBlockAlignment(current,activeBlock.id,align));
  }
};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);},[history,future,historySelections,futureSelections,findTerm,findCaseSensitive,findWholeWord,currentFind,saving,activeBlock,doc]);
 const openLinkDialog=()=>{
  const selection=window.getSelection();
  const anchor=selection?.anchorNode?.parentElement?.closest?.('a') as HTMLAnchorElement|null;
  setLinkUrl(anchor?.href||'');setInternalLink(Boolean(anchor?.getAttribute('data-writer-bookmark')));setLinkTarget(anchor?.getAttribute('data-writer-bookmark')||'');
  setLinkSelection(captureWriterSelection());
  setLinkDialogOpen(true);
 };
 const saveLink=()=>{
  const url=linkUrl.trim();
  if(internalLink && !linkTarget)return;
  if(!internalLink && !url)return;
  const el=document.querySelector(`[data-writer-block="${activeBlock?.id}"]`) as HTMLElement|null;
  const current=docRef.current;
  if(!current||!activeBlock)return;
  if(el){
   if(linkSelection)restoreWriterSelection(linkSelection);
   document.execCommand('createLink',false,internalLink ? `#${linkTarget}` : url);
   const updated=document.querySelector(`[data-writer-block="${activeBlock.id}"]`) as HTMLElement|null;
   if(updated)commit({...current,blocks:current.blocks.map(b=>b.id===activeBlock.id?{...b,runs:runsFromElement(updated)}:b)});
   if(linkSelection)requestAnimationFrame(()=>restoreWriterSelection(linkSelection));
  } else applyRunPatch({href:url});
  setLinkDialogOpen(false);
 };
 const removeLink=()=>{
  const current=docRef.current;
  if(!current||!activeBlock)return;
  if(linkSelection)restoreWriterSelection(linkSelection);
  document.execCommand('unlink');
  const updated=document.querySelector(`[data-writer-block="${activeBlock.id}"]`) as HTMLElement|null;
  if(updated)commit({...current,blocks:current.blocks.map(b=>b.id===activeBlock.id?{...b,runs:runsFromElement(updated)}:b)});
  setLinkDialogOpen(false);
 };
 const openImageDialog=()=>{
  const current=docRef.current;
  const existing=activeBlock?.type==='image'?activeBlock.image:undefined;
  setImageSrc(existing?.src||'');setImageAlt(existing?.alt||t(ar,'Image','صورة'));setImageWidth(existing?.width||560);setImageHeight(existing?.height);setImageRotation(existing?.rotation||0);setImageWrap(existing?.wrap||'inline');setImageAnchor(existing?.anchor||'paragraph');setCropTop(existing?.crop?.top||0);setCropRight(existing?.crop?.right||0);setCropBottom(existing?.crop?.bottom||0);setCropLeft(existing?.crop?.left||0);
  setImageDialogOpen(true);
 };
 const saveImage=()=>{
  const current=docRef.current;
  const src=imageSrc.trim();
  if(!current||!src)return;
  if(activeBlock?.type==='image'&&activeBlock.image){
   commit(updateImage(current,activeBlock.id,normalizeImageInspectorPatch(activeBlock.image,{src,alt:imageAlt.trim()||t(ar,'Image','صورة'),width:imageWidth,height:imageHeight,rotation:imageRotation,wrap:imageWrap,anchor:imageAnchor,crop:(cropTop||cropRight||cropBottom||cropLeft)?{top:cropTop,right:cropRight,bottom:cropBottom,left:cropLeft}:undefined})));
  } else commit(insertImage(current,src,imageAlt.trim()||t(ar,'Image','صورة'),activeBlock?.id));
  setImageDialogOpen(false);
 };
 const onImageFile=(file:File|null)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>setImageSrc(String(reader.result||''));reader.readAsDataURL(file);};
 const selectionOffsetsForBlock=(blockId:string)=>{
  const selection=window.getSelection();
  const el=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;
  if(!selection||selection.rangeCount===0||!el||selection.isCollapsed)return null;
  const range=selection.getRangeAt(0);
  if(!el.contains(range.startContainer)||!el.contains(range.endContainer))return null;
  const beforeStart=document.createRange(); beforeStart.selectNodeContents(el); beforeStart.setEnd(range.startContainer,range.startOffset);
  const beforeEnd=document.createRange(); beforeEnd.selectNodeContents(el); beforeEnd.setEnd(range.endContainer,range.endOffset);
  const start=beforeStart.toString().length; const end=beforeEnd.toString().length;
  return {start:Math.min(start,end),end:Math.max(start,end)};
 };
 const applyRunPatch=(patch: any)=>{const current=docRef.current;if(!current||!activeBlock)return;const offsets=selectionOffsetsForBlock(activeBlock.id);if(!offsets){commit(patchBlockRuns(current,activeBlock.id,patch));return;}const next=cloneWriterDocument(current);const block=next.blocks.find(x=>x.id===activeBlock.id);if(!block)return;block.runs=patchRunsInRange(block.runs,offsets.start,offsets.end,patch);commit(next);};
 const [selectedTableCells,setSelectedTableCells]=useState<Array<{row:number;col:number}>>([]);
 const tableSelectionAnchor=useRef<{row:number;col:number}|null>(null);
 const selectTableCell=(row:number,col:number,shift=false)=>{ if(!shift||!tableSelectionAnchor.current){tableSelectionAnchor.current={row,col};setSelectedTableCells([{row,col}]);return;} const a=tableSelectionAnchor.current; const refs:Array<{row:number;col:number}>=[]; for(let r=Math.min(a.row,row);r<=Math.max(a.row,row);r++) for(let c=Math.min(a.col,col);c<=Math.max(a.col,col);c++) refs.push({row:r,col:c}); setSelectedTableCells(refs); };
 const clearTableSelection=()=>{tableSelectionAnchor.current=null;setSelectedTableCells([])};
 const tableAction=(action:TableActionId|{legacy:'add-row'|'remove-row'|'add-col'|'remove-col'|'borders'|'merge'|'split'})=>{
  const current=docRef.current;if(!current||!activeBlock||activeBlock.type!=='table')return;
  const map:Record<string,TableActionId>={'add-row':'insert-row-below','remove-row':'delete-row','add-col':'insert-col-right','remove-col':'delete-col',borders:'borders',merge:'merge',split:'split'};
  const resolved:TableActionId=typeof action==='string'&&action in map?map[action]:(action as TableActionId);
  const result=applyTableAction(current,activeBlock.id,resolved,selectedTableCells.length?selectedTableCells:[{row:0,col:0}]);
  commit(result.document);
  if(resolved==='delete-table'){clearTableSelection();setActiveBlockId('');return;}
  setSelectedTableCells(result.selection);
  if(result.selection[0]){tableSelectionAnchor.current=result.selection[0];requestAnimationFrame(()=>{const el=document.querySelector(`[data-writer-table-cell="${activeBlock.id}:${result.selection[0].row}:${result.selection[0].col}"]`) as HTMLElement|null;el?.focus();});}
};
 const handleTableCellKeyDown=(event:React.KeyboardEvent<HTMLDivElement>,blockId:string,row:number,col:number)=>{
  if(event.key!=='Tab')return;
  event.preventDefault();
  const current=docRef.current;if(!current)return;
  const dir=event.shiftKey?-1:1;
  let next=nextTableCell(current,blockId,row,col,dir as 1|-1);
  if(!next&&dir===1){
    // Zoho-like: Tab at last cell inserts a new row and moves into it
    const result=applyTableAction(current,blockId,'insert-row-below',[{row,col}]);
    commit(result.document);
    const table=result.document.blocks.find(b=>b.id===blockId)?.table;
    const newRow=(table?.rows.length||1)-1;
    next={row:newRow,col:0};
    setSelectedTableCells([next]);
    tableSelectionAnchor.current=next;
  }
  if(!next)return;
  setSelectedTableCells([next]);
  tableSelectionAnchor.current=next;
  requestAnimationFrame(()=>{const el=document.querySelector(`[data-writer-table-cell="${blockId}:${next!.row}:${next!.col}"]`) as HTMLElement|null;el?.focus();});
};
 const wordStats=useMemo(()=>{if(!doc)return {words:0,chars:0};const text=doc.blocks.flatMap(b=>[b.runs?.map(r=>r.text).join('')||'',...(b.table?b.table.rows.flatMap(r=>r.map(c=>c.runs.map(x=>x.text).join(''))):[]) ]).join(' ');return {words:text.trim()?text.trim().split(/\s+/).length:0,chars:text.length};},[doc]);
 const findOptions=():FindOptions=>({caseSensitive:findCaseSensitive,wholeWord:findWholeWord});
 const focusFindMatch=(match:FindMatch)=>{
  const selector=match.cell
    ? `[data-writer-table-cell="${match.blockId}:${match.cell.row}:${match.cell.col}"]`
    : `[data-writer-block="${match.blockId}"]`;
  const blockEl=document.querySelector(selector) as HTMLElement|null;
  if(!blockEl){setCurrentFind(match);return;}
  blockEl.scrollIntoView({block:'center',behavior:'smooth'});
  const range=document.createRange();
  let offset=0;
  const walker=document.createTreeWalker(blockEl,NodeFilter.SHOW_TEXT);
  let node:Node|null;
  while(node=walker.nextNode()){
    const length=node.textContent?.length??0;
    if(match.start>=offset&&match.start<=offset+length){
      const start=match.start-offset;
      const end=Math.min(length,start+(match.end-match.start));
      range.setStart(node,start);
      range.setEnd(node,end);
      const selection=window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setCurrentFind(match);
      return;
    }
    offset+=length;
  }
  setCurrentFind(match);
 };
 const doFindNext=()=>{if(!doc||!findTerm)return;const match=nextFindMatch(doc,findTerm,currentFind,findOptions());if(!match){setError(t(ar,'No matches found.','لا توجد نتائج.'));return;}focusFindMatch(match);};
 const doFindPrevious=()=>{if(!doc||!findTerm)return;const match=previousFindMatch(doc,findTerm,currentFind,findOptions());if(!match){setError(t(ar,'No matches found.','لا توجد نتائج.'));return;}focusFindMatch(match);};
 const doReplaceOne=()=>{if(!doc||!findTerm)return;let match=currentFind;if(!match){match=nextFindMatch(doc,findTerm,undefined,findOptions());if(!match){setError(t(ar,'No matches found.','لا توجد نتائج.'));return;}focusFindMatch(match);return;}const result=replaceCurrentMatch(doc,findTerm,replaceTerm,match,findOptions());commit(result.doc);if(result.next)focusFindMatch(result.next);else setCurrentFind(undefined);};
 const doReplaceAll=()=>{if(!doc||!findTerm)return;const result=replaceAllMatches(doc,findTerm,replaceTerm,findOptions());if(result.count){commit(result.doc);setCurrentFind(undefined);setError(t(ar,`${result.count} replacement${result.count===1?'':'s'} made`,`تم استبدال ${result.count} نتيجة`));}else setError(t(ar,'No matches found.','لا توجد نتائج.'));};
 const goNextChange=()=>{if(!doc)return;const c=nextPendingChange(doc,activeChangeId||undefined);if(!c)return;setActiveChangeId(c.id);setReviewOpen(true);setReviewTab('changes');const el=document.querySelector(`[data-writer-block="${c.blockId}"]`) as HTMLElement|null;el?.scrollIntoView({block:'center',behavior:'smooth'});};
 const goPrevChange=()=>{if(!doc)return;const c=previousPendingChange(doc,activeChangeId||undefined);if(!c)return;setActiveChangeId(c.id);setReviewOpen(true);setReviewTab('changes');const el=document.querySelector(`[data-writer-block="${c.blockId}"]`) as HTMLElement|null;el?.scrollIntoView({block:'center',behavior:'smooth'});};
 const acceptActiveChange=()=>{if(!doc)return;const r=acceptNextChange(doc,activeChangeId||undefined);commit(r.document);setActiveChangeId(r.nextId||'');};
 const rejectActiveChange=()=>{if(!doc)return;const r=rejectNextChange(doc,activeChangeId||undefined);commit(r.document);setActiveChangeId(r.nextId||'');};
 const askBookmark=()=>{if(!doc||!activeBlock)return;setBookmarkName('bookmark-'+(doc.bookmarks.length+1));setBookmarkDialogOpen(true);};
 const saveBookmark=()=>{const current=docRef.current;if(!current||!activeBlock||!bookmarkName.trim())return;commit(addBookmark(current,activeBlock.id,bookmarkName));setBookmarkDialogOpen(false);};
 const openAdvancedDialog=(mode:NonNullable<typeof advancedDialog>)=>{setAdvancedDialog(mode);setAdvancedText(mode==='equation'?'x = (-b ± √(b²-4ac)) / 2a':mode==='symbol'?'©':'');setAdvancedTitle('');setAdvancedAuthor('');setAdvancedYear('');setAdvancedUrl('');setAdvancedLabel('Figure');setAdvancedSubentry('');setAdvancedTarget(activeBlock?.id||'');setAdvancedDisplay('label');setAdvancedCitationStyle('numeric');if(activeBlock?.table){setAdvancedHeaderRows(activeBlock.table.headerRows||0);setAdvancedRepeatHeader(Boolean(activeBlock.table.repeatHeaderRow));setAdvancedAllowBreak(activeBlock.table.allowRowBreak!==false);} };
 const saveAdvancedDialog=()=>{const current=docRef.current;if(!current)return; if((advancedDialog==='footnote'||advancedDialog==='endnote')&&activeBlock&&advancedText.trim()){commit(advancedDialog==='footnote'?addFootnote(current,activeBlock.id,advancedText):addEndnote(current,activeBlock.id,advancedText));} else if(advancedDialog==='equation'){commit(insertEquation(current,advancedText.trim()||'x = 1',activeBlock?.id));} else if(advancedDialog==='symbol'){commit(insertSymbol(current,advancedText||'©',activeBlock?.id));} else if(advancedDialog==='citation'){const next=addCitation(current,{source:advancedTitle.trim()||advancedText.trim()||'Source',author:advancedAuthor.trim()||undefined,year:advancedYear.trim()||undefined,url:advancedUrl.trim()||undefined},activeBlock?.id);commit(setCitationStyle(next,advancedCitationStyle));} else if(advancedDialog==='caption'&&activeBlock){commit(addCaption(current,activeBlock.id,advancedLabel.trim()||'Figure',advancedText.trim()));} else if(advancedDialog==='crossref'&&advancedTarget.trim()){commit(addCrossReference(current,advancedTarget.trim(),advancedTitle.trim()||'Reference',advancedDisplay,activeBlock?.id));} else if(advancedDialog==='index'&&activeBlock&&advancedText.trim()){commit(addIndexEntry(current,activeBlock.id,advancedText.trim(),advancedSubentry.trim()||undefined));} else if(advancedDialog==='table'&&activeBlock?.type==='table'&&activeBlock.table){commit(updateTableOptions(current,activeBlock.id,{...activeBlock.table,headerRows:Math.max(0,advancedHeaderRows),repeatHeaderRow:advancedRepeatHeader,allowRowBreak:advancedAllowBreak}));} setAdvancedDialog(null);};
 const askFootnote=()=>{if(!doc||!activeBlock)return;openAdvancedDialog('footnote');};
 const askEndnote=()=>{if(!doc||!activeBlock)return;openAdvancedDialog('endnote');};
 const configureColumns=(columns:number)=>{const current=docRef.current;if(!current)return;const secId=activeBlock?.sectionId||current.sections[0]?.id;if(secId)commit(updateSection(current,secId,{columns:Math.max(1,Math.min(4,columns))}));};
 const openPageSetup=(mode:'page'|'section'='page')=>{const current=docRef.current;if(!current)return;const page=current.page;const sec=current.sections.find(x=>x.id===activeBlock?.sectionId)||current.sections[0];setPageSetupMode(mode);setPageSetup({size:page.size,orientation:page.orientation,marginTop:page.marginTopMm,marginRight:page.marginRightMm,marginBottom:page.marginBottomMm,marginLeft:page.marginLeftMm,widthMm:page.widthMm||210,heightMm:page.heightMm||297,header:sec?.header??page.header??'',footer:sec?.footer??page.footer??'',firstHeader:sec?.firstHeader??'',firstFooter:sec?.firstFooter??'',oddHeader:sec?.oddHeader??'',oddFooter:sec?.oddFooter??'',evenHeader:sec?.evenHeader??'',evenFooter:sec?.evenFooter??'',showPageNumbers:page.showPageNumbers!==false,pageNumberFormat:sec?.pageNumberFormat??page.pageNumberFormat??'decimal',pageNumberStart:sec?.pageNumberStart??page.pageNumberStart??1,differentFirstPage:sec?.differentFirstPage??page.differentFirstPage??false,differentOddEven:sec?.differentOddEven??page.differentOddEven??false,columns:sec?.columns??1,columnGapMm:sec?.columnGapMm??8,breakType:sec?.breakType??'next-page'});setPageSetupOpen(true);};
 const savePageSetup=()=>{const current=docRef.current;if(!current)return;const form=pageSetup as any;const next=pageSetupMode==='section'?applySectionPageSetup(current,activeBlock?.id,form):applyDocumentPageSetup(current,form);commit(next);setPageSetupOpen(false);};
 const configureSectionBreak=()=>{setPageSetupMode('section');openPageSetup();};
 const configureHeaderFooter=()=>{openPageSetup();};
 const addEquationPrompt=()=>{if(doc)openAdvancedDialog('equation');};
 const addSymbolPrompt=()=>{if(doc)openAdvancedDialog('symbol');};
 const addCitationPrompt=()=>{if(doc)openAdvancedDialog('citation');};
 const addCaptionPrompt=()=>{if(doc&&activeBlock)openAdvancedDialog('caption');};
 const addCrossRefPrompt=()=>{if(doc)openAdvancedDialog('crossref');};
 const addIndexPrompt=()=>{if(doc&&activeBlock)openAdvancedDialog('index');};
 const imageOptions=()=>openImageDialog();
 const tableOptions=()=>{if(docRef.current&&activeBlock?.type==='table'&&activeBlock.table)openAdvancedDialog('table');};
 const clearFormatting=()=>{const current=docRef.current;if(!current||!activeBlock)return;const offsets=selectionOffsetsForBlock(activeBlock.id);const block=current.blocks.find(b=>b.id===activeBlock.id);if(!block)return;const end=block.runs.reduce((n,r)=>n+(r.text||'').length,0);const from=offsets?.start??0;const to=offsets?.end??end;if(from===to&&!offsets){/* whole block */}const nextRuns=clearFormatInRange(block.runs,offsets?offsets.start:0,offsets?offsets.end:end);commit({...current,blocks:current.blocks.map(b=>b.id===activeBlock.id?{...b,runs:nextRuns}:b)});};
 const setParagraphStyleForActive=(style:'paragraph'|'title'|'subtitle'|'heading1'|'heading2'|'heading3')=>{if(doc&&activeBlock)commit(setParagraphStyle(doc,activeBlock.id,style));};
 const setLineSpacing=(value:number)=>{if(doc&&activeBlock)commit(setBlockSpacing(doc,activeBlock.id,{lineSpacing:value}));};
 const setParagraphSpacing=(kind:'before'|'after', value:number)=>{if(doc&&activeBlock)commit(setBlockSpacing(doc,activeBlock.id,kind==='before'?{spaceBefore:value}:{spaceAfter:value}));};
 const setMarkup=(color:string)=>{if(doc)commit(setMarkupColor(doc,color));};
 const outline=useMemo(()=>doc?buildWriterOutline(doc):[],[doc]);
 const navigateToBlock=(blockId:string)=>{setActiveBlockId(blockId);setNavigatorOpen(false);requestAnimationFrame(()=>{const el=document.querySelector(`[data-writer-block="${blockId}"]`) as HTMLElement|null;el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus();const range=document.createRange();range.selectNodeContents(el!);range.collapse(true);const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range);});};
 const showWordCount=()=>{setError(t(ar,`Word count: ${wordStats.words} · Characters: ${wordStats.chars}`,`عدد الكلمات: ${wordStats.words} · الأحرف: ${wordStats.chars}`));};
 const showDocumentStatistics=()=>{setError(t(ar,`Document statistics — ${wordStats.words} words, ${wordStats.chars} characters, ${pages.length} page(s), ${doc.blocks.length} blocks.`,`إحصاءات المستند — ${wordStats.words} كلمة، ${wordStats.chars} حرف، ${pages.length} صفحة، ${doc.blocks.length} عنصر.`));};
 const applySuperscript=()=>applyRunPatch({verticalAlign:'superscript'});
 const applySubscript=()=>applyRunPatch({verticalAlign:'subscript'});
 const addReviewComment=()=>{const current=docRef.current;if(!current||!activeBlockId||!commentDraft.trim())return;commit(addComment(current,activeBlockId,commentDraft,{name:'You'}));setCommentDraft('');};
 const saveReviewSnapshot=()=>{const current=docRef.current;if(!current)return;commit(addSnapshot(current,revision));};
 const visibleComments=doc?doc.review.comments.filter(c=>!c.deleted && (commentFilter==='all'||(commentFilter==='open'&&!c.resolved)||(commentFilter==='resolved'&&c.resolved))):[];
 const visibleChanges=doc?doc.review.changes.filter(c=>changeFilter==='all'||c.status===changeFilter):[];
 const acceptAll=()=>{ if(!doc) return; commit(acceptAllChanges(doc)); };
 const rejectAll=()=>{ if(!doc) return; commit(rejectAllChanges(doc)); };
 const changePreview=(id:string)=>{const current=docRef.current;const c=current?.review.changes.find(x=>x.id===id);return c?`${textOfRuns(c.before).slice(0,180)} → ${textOfRuns(c.after).slice(0,180)}`:'';};
 const compareRows=doc?compareSnapshot(doc,compareId):[];
 const pageLayout=useMemo(()=>{if(!doc)return {pages:[],ordinals:[]};try{return buildWriterPageLayout(doc);}catch(e){console.error('[office-writer-layout]',e);return {pages:doc.blocks?.length?[doc.blocks]:[[]],ordinals:[1]};}},[doc]);
 useEffect(()=>{
  if(!typewriter)return;
  const onKey=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(!target?.closest?.('[data-writer-editor],[data-writer-table-cell]')||event.key.length!==1)return;
   const ctx=new AudioContext();
   const osc=ctx.createOscillator();
   const gain=ctx.createGain();
   osc.frequency.value=170+Math.random()*50;
   gain.gain.setValueAtTime(0.04, ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.04);
   osc.connect(gain); gain.connect(ctx.destination);
   osc.start(); osc.stop(ctx.currentTime+0.045);
   osc.onended=()=>void ctx.close();
  };
  document.addEventListener('keydown', onKey);
  return ()=>document.removeEventListener('keydown', onKey);
 },[typewriter]);
 const readDictionary=()=>{ try { return JSON.parse(localStorage.getItem('imkan:writer:dictionary')||'{}') as Record<string,string>; } catch { return {}; } };
 const rewriteActiveText=(nextText:string, start?:number, end?:number)=>{ const current=docRef.current; if(!current||!activeBlock)return; const next=cloneWriterDocument(current); const block=next.blocks.find(b=>b.id===activeBlock.id); if(!block)return; const full=block.runs.map(r=>r.text).join(''); block.runs=[{text:start==null?nextText:replacePlainRange(full,start,end??full.length,nextText)}]; commit(next); };
 const focusEditor=()=>{ const el=document.querySelector(`[data-writer-block="${activeBlockId}"]`) as HTMLElement|null; el?.focus(); return el; };
 const cutSelection=()=>{ focusEditor(); document.execCommand('cut'); };
 const copySelection=()=>{ focusEditor(); document.execCommand('copy'); };
 const pasteSelection=async()=>{ try { const text=await navigator.clipboard.readText(); if(!activeBlock||!text)return; const offsets=selectionOffsetsForBlock(activeBlock.id); const length=activeBlock.runs.map(run=>run.text).join('').length; rewriteActiveText(text, offsets?.start ?? length, offsets?.end ?? length); } catch { focusEditor(); document.execCommand('paste'); } };
 const selectAllBlocks=()=>{ const el=focusEditor(); if(!el)return; const range=document.createRange(); range.selectNodeContents(el); const sel=window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); };
 const deleteActiveBlock=()=>{ const current=docRef.current; if(!current||!activeBlock||current.blocks.length<2)return; commit(removeBlock(current,activeBlock.id)); };
 const copyDocument=async()=>{ const current=docRef.current; if(!current)return; const created=await createOfficeDocument({name:`${current.title||'Document'} copy`,type:'WRITER'}); await saveOfficeDocument(created.fileId, current, created.revision); router.push(`/office/writer/${created.fileId}`); };
 const createBlankDocument=async()=>{ const created=await createOfficeDocument({name:'Untitled document',type:'WRITER'}); router.push(`/office/writer/${created.fileId}`); };
 const trashDocument=async()=>{ await trashFile(fileId); router.push('/files'); };
 const openVersions=async()=>{ setVersions(await listOfficeDocumentVersions(fileId)); setVersionsOpen(true); };
 const restoreVersion=async(versionId:string)=>{ const restored=await restoreOfficeDocumentVersion(fileId, versionId, revision); const next=normalizeWriterDocument(restored.content); docRef.current=next; dirtyDoc.current=next; setDoc(next); setRevision(restored.revision); setSaved(true); setVersionsOpen(false); };
 const saveAsDocx=async()=>{ const file=await exportOfficeFile(fileId,'docx'); const bytes=Uint8Array.from(atob(file.dataBase64), char=>char.charCodeAt(0)); const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType})); const link=document.createElement('a'); link.href=url; link.download=file.filename; link.click(); URL.revokeObjectURL(url); };
 const importPickedFile=async(file:File)=>{ const dataBase64=await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onerror=()=>reject(reader.error); reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||''); reader.readAsDataURL(file); }); const created=await importOfficeFile({filename:file.name,dataBase64}); const editor=created.type==='SHEET'?'sheet':created.type==='SHOW'?'show':'writer'; router.push(`/office/${editor}/${created.fileId}`); };
 const readAloud=()=>{ const selected=window.getSelection()?.toString().trim(); const text=selected||docRef.current?.blocks.map(block=>block.runs.map(run=>run.text).join('')).filter(Boolean).join('\n')||''; if(!text||typeof speechSynthesis==='undefined')return; speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text); utterance.lang=ar?'ar-SA':'en-US'; speechSynthesis.speak(utterance); };
 const transliterateSelection=()=>{ if(!activeBlock)return; const offsets=selectionOffsetsForBlock(activeBlock.id); const full=activeBlock.runs.map(run=>run.text).join(''); if(offsets&&offsets.end>offsets.start) rewriteActiveText(transliterateText(full.slice(offsets.start,offsets.end)), offsets.start, offsets.end); else rewriteActiveText(transliterateText(full)); };
 const openReplace=(mode:'translate'|'thesaurus'|'autocorrect'|'dictionary')=>{ if(mode==='autocorrect'){ if(!activeBlock)return; rewriteActiveText(applyAutocorrect(activeBlock.runs.map(run=>run.text).join(''), readDictionary())); return; } setReplaceDraft(window.getSelection()?.toString()||''); setDictFrom(''); setDictTo(''); setReplaceMode(mode); };
 const applyReplaceDialog=()=>{ if(replaceMode==='dictionary'){ const from=dictFrom.trim(); const to=dictTo.trim(); if(!from||!to)return; const map=readDictionary(); map[from.toLowerCase()]=to; localStorage.setItem('imkan:writer:dictionary', JSON.stringify(map)); if(activeBlock) rewriteActiveText(applyAutocorrect(activeBlock.runs.map(run=>run.text).join(''), map)); setReplaceMode(null); return; } if(!activeBlock)return; const offsets=selectionOffsetsForBlock(activeBlock.id); if(offsets&&offsets.end>offsets.start) rewriteActiveText(replaceDraft, offsets.start, offsets.end); else rewriteActiveText(replaceDraft); setReplaceMode(null); };
 const convertTextToTable=()=>{ const current=docRef.current; if(!current||!activeBlock)return; const rows=splitTextToTable(activeBlock.runs.map(run=>run.text).join('')); const next=cloneWriterDocument(current); const index=next.blocks.findIndex(block=>block.id===activeBlock.id); const tableBlock:WriterBlock={id:crypto.randomUUID(),type:'table',align:'start',runs:[],table:{bordered:true,rows:rows.map(row=>row.map(cell=>({id:crypto.randomUUID(),runs:[{text:cell}],align:'start' as const})))}}; if(index<0)next.blocks.push(tableBlock); else next.blocks.splice(index,1,tableBlock); commit(next); };
 const insertDraftLines=()=>{ const current=docRef.current; if(!current)return; const lines=draftText.split(/\n/).map(line=>line.trim()).filter(Boolean); if(!lines.length){ setDraftOpen(false); return; } let next=current; let cursor=activeBlock?.id; for(const line of lines){ const before=new Set(next.blocks.map(block=>block.id)); next=addParagraph(next, cursor); const added=next.blocks.find(block=>!before.has(block.id)); if(!added) break; added.runs=[{text:line}]; cursor=added.id; } commit(next); setDraftText(''); setDraftOpen(false); };
 if(!doc)return <OfficeOpeningProgress stage={openStage==='ready'?'layout':openStage} product="IMKAN Writer" error={openStage==='error'?(error||null):null} ar={ar} />;
 const pages=pageLayout.pages;
 const activeTable=activeBlock?.type==='table'&&activeBlock.table?activeBlock.table:null;
 const selectedCellKeySet=new Set(selectedTableCells.map(c=>`${c.row}:${c.col}`));const {widthMm:pageWidth,heightMm:pageHeight}=pageDimensionsMm(doc.page);
 const writerQueueCount=writerOfflineQueueCount(fileId);
 const writerSaveStatus=deriveWriterSaveStatus({saving,saved,queueCount:writerQueueCount,online:typeof navigator==='undefined'?true:navigator.onLine,conflict:Boolean(conflict),error:error||undefined});
 return <div dir={ar?'rtl':'ltr'} className="flex h-screen flex-col bg-[#f7f7f7] text-[#1c1c1c] print:bg-white">
<WriterChrome
    title={doc.title || 'Untitled Document'} saved={saved} selectionState={selectionState} saving={saving} saveStatus={writerSaveStatus} saveError={error} queuedChanges={writerQueueCount} ar={ar} revision={revision}
    presence={<OfficePresence items={presence} ar={ar}/>} onBack={()=>router.back()}
    onAssignWorkflow={()=>setWorkflowOpen(true)} onShare={()=>setShareOpen(true)}
    onUndo={undo} onRedo={redo} onBold={()=>applyCommand('bold')} onItalic={()=>applyCommand('italic')}
    onUnderline={()=>applyCommand('underline')} onStrike={()=>applyCommand('strike')} onFind={()=>setFindOpen(v=>!v)}
    onInsertTable={()=>doc&&commit(insertTable(doc,3,3,activeBlock?.id))} onInsertImage={openImageDialog}
    onPageBreak={()=>doc&&commit(insertPageBreak(doc,activeBlock?.id))} onPageSettings={openPageSetup} onLink={openLinkDialog}
    onFontFamily={v=>applyRunPatch({fontFamily:v})} onFontSize={v=>applyRunPatch({fontSize:v})}
    onColor={v=>applyRunPatch({color:v})} onHighlight={v=>applyRunPatch({highlight:v})}
    onAlign={align=>activeBlock&&commit(setBlockAlignment(doc,activeBlock.id,align))}
    onList={ordered=>activeBlock&&commit(toggleList(doc,activeBlock.id,ordered))}
    onIndent={()=>activeBlock&&commit(updateBlockLayout(doc,activeBlock.id,{indentLeftMm:Math.min(100,(activeBlock.indentLeftMm??0)+10)}))}
    onOutdent={()=>activeBlock&&commit(updateBlockLayout(doc,activeBlock.id,{indentLeftMm:Math.max(0,(activeBlock.indentLeftMm??0)-10)}))}
    onColumns={(count)=>configureColumns(count)} onColumnBreak={()=>doc&&commit(insertColumnBreak(doc,activeBlock?.id))} onSectionBreak={configureSectionBreak} onHeaderFooter={configureHeaderFooter}
    onEquation={addEquationPrompt} onSymbol={addSymbolPrompt} onCitation={addCitationPrompt}
    onBibliography={()=>doc&&commit(insertBibliography(doc,activeBlock?.id))} onAutoIndex={()=>doc&&commit(insertIndex(doc,activeBlock?.id))}
    onCaption={addCaptionPrompt} onCrossReference={addCrossRefPrompt} onIndex={addIndexPrompt}
    onBookmark={askBookmark} onFootnote={askFootnote} onEndnote={askEndnote}
    onComments={()=>setReviewOpen(true)} onTrackChanges={()=>doc&&commit(toggleTrackChanges(doc))} onReview={()=>setReviewOpen(v=>!v)} onSnapshot={saveReviewSnapshot}
    onClearFormatting={clearFormatting} onLineSpacing={setLineSpacing} onParagraphSpacing={setParagraphSpacing} onParagraphStyle={setParagraphStyleForActive}
    onSuperscript={applySuperscript} onSubscript={applySubscript} onMarkupColor={setMarkup}
    onReviewMode={mode=>doc&&commit(setReviewDisplayMode(doc,mode))} onWordCount={showWordCount} onDocumentStatistics={showDocumentStatistics}
    onPrint={exportPdf} onExport={exportPdf} onFullscreen={()=>document.documentElement.requestFullscreen?.()}
    onAddParagraph={()=>doc&&commit(addParagraph(doc,activeBlock?.id))}
    onNavigate={()=>setNavigatorOpen(v=>!v)}
    onCut={cutSelection} onCopy={copySelection} onPaste={()=>void pasteSelection()} onSelectAll={selectAllBlocks} onDeleteBlock={deleteActiveBlock}
    onViewMode={setDocView} onZoom={setPageZoom} onToggleImages={()=>setHideImages(v=>!v)} onRuler={()=>setShowRuler(v=>!v)} onToggleFormattingMarks={()=>setShowMarks(v=>!v)}
    onBookmarks={()=>setBookmarksOpen(true)} onAppearance={(mode)=>{ setNight(mode==='dark'); document.documentElement.dataset.theme=mode==='dark'?'dark':'light'; }}
    onCopyDocument={()=>void copyDocument()} onNewDocument={()=>void createBlankDocument()} onTrash={()=>void trashDocument()} onVersions={()=>void openVersions()} onProperties={()=>{ setTitleDraft(doc.title); setPropsOpen(true); }}
    onImport={()=>importInputRef.current?.click()} onSaveAs={()=>void saveAsDocx()} onMarkFinal={()=>setFinalized(v=>!v)} onPageBackground={(color)=>commit(updatePageSettings(doc,{background:color}))}
    onInsertField={()=>insertTemplateField('{{Field}}')} onTextToTable={convertTextToTable} onReadAloud={readAloud} onFocusTyping={()=>setFocusTyping(v=>!v)} onTypewriter={()=>setTypewriter(v=>!v)}
    onTransliterate={transliterateSelection} onReplaceText={openReplace} onMaskSelection={()=>applyRunPatch({color:'#ffffff',highlight:'#111827'})} onShortcuts={()=>setShortcutsOpen(true)} onAsk={()=>setDraftOpen(true)}
    ribbonHidden={focusTyping}
  />
  {activeTable&&<div className="flex min-h-9 items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 text-xs print:hidden" data-writer-table-toolbar>
  <span className="me-2 font-medium text-slate-600">{t(ar,'Table','جدول')}</span>
  <button type="button" onClick={()=>tableAction('insert-row-above')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Insert row above','إدراج صف لأعلى')}>{t(ar,'Row ↑','صف ↑')}</button>
  <button type="button" onClick={()=>tableAction('insert-row-below')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Insert row below','إدراج صف لأسفل')}>{t(ar,'Row ↓','صف ↓')}</button>
  <button type="button" onClick={()=>tableAction('insert-col-left')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Insert column left','إدراج عمود لليسار')}>{t(ar,'Col ←','عمود ←')}</button>
  <button type="button" onClick={()=>tableAction('insert-col-right')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Insert column right','إدراج عمود لليمين')}>{t(ar,'Col →','عمود →')}</button>
  <button type="button" onClick={()=>tableAction('delete-row')} className="rounded border px-2 py-1 hover:bg-white text-red-700">{t(ar,'− Row','− صف')}</button>
  <button type="button" onClick={()=>tableAction('delete-col')} className="rounded border px-2 py-1 hover:bg-white text-red-700">{t(ar,'− Col','− عمود')}</button>
  <button type="button" disabled={!doc||!activeBlock||!canMergeSelection(doc,activeBlock.id,selectedTableCells)} onClick={()=>tableAction('merge')} className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-white">{t(ar,'Merge','دمج')}</button>
  <button type="button" disabled={!doc||!activeBlock||!canSplitSelection(doc,activeBlock.id,selectedTableCells)} onClick={()=>tableAction('split')} className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-white">{t(ar,'Split','تقسيم')}</button>
  <button type="button" onClick={()=>tableAction('borders')} className="rounded border px-2 py-1 hover:bg-white">{t(ar,'Borders','حدود')}</button>
  <button type="button" onClick={()=>tableAction('header-row')} className="rounded border px-2 py-1 hover:bg-white">{t(ar,'Header','رأس')}</button>
  <button type="button" onClick={()=>tableAction('valign-top')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Align top','محاذاة أعلى')}>⬆</button>
  <button type="button" onClick={()=>tableAction('valign-middle')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Align middle','محاذاة وسط')}>⬌</button>
  <button type="button" onClick={()=>tableAction('valign-bottom')} className="rounded border px-2 py-1 hover:bg-white" title={t(ar,'Align bottom','محاذاة أسفل')}>⬇</button>
  <button type="button" onClick={()=>tableAction('select-all')} className="rounded border px-2 py-1 hover:bg-white">{t(ar,'Select all','تحديد الكل')}</button>
  <button type="button" onClick={()=>tableAction('delete-table')} className="rounded border px-2 py-1 hover:bg-white text-red-700">{t(ar,'Delete table','حذف الجدول')}</button>
</div>}
  <OfficeMobile type="WRITER" ar={ar} undo={undo} redo={redo} bold={()=>applyCommand('bold')} italic={()=>applyCommand('italic')} underline={()=>applyCommand('underline')} find={()=>setFindOpen(v=>!v)} navigation={()=>document.querySelector('main')?.scrollTo({top:0,behavior:'smooth'})} save={()=>{if(docRef.current)persist(docRef.current,docRef.current)}} />
  <OfficeTemplateFields templateId={templateId} ar={ar} onInsert={insertTemplateField} />
  {findOpen&&<div data-writer-find-panel className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden"><input data-writer-find-input value={findTerm} onChange={e=>{setFindTerm(e.target.value);setCurrentFind(undefined)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.shiftKey?doFindPrevious():doFindNext();}}} placeholder={t(ar,'Find text','ابحث عن نص')} className="w-48 rounded-md border px-3 py-2 text-xs"/><input data-writer-replace-input value={replaceTerm} onChange={e=>setReplaceTerm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();doReplaceOne();}}} placeholder={t(ar,'Replace with','استبدال بـ')} className="w-48 rounded-md border px-3 py-2 text-xs"/><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={findCaseSensitive} onChange={e=>{setFindCaseSensitive(e.target.checked);setCurrentFind(undefined)}}/> {t(ar,'Match case','مطابقة حالة الأحرف')}</label><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={findWholeWord} onChange={e=>{setFindWholeWord(e.target.checked);setCurrentFind(undefined)}}/> {t(ar,'Whole word','كلمة كاملة')}</label><button type="button" onClick={doFindPrevious} className="rounded-md border px-3 py-2 text-xs">{t(ar,'Previous','السابق')}</button><button type="button" onClick={doFindNext} className="rounded-md border px-3 py-2 text-xs">{t(ar,'Next','التالي')}</button><button type="button" onClick={doReplaceOne} className="rounded-md border px-3 py-2 text-xs">{t(ar,'Replace','استبدال')}</button><button type="button" onClick={doReplaceAll} className="rounded-md bg-[var(--wd-primary)] px-3 py-2 text-xs text-white">{t(ar,'Replace all','استبدال الكل')}</button><button type="button" onClick={()=>setFindOpen(false)} className="rounded-md border px-2 py-2 text-xs text-slate-500">✕</button><span className="ms-auto text-[11px] text-slate-400">{(()=>{const m=findTerm?matchIndexOf(doc,findTerm,currentFind,{caseSensitive:findCaseSensitive,wholeWord:findWholeWord}):{index:0,total:0};return m.total?`${m.index}/${m.total}`:`0`;})()} {t(ar,'matches','نتيجة')} · {wordStats.words} {t(ar,'words','كلمة')} · {wordStats.chars} {t(ar,'characters','حرف')}</span></div>}
  {navigatorOpen&&<aside className="w-72 shrink-0 border-e border-slate-200 bg-white p-3 print:hidden" data-writer-navigator>
   <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">{t(ar,'Navigator','التنقل')}</div><button type="button" onClick={()=>setNavigatorOpen(false)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div>
   {outline.length===0?<div className="text-xs text-slate-400">{t(ar,'No headings yet. Apply Heading 1–3 to build the outline.','لا توجد عناوين بعد. استخدم العنوان 1–3 لبناء المخطط.')}</div>:<div className="space-y-1">{outline.map(item=><button key={item.blockId} type="button" onClick={()=>navigateToBlock(item.blockId)} className="block w-full rounded px-2 py-1.5 text-start text-xs hover:bg-slate-100" style={{paddingInlineStart:`${8+(item.level-1)*14}px`}} title={item.text}>{item.text}</button>)}</div>}
  </aside>}
  {reviewOpen&&<aside className="mx-3 mb-3 rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2"><div className="flex gap-1"><button onClick={()=>setReviewTab('comments')} className={`rounded-md px-3 py-1.5 text-xs ${reviewTab==='comments'?'bg-slate-100 font-semibold':''}`}>{t(ar,'Comments','التعليقات')} ({doc.review.comments.filter(c=>!c.resolved&&!c.deleted).length})</button><button onClick={()=>setReviewTab('changes')} className={`rounded-md px-3 py-1.5 text-xs ${reviewTab==='changes'?'bg-slate-100 font-semibold':''}`}>{t(ar,'Changes','التغييرات')} ({doc.review.changes.filter(c=>c.status==='pending').length})</button><button onClick={()=>setReviewTab('compare')} className={`rounded-md px-3 py-1.5 text-xs ${reviewTab==='compare'?'bg-slate-100 font-semibold':''}`}>{t(ar,'Compare','مقارنة')}</button></div><div className="flex flex-wrap gap-2"><button onClick={()=>commit(toggleTrackChanges(doc))} className={`rounded-md border px-3 py-1.5 text-xs ${doc.review.trackChanges?'border-amber-300 bg-amber-50 text-amber-800':''}`}>{doc.review.trackChanges?t(ar,'Track Changes: ON','تتبع التغييرات: مفعل'):t(ar,'Track Changes: OFF','تتبع التغييرات: متوقف')}</button><select value={doc.review.displayMode||'all'} onChange={e=>commit(setReviewDisplayMode(doc,e.target.value as any))} className="rounded border px-2 py-1 text-xs"><option value="all">{t(ar,'All Markup','كل العلامات')}</option><option value="simple">{t(ar,'Simple Markup','علامات مبسطة')}</option><option value="original">{t(ar,'Original','الأصل')}</option></select><button onClick={saveReviewSnapshot} className="rounded-md border px-3 py-1.5 text-xs">{t(ar,'Snapshot','لقطة')}</button><button type="button" onClick={goPrevChange} className="rounded-md border px-3 py-1.5 text-xs">{t(ar,'Prev change','التغيير السابق')}</button><button type="button" onClick={goNextChange} className="rounded-md border px-3 py-1.5 text-xs">{t(ar,'Next change','التغيير التالي')}</button><button type="button" onClick={acceptActiveChange} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">{t(ar,'Accept','قبول')}</button><button type="button" onClick={rejectActiveChange} className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">{t(ar,'Reject','رفض')}</button><button type="button" onClick={()=>doc&&commit(acceptAllChanges(doc))} className="rounded-md border px-3 py-1.5 text-xs">{t(ar,'Accept all','قبول الكل')}</button><button type="button" onClick={()=>doc&&commit(rejectAllChanges(doc))} className="rounded-md border px-3 py-1.5 text-xs">{t(ar,'Reject all','رفض الكل')}</button></div></div>
    <div className="max-h-64 overflow-auto p-4">
      {reviewTab==='comments'&&<div className="space-y-3"><div className="flex flex-wrap gap-2"><input value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder={t(ar,'Comment… Use @name to mention','تعليق… استخدم @الاسم للإشارة')} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-xs"/><button onClick={addReviewComment} className="rounded-md bg-[var(--wd-primary)] px-3 py-2 text-xs text-white">{t(ar,'Add comment','إضافة تعليق')}</button><select value={commentFilter} onChange={e=>setCommentFilter(e.target.value as any)} className="rounded border px-2 py-2 text-xs"><option value="open">{t(ar,'Open','مفتوحة')}</option><option value="resolved">{t(ar,'Resolved','محلولة')}</option><option value="all">{t(ar,'All','الكل')}</option></select></div>{visibleComments.length===0?<div className="text-xs text-slate-400">{t(ar,'No comments in this view.','لا توجد تعليقات في هذا العرض.')}</div>:visibleComments.slice().reverse().map(c=><div key={c.id} className={`rounded-lg border p-3 ${c.resolved?'opacity-60':''}`}><div className="flex items-center justify-between"><div className="text-xs font-medium">{c.authorName||t(ar,'You','أنت')}</div><span className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</span></div><div className="mt-1 text-xs whitespace-pre-wrap">{c.text}</div>{c.mentions?.length?<div className="mt-1 text-[10px] text-blue-600">{t(ar,'Mentions:','الإشارات:')} {c.mentions.map(x=>'@'+x).join(', ')}</div>:null}<div className="mt-2 flex gap-2"><button onClick={()=>commit(toggleCommentResolved(doc,c.id))} className="text-[11px] text-slate-500">{c.resolved?t(ar,'Reopen','إعادة فتح'):t(ar,'Resolve','حل')}</button><button onClick={()=>setActiveBlockId(c.blockId)} className="text-[11px] text-[var(--wd-primary)]">{t(ar,'Go to text','انتقل للنص')}</button><button onClick={()=>commit(deleteComment(doc,c.id))} className="text-[11px] text-red-500">{t(ar,'Delete','حذف')}</button></div>{c.replies?.map(r=><div key={r.id} className="mt-2 rounded bg-slate-50 p-2 text-[11px]"><b>{r.authorName||t(ar,'You','أنت')}:</b> {r.text}</div>)}<div className="mt-2 flex gap-2"><input value={replyDraft[c.id]||''} onChange={e=>setReplyDraft(x=>({...x,[c.id]:e.target.value}))} placeholder={t(ar,'Reply…','رد…')} className="flex-1 rounded border px-2 py-1 text-[11px]"/><button onClick={()=>{commit(replyComment(doc,c.id,replyDraft[c.id]||'',{name:'You'}));setReplyDraft(x=>({...x,[c.id]:''}));}} className="text-[11px]">↵</button></div></div>)}</div>}
      {reviewTab==='changes'&&<div className="space-y-2"><div className="flex flex-wrap gap-2"><select value={changeFilter} onChange={e=>setChangeFilter(e.target.value as any)} className="rounded border px-2 py-1 text-xs"><option value="pending">{t(ar,'Pending','معلقة')}</option><option value="accepted">{t(ar,'Accepted','مقبولة')}</option><option value="rejected">{t(ar,'Rejected','مرفوضة')}</option><option value="all">{t(ar,'All','الكل')}</option></select><button onClick={acceptAll} className="rounded border px-2 py-1 text-[11px]">{t(ar,'Accept all','قبول الكل')}</button><button onClick={rejectAll} className="rounded border px-2 py-1 text-[11px]">{t(ar,'Reject all','رفض الكل')}</button><label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={doc.review.showFormattingChanges!==false} onChange={e=>commit(setShowFormattingChanges(doc,e.target.checked))}/> {t(ar,'Formatting','التنسيق')}</label></div>{visibleChanges.length===0?<div className="text-xs text-slate-400">{t(ar,'No changes in this view.','لا توجد تغييرات في هذا العرض.')}</div>:visibleChanges.slice().reverse().map(c=><div key={c.id} className="rounded-lg border p-3"><div className="flex justify-between text-[11px] font-medium"><span>{c.kind.toUpperCase()} · {c.authorName||t(ar,'You','أنت')}</span><span>{c.status}</span></div><div className="mt-1 text-xs text-slate-600"><del className="text-red-600">{textOfRuns(c.before).slice(0,180)}</del> <span>→</span> <ins className="text-green-700">{textOfRuns(c.after).slice(0,180)}</ins></div>{c.status==='pending'&&<div className="mt-2 flex gap-2"><button onClick={()=>commit(acceptChange(doc,c.id))} className="rounded border px-2 py-1 text-[11px]">{t(ar,'Accept','قبول')}</button><button onClick={()=>commit(rejectChange(doc,c.id))} className="rounded border px-2 py-1 text-[11px]">{t(ar,'Reject','رفض')}</button></div>}</div>)}</div>}
      {reviewTab==='compare'&&<div className="space-y-3"><div className="flex gap-2"><select value={compareId} onChange={e=>setCompareId(e.target.value)} className="flex-1 rounded border px-2 py-2 text-xs"><option value="">{t(ar,'Select snapshot','اختر لقطة')}</option>{doc.review.snapshots.slice().reverse().map(s=><option key={s.id} value={s.id}>Revision {s.revision} · {new Date(s.createdAt).toLocaleString()}</option>)}</select></div>{compareRows.length===0?<div className="text-xs text-slate-400">{compareId?t(ar,'No textual differences.','لا توجد فروقات نصية.'):t(ar,'Choose a snapshot to compare.','اختر لقطة للمقارنة.')}</div>:compareRows.map(r=><div key={r.blockId} className="grid gap-2 md:grid-cols-2"><div className="rounded border bg-red-50 p-2 text-xs">{r.before||'∅'}</div><div className="rounded border bg-green-50 p-2 text-xs">{r.after||'∅'}</div></div>)}</div>}
    </div>
  </aside>}
  {error&&<div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 print:hidden">{error}</div>}
  {finalized&&<div className="mx-3 mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden"><span>{t(ar,'This document is marked final. Unlock it to edit.','هذا المستند مُعلَّم كنهائي. ألغِ القفل للتحرير.')}</span><button type="button" onClick={()=>setFinalized(false)} className="rounded border border-amber-300 bg-white px-2 py-1">{t(ar,'Unlock','إلغاء القفل')}</button></div>}
  <style>{`[data-writer-hide-images] img{visibility:hidden}[data-writer-marks] [data-writer-block]::after{content:'¶';margin-inline-start:4px;color:#9aa3ad}`}</style>
  <input ref={importInputRef} type="file" accept=".docx,.doc,.odt,.rtf,.txt,.xlsx,.xls,.csv,.pptx,.ppt,.odp" className="hidden" onChange={(event)=>{ const file=event.target.files?.[0]; event.target.value=''; if(file) void importPickedFile(file).catch(err=>setError(err instanceof Error?err.message:t(ar,'Import failed.','تعذر الاستيراد.'))); }} />
  <main id="office-main" data-writer-hide-images={hideImages?'':undefined} data-writer-marks={showMarks?'':undefined} className="min-h-0 flex-1 overflow-auto p-6 md:p-10 print:overflow-visible print:p-0">
   <div className="mx-auto flex flex-col items-center gap-8" style={{zoom:pageZoom/100}}>
    {pages.map((pageBlocks,pageIndex)=><section key={pageIndex} className="writer-page relative bg-white shadow-sm print:shadow-none" data-writer-page={pageIndex+1} data-writer-section={sectionForBlock(doc,pageBlocks[0]||doc.blocks[0])?.id||''} dir={ar?'rtl':'ltr'} style={{width:docView==='web'?'min(920px,100%)':`${pageWidth}mm`,minHeight:docView==='web'?'auto':`${pageHeight}mm`,padding:`${doc.page.marginTopMm}mm ${doc.page.marginRightMm}mm ${doc.page.marginBottomMm}mm ${doc.page.marginLeftMm}mm`,fontFamily:'Arial, sans-serif',background:night?'#1b2430':(doc.page.background||'#ffffff'),color:night?'#e8edf3':undefined}}>
      <div style={sectionColumnStyle(sectionForBlock(doc,pageBlocks[0]||doc.blocks[0]))}>{showRuler&&<div aria-hidden className="mb-2 h-4 border-b border-[#d5dbe3]" style={{background:'repeating-linear-gradient(90deg,#9aa3ad 0 1px,transparent 1px 12px)'}}/>}{pageBlocks.map((block,index)=><div key={block.id} id={doc.bookmarks.some(b=>b.blockId===block.id)?doc.bookmarks.find(b=>b.blockId===block.id)?.name:undefined} className="group relative" dir={block.direction==='rtl'?'rtl':block.direction==='ltr'?'ltr':ar?'rtl':'ltr'} style={{...printBlockStyle({pageBreakBefore:block.pageBreakBefore,keepWithNext:block.keepWithNext}),breakBefore:block.columnBreak?'column':undefined,textAlign:block.align==='start'?(block.direction==='rtl'||(block.direction==='auto'&&ar)?'right':'left'):block.align==='end'?(block.direction==='rtl'||(block.direction==='auto'&&ar)?'left':'right'):block.align,marginTop:block.spaceBefore??0,marginBottom:block.spaceAfter??8,lineHeight:block.lineSpacing??1.5,marginLeft:block.indentLeftMm?`${block.indentLeftMm}mm`:undefined,marginRight:block.indentRightMm?`${block.indentRightMm}mm`:undefined,textIndent:block.firstLineIndentMm?`${block.firstLineIndentMm}mm`:undefined}}>
       {block.type==='list-item'&&<span className="absolute -start-7 top-1 text-slate-500">{block.ordered?`${index+1}.`:'•'}</span>}
       {block.type==='table'&&block.table?<table className={`w-full border-collapse ${block.table.bordered?'border border-slate-400':''}`} style={tableBreakStyle(block.table.allowRowBreak!==false)}><thead>{block.table.headerRows&&block.table.headerRows>0&&block.table.rows.slice(0,block.table.headerRows).map((row,r)=><tr key={`h-${r}`} className="writer-table-header" style={{breakInside:'avoid'}}>{row.map((cell,c)=>cell.hidden?null:<th key={cell.id} colSpan={cell.colSpan||1} rowSpan={cell.rowSpan||1} className={`${block.table?.bordered?'border border-slate-300 px-2 py-1 text-start':'text-start'} ${selectedCellKeySet.has(`${r}:${c}`)?'bg-blue-50 ring-1 ring-inset ring-blue-300':''}`} style={{verticalAlign:cell.verticalAlign==='middle'?'middle':cell.verticalAlign==='bottom'?'bottom':'top'}}><div contentEditable={docView!=='reader'&&!finalized} role="textbox" aria-multiline="true" aria-label={t(ar,'Table cell','خلية جدول')} suppressContentEditableWarning data-writer-table-cell={`${block.id}:${r}:${c}`} onFocus={()=>{setActiveBlockId(block.id);selectTableCell(r,c,false)}} onMouseDown={(e)=>{if(!e.shiftKey){/* allow focus */} selectTableCell(r,c,e.shiftKey)}} onKeyDown={e=>handleTableCellKeyDown(e,block.id,r,c)} onInput={e=>updateTableCell(block.id,r,c,e.currentTarget)} className="min-h-6 rounded px-1 outline-none focus:bg-slate-50" dangerouslySetInnerHTML={{__html:htmlForRuns(cell.runs)}} /></th>)}</tr>)}</thead><tbody>{block.table.rows.slice(block.table.headerRows||0).map((row,r0)=>{const r=r0+(block.table?.headerRows||0);return <tr key={r} style={{breakInside:block.table?.allowRowBreak===false?'avoid':'auto'}}>{row.map((cell,c)=>cell.hidden?null:<td key={cell.id} colSpan={cell.colSpan||1} rowSpan={cell.rowSpan||1} className={`${block.table?.bordered?'border border-slate-300 px-2 py-1':''} ${selectedCellKeySet.has(`${r}:${c}`)?'bg-blue-50 ring-1 ring-inset ring-blue-300':''}`} style={{verticalAlign:cell.verticalAlign==='middle'?'middle':cell.verticalAlign==='bottom'?'bottom':'top'}}><div contentEditable={docView!=='reader'&&!finalized} role="textbox" aria-multiline="true" aria-label={t(ar,'Table cell','خلية جدول')} suppressContentEditableWarning data-writer-table-cell={`${block.id}:${r}:${c}`} onFocus={()=>{setActiveBlockId(block.id);selectTableCell(r,c,false)}} onMouseDown={(e)=>{if(!e.shiftKey){/* allow focus */} selectTableCell(r,c,e.shiftKey)}} onKeyDown={e=>handleTableCellKeyDown(e,block.id,r,c)} onInput={e=>updateTableCell(block.id,r,c,e.currentTarget)} className="min-h-6 rounded px-1 outline-none focus:bg-slate-50" dangerouslySetInnerHTML={{__html:htmlForRuns(cell.runs)}} />{cell.nestedTable&&<table className="mt-2 w-full border-collapse border border-slate-300"><tbody>{cell.nestedTable.rows.map((nr,ni)=><tr key={ni}>{nr.map(nc=><td key={nc.id} className="border border-slate-200 p-1 text-xs" dangerouslySetInnerHTML={{__html:htmlForRuns(nc.runs)}} />)}</tr>)}</tbody></table>}</td>)}</tr>})}</tbody></table>
       :block.type==='equation'?<div className="my-3 rounded-lg bg-slate-50 px-4 py-3 text-center font-mono text-lg">{block.runs.map(r=>r.text).join('')}</div>
       :block.type==='symbol'?<div className="my-2 text-center text-2xl">{block.runs.map(r=>r.text).join('')}</div>
       :block.type==='bibliography'?<div className="my-4"><h2 className="mb-2 text-xl font-bold">{t(ar,'Bibliography','المراجع')}</h2>{buildBibliographyEntries(doc).length===0?<div className="text-sm text-slate-400">{t(ar,'No cited sources.','لا توجد مصادر مستشهد بها.')}</div>:buildBibliographyEntries(doc).map(e=><div key={e.sourceId} className="mb-2 text-sm leading-6" dir={ar?'rtl':'ltr'}>{doc.citationStyle==='numeric'?`${e.number}. `:''}{e.text}</div>)}</div>
       :block.type==='index'?<div className="my-4"><h2 className="mb-2 text-xl font-bold">{t(ar,'Index','الفهرس')}</h2>{doc.indexEntries.length===0?<div className="text-sm text-slate-400">{t(ar,'No index entries.','لا توجد عناصر فهرس.')}</div>:[...doc.indexEntries].filter(e=>doc.blocks.some(b=>b.id===e.blockId)).sort((a,b)=>a.term.localeCompare(b.term,undefined,{sensitivity:'base'})).map(e=><div key={e.id} className="text-sm">{e.term}{e.subentry?` — ${e.subentry}`:''}</div>)}</div>
       :block.type==='image'&&block.image?<img src={block.image.src} alt={block.image.alt??''} style={imageStyle(block)} className="rounded-sm" onError={()=>setError(t(ar,'Unable to load this image.','تعذر تحميل هذه الصورة.'))}/>
       :<>
         {block.runs.map(r=>r.text).join('').length===0&&<><div className="pointer-events-none absolute -start-[34px] top-0 flex gap-[4px]"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>doc&&commit(addParagraph(doc,block.id))} className="pointer-events-auto flex h-[20px] w-[20px] items-center justify-center rounded-[2px] border border-[#b9d2fb] bg-white text-[15px] leading-none text-[#7ba6e9]" title="Add block">+</button><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>doc&&commit(setListOrdered(doc,block.id,false))} className="pointer-events-auto flex h-[20px] w-[20px] items-center justify-center rounded-[2px] border border-[#b9d2fb] bg-white text-[11px] leading-none text-[#7ba6e9]" title="List">≡</button></div><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>setDraftOpen(true)} className="absolute end-0 top-0 flex h-[28px] w-[28px] items-center justify-center rounded-[7px] border border-[#d5dfe9] bg-[#f7fafc] text-[#587083] shadow-sm" title={t(ar,'Insert drafted lines','إدراج أسطر')}>✣</button></>}
         <div data-writer-editor data-writer-block={block.id} data-placeholder={block.runs.map(r=>r.text).join('').length===0?t(ar,"Type '/' for commands or '//' for AI prompts","اكتب '/' للأوامر أو '//' لمطالبات AI"):''} contentEditable={docView!=='reader'&&!finalized} role="textbox" aria-multiline="true" aria-label={t(ar,'Document paragraph','فقرة المستند')} suppressContentEditableWarning spellCheck onFocus={()=>setActiveBlockId(block.id)} onInput={e=>updateBlockRuns(block.id,e.currentTarget)} onKeyDown={e=>handleEditorKeyDown(e,block.id)} className={`min-h-8 rounded px-1 outline-none focus:bg-slate-50 ${blockClass(block)}`} dangerouslySetInnerHTML={{__html:htmlForRuns(block.runs)}} />
         {doc.blocks.length>1&&<button title={t(ar,'Delete block','حذف العنصر')} onMouseDown={e=>e.preventDefault()} onClick={()=>commit(removeBlock(doc,block.id))} className="absolute -end-7 top-1 hidden rounded p-1 text-xs text-slate-300 hover:bg-red-50 hover:text-red-500 group-hover:block print:hidden">×</button>}
       </>}
      </div>)}
      </div>
      {doc.captions.filter(c=>pageBlocks.some(b=>b.id===c.blockId)).map(c=><div key={c.id} className="mt-1 text-center text-xs text-slate-500">{c.label} {c.number}: {c.text}</div>)}
      {(()=>{const sec=sectionForBlock(doc,pageBlocks[0]||doc.blocks[0]);const sectionOrdinal=sectionPageOrdinal(pageLayout,pageIndex);const pageNumber=pageNumberFor(doc,pageLayout,pageIndex,pageBlocks);const {header,footer}=sectionHeaderFooter(doc,sec,sectionOrdinal,pageNumber);const footnotes=doc.footnotes.filter(f=>pageBlocks.some(b=>b.id===f.blockId));return <>{header&&<div className="absolute top-3 start-0 end-0 px-6 text-center text-[9px] text-slate-400">{header}</div>}{footnotes.length>0&&<div className="mt-6 border-t pt-2 text-[10px] text-slate-500" style={{breakInside:'avoid',pageBreakInside:'avoid'}}>{footnotes.map(f=><div key={f.id} className="mb-1"><sup>{f.marker}</sup> {f.text}</div>)}</div>}{pageIndex===pages.length-1&&doc.endnotes.length>0&&<div className="mt-8 border-t pt-3 text-[10px] text-slate-500"><div className="mb-2 font-semibold">{t(ar,'Endnotes','الحواشي الختامية')}</div>{doc.endnotes.map(f=><div key={f.id} className="mb-1"><sup>{f.marker}</sup> {f.text}</div>)}</div>}{(footer||doc.page.showPageNumbers)&&<div className="absolute bottom-3 start-0 end-0 px-6 text-center text-[9px] text-slate-400">{footer}{doc.page.showPageNumbers?` · ${t(ar,'Page','صفحة')} ${formatPageNumber(pageNumber,sec?.pageNumberFormat??doc.page.pageNumberFormat)}`:''}</div>}</>;})()}
    </section>)}
   </div>
  </main>
  <footer className="flex h-[31px] shrink-0 items-center justify-between border-t border-[#d8d8d8] bg-white px-[10px] text-[12px] text-[#55595f] print:hidden"><div className="flex h-full items-center gap-[14px]"><span>◫</span><span>▣</span><span>English (UK)</span><span>Words: {wordStats.words}</span><span>Chars: {wordStats.chars}</span><span>Page: 1 of {pages.length}</span></div><div className="flex h-full items-center gap-[12px]"><span className="flex items-center gap-1">Track Changes <span className="inline-block h-[14px] w-[25px] rounded-full bg-[#e5e7eb] p-[2px]"><span className="block h-[10px] w-[10px] rounded-full bg-white shadow"/></span></span><span>▤</span><span>100%</span><span>☾</span><button onClick={()=>document.documentElement.requestFullscreen?.()} title="Fullscreen">⛶</button></div></footer>
  {bookmarksOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div className="text-base font-semibold">{t(ar,'Bookmarks','الإشارات المرجعية')}</div><button type="button" onClick={()=>setBookmarksOpen(false)} className="rounded px-2 py-1 text-slate-500">×</button></div>{doc.bookmarks.length===0?<div className="text-sm text-slate-500">{t(ar,'No bookmarks yet.','لا توجد إشارات مرجعية بعد.')}</div>:<div className="max-h-72 space-y-1 overflow-auto">{doc.bookmarks.map(mark=><button key={mark.id} type="button" onClick={()=>{setBookmarksOpen(false);navigateToBlock(mark.blockId);}} className="block w-full rounded px-2 py-2 text-start text-sm hover:bg-slate-100">{mark.name}</button>)}</div>}</div></div>}
  {versionsOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div className="text-base font-semibold">{t(ar,'Document versions','إصدارات المستند')}</div><button type="button" onClick={()=>setVersionsOpen(false)} className="rounded px-2 py-1 text-slate-500">×</button></div>{versions.length===0?<div className="text-sm text-slate-500">{t(ar,'No saved versions yet.','لا توجد إصدارات محفوظة بعد.')}</div>:<div className="max-h-80 space-y-2 overflow-auto">{versions.map(version=><div key={version.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"><div><div>v{version.versionNumber}{version.label?` · ${version.label}`:''}</div><div className="text-xs text-slate-500">{new Date(version.createdAt).toLocaleString()}</div></div><button type="button" onClick={()=>void restoreVersion(version.id).catch(err=>setError(err instanceof Error?err.message:t(ar,'Restore failed.','تعذرت الاستعادة.')))} className="rounded bg-[var(--wd-primary)] px-3 py-1.5 text-xs text-white">{t(ar,'Restore','استعادة')}</button></div>)}</div>}</div></div>}
  {propsOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 text-base font-semibold">{t(ar,'Document properties','خصائص المستند')}</div><label className="block text-xs font-medium">{t(ar,'Title','العنوان')}<input value={titleDraft} onChange={e=>setTitleDraft(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><div className="mt-3 text-xs text-slate-500">{wordStats.words} {t(ar,'words','كلمة')} · {wordStats.chars} {t(ar,'characters','حرف')} · {pages.length} {t(ar,'pages','صفحة')} · {t(ar,'Revision','المراجعة')} {revision}</div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setPropsOpen(false)} className="rounded border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={()=>{commit({...doc,title:titleDraft.trim()||doc.title});setPropsOpen(false);}} className="rounded bg-[var(--wd-primary)] px-3 py-2 text-sm text-white">{t(ar,'Save','حفظ')}</button></div></div></div>}
  {replaceMode&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 text-base font-semibold">{replaceMode==='translate'?t(ar,'Replace with translation','استبدال بالترجمة'):replaceMode==='thesaurus'?t(ar,'Replace with a synonym','استبدال بمرادف'):t(ar,'Personal dictionary','القاموس الشخصي')}</div>{replaceMode==='dictionary'?<div className="grid gap-2"><input value={dictFrom} onChange={e=>setDictFrom(e.target.value)} placeholder={t(ar,'Word','الكلمة')} className="rounded-lg border px-3 py-2 text-sm"/><input value={dictTo} onChange={e=>setDictTo(e.target.value)} placeholder={t(ar,'Replacement','البديل')} className="rounded-lg border px-3 py-2 text-sm"/></div>:<textarea value={replaceDraft} onChange={e=>setReplaceDraft(e.target.value)} rows={5} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder={replaceMode==='translate'?t(ar,'Type the translation. It replaces the selection.','اكتب الترجمة. ستحل محل التحديد.'):t(ar,'Type the synonym. It replaces the selection.','اكتب المرادف. سيحل محل التحديد.')}/>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setReplaceMode(null)} className="rounded border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={applyReplaceDialog} className="rounded bg-[var(--wd-primary)] px-3 py-2 text-sm text-white">{t(ar,'Apply','تطبيق')}</button></div></div></div>}
  {draftOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 text-base font-semibold">{t(ar,'Insert drafted text','إدراج نص معدّ')}</div><textarea value={draftText} onChange={e=>setDraftText(e.target.value)} rows={8} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder={t(ar,'Each line becomes a paragraph.','كل سطر يصبح فقرة.')}/><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>setDraftOpen(false)} className="rounded border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={insertDraftLines} className="rounded bg-[var(--wd-primary)] px-3 py-2 text-sm text-white">{t(ar,'Insert','إدراج')}</button></div></div></div>}
  {shortcutsOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div className="text-base font-semibold">{t(ar,'Keyboard shortcuts','اختصارات لوحة المفاتيح')}</div><button type="button" onClick={()=>setShortcutsOpen(false)} className="rounded px-2 py-1 text-slate-500">×</button></div><div className="space-y-2 text-sm">{[['Ctrl+Z',t(ar,'Undo','تراجع')],['Ctrl+Y',t(ar,'Redo','إعادة')],['Ctrl+B',t(ar,'Bold','عريض')],['Ctrl+I',t(ar,'Italic','مائل')],['Ctrl+U',t(ar,'Underline','تسطير')],['Ctrl+F',t(ar,'Find','بحث')],['Ctrl+A',t(ar,'Select paragraph','تحديد الفقرة')],['Ctrl+P',t(ar,'Print','طباعة')]].map(([key,label])=><div key={key} className="flex justify-between gap-4"><span>{label}</span><span className="text-slate-500">{key}</span></div>)}</div></div></div>}
  {shareOpen&&<ShareModal resourceType="FILE" resourceId={fileId} onClose={()=>setShareOpen(false)}/>}
  {workflowOpen&&<WorkflowPicker resourceType="FILE" resourceId={fileId} resourceName={doc.title} onClose={()=>setWorkflowOpen(false)} onStarted={()=>undefined}/>}
  {conflict&&<OfficeConflictDialog conflict={conflict} queuedCount={writerOfflineQueueCount(fileId)} ar={ar} onKeepLocal={()=>void resolveConflict('local')} onUseRemote={()=>void resolveConflict('remote')} onApplyMerged={applyMergedConflict} onDismiss={()=>setConflict(null)}/>}
  {linkDialogOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog" aria-modal="true" aria-label={t(ar,'Link','رابط')}><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 text-base font-semibold">{t(ar,'Insert / Edit Link','إدراج / تعديل رابط')}</div><div className="mb-3 flex gap-2"><button type="button" onClick={()=>setInternalLink(false)} className={`rounded-lg border px-3 py-2 text-xs ${!internalLink?'bg-blue-50 text-blue-700':''}`}>{t(ar,'Web URL','رابط ويب')}</button><button type="button" onClick={()=>setInternalLink(true)} className={`rounded-lg border px-3 py-2 text-xs ${internalLink?'bg-blue-50 text-blue-700':''}`}>{t(ar,'Bookmark','إشارة مرجعية')}</button></div>{internalLink?<label className="mb-1 block text-xs font-medium text-slate-600">{t(ar,'Target bookmark','الإشارة المرجعية الهدف')}<select autoFocus value={linkTarget} onChange={e=>setLinkTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">{t(ar,'Select bookmark','اختر إشارة مرجعية')}</option>{doc.bookmarks.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}</select></label>:<label className="mb-1 block text-xs font-medium text-slate-600">{t(ar,'URL','الرابط')}<input autoFocus value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>}<div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={removeLink} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">{t(ar,'Remove link','إزالة الرابط')}</button><div className="flex gap-2"><button type="button" onClick={()=>setLinkDialogOpen(false)} className="rounded-lg border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={saveLink} disabled={internalLink?!linkTarget:!linkUrl.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">{t(ar,'Apply','تطبيق')}</button></div></div></div></div>}
  {advancedDialog&&<div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog" aria-modal="true" aria-label={t(ar,'Writer dialog','حوار Writer')}><div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div className="text-base font-semibold">{({footnote:t(ar,'Footnote','حاشية سفلية'),endnote:t(ar,'Endnote','حاشية ختامية'),equation:t(ar,'Equation','معادلة'),symbol:t(ar,'Symbol','رمز'),citation:t(ar,'Citation','استشهاد'),caption:t(ar,'Caption','تسمية توضيحية'),crossref:t(ar,'Cross-reference','مرجع متقاطع'),index:t(ar,'Index entry','إدخال فهرس'),table:t(ar,'Table options','خيارات الجدول')} as any)[advancedDialog]}</div><button type="button" onClick={()=>setAdvancedDialog(null)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div>
  {(advancedDialog==='footnote'||advancedDialog==='endnote')&&<label className="text-xs font-medium">{t(ar,'Text','النص')}<textarea autoFocus value={advancedText} onChange={e=>setAdvancedText(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder={t(ar,'Write the note…','اكتب نص الحاشية…')}/></label>}
  {(advancedDialog==='equation'||advancedDialog==='symbol')&&<label className="text-xs font-medium">{advancedDialog==='equation'?t(ar,'Equation (LaTeX-like text)','المعادلة (صيغة شبيهة بـ LaTeX)'):t(ar,'Symbol','الرمز')}<input autoFocus value={advancedText} onChange={e=>setAdvancedText(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label>}
  {advancedDialog==='citation'&&<div className="grid gap-3"><label className="text-xs font-medium">{t(ar,'Source / title','المصدر / العنوان')}<input autoFocus value={advancedTitle} onChange={e=>setAdvancedTitle(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Author','المؤلف')}<input value={advancedAuthor} onChange={e=>setAdvancedAuthor(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Year','السنة')}<input value={advancedYear} onChange={e=>setAdvancedYear(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div><label className="text-xs font-medium">URL<input value={advancedUrl} onChange={e=>setAdvancedUrl(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Citation style','نمط الاستشهاد')}<select value={advancedCitationStyle} onChange={e=>setAdvancedCitationStyle(e.target.value as any)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="numeric">Numeric</option><option value="apa">APA</option><option value="mla">MLA</option><option value="chicago">Chicago</option></select></label></div>}
  {advancedDialog==='caption'&&<div className="grid gap-3"><label className="text-xs font-medium">{t(ar,'Label','التسمية')}<input autoFocus value={advancedLabel} onChange={e=>setAdvancedLabel(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Caption text','نص التسمية')}<textarea value={advancedText} onChange={e=>setAdvancedText(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div>}
  {advancedDialog==='crossref'&&<div className="grid gap-3"><label className="text-xs font-medium">{t(ar,'Target','الهدف')}<select autoFocus value={advancedTarget} onChange={e=>setAdvancedTarget(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="">{t(ar,'Select a target','اختر هدفًا')}</option>{doc?.captions.map(c=><option key={c.id} value={c.id}>{c.label} {c.number} — {c.text||c.blockId}</option>)}{doc?.bookmarks.map(b=><option key={b.id} value={b.blockId}>🔖 {b.name}</option>)}{doc?.blocks.filter(b=>b.type!=='page-break').map(b=><option key={b.id} value={b.id}>{b.id.slice(0,12)}</option>)}</select></label><label className="text-xs font-medium">{t(ar,'Reference name','اسم المرجع')}<input value={advancedTitle} onChange={e=>setAdvancedTitle(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Display as','عرض كـ')}<select value={advancedDisplay} onChange={e=>setAdvancedDisplay(e.target.value as any)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="label">Label</option><option value="number">Number</option><option value="text">Text</option></select></label></div>}
  {advancedDialog==='index'&&<div className="grid gap-3"><label className="text-xs font-medium">{t(ar,'Index term','مصطلح الفهرس')}<input autoFocus value={advancedText} onChange={e=>setAdvancedText(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Subentry (optional)','فرعي (اختياري)')}<input value={advancedSubentry} onChange={e=>setAdvancedSubentry(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div>}
  {advancedDialog==='table'&&<div className="grid gap-4"><label className="text-xs font-medium">{t(ar,'Header rows','صفوف الرأس')}<input type="number" min="0" max={activeBlock?.table?.rows.length||50} value={advancedHeaderRows} onChange={e=>setAdvancedHeaderRows(Math.max(0,Number(e.target.value)||0))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={advancedRepeatHeader} onChange={e=>setAdvancedRepeatHeader(e.target.checked)}/>{t(ar,'Repeat header row on each page','تكرار صف الرأس في كل صفحة')}</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={advancedAllowBreak} onChange={e=>setAdvancedAllowBreak(e.target.checked)}/>{t(ar,'Allow rows to split across pages','السماح بانقسام الصفوف عبر الصفحات')}</label></div>}
  <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setAdvancedDialog(null)} className="rounded-lg border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={saveAdvancedDialog} disabled={((advancedDialog==='footnote'||advancedDialog==='endnote'||advancedDialog==='index')&&!advancedText.trim())||(advancedDialog==='crossref'&&!advancedTarget)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">{t(ar,'Apply','تطبيق')}</button></div></div></div>}
  {pageSetupOpen&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog" aria-modal="true" aria-label={t(ar,'Page Setup','إعداد الصفحة')}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div className="text-base font-semibold">{t(ar,'Page Setup & Sections','إعداد الصفحة والأقسام')}</div><button type="button" onClick={()=>setPageSetupOpen(false)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">×</button></div><div className="grid gap-4"><div><div className="mb-2 text-xs font-semibold text-slate-700">{t(ar,'Page','الصفحة')}</div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Size','الحجم')}<select value={pageSetup.size} onChange={e=>setPageSetup(v=>({...v,size:e.target.value as any}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="A4">A4</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option><option value="CUSTOM">Custom</option></select></label><label className="text-xs font-medium">{t(ar,'Orientation','الاتجاه')}<select value={pageSetup.orientation} onChange={e=>setPageSetup(v=>({...v,orientation:e.target.value as any}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="portrait">{t(ar,'Portrait','عمودي')}</option><option value="landscape">{t(ar,'Landscape','أفقي')}</option></select></label></div>{pageSetup.size==='CUSTOM'&&<div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Width (mm)','العرض (مم)')}<input type="number" value={pageSetup.widthMm} onChange={e=>setPageSetup(v=>({...v,widthMm:Number(e.target.value)||1}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Height (mm)','الارتفاع (مم)')}<input type="number" value={pageSetup.heightMm} onChange={e=>setPageSetup(v=>({...v,heightMm:Number(e.target.value)||1}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div>}</div><div><div className="mb-2 text-xs font-semibold text-slate-700">{t(ar,'Margins (mm)','الهوامش (مم)')}</div><div className="grid grid-cols-4 gap-2">{([['marginTop','Top'],['marginRight','Right'],['marginBottom','Bottom'],['marginLeft','Left']] as const).map(([key,label])=><label key={key} className="text-[11px] font-medium">{t(ar,label,label==='Top'?'علوي':label==='Right'?'أيمن':label==='Bottom'?'سفلي':'أيسر')}<input type="number" min="0" value={pageSetup[key]} onChange={e=>setPageSetup(v=>({...v,[key]:Number(e.target.value)||0}))} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"/></label>)}</div></div><div><div className="mb-2 text-xs font-semibold text-slate-700">{t(ar,'Header & Footer','الرأس والتذييل')}</div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Header','الرأس')}<input value={pageSetup.header} onChange={e=>setPageSetup(v=>({...v,header:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Footer','التذييل')}<input value={pageSetup.footer} onChange={e=>setPageSetup(v=>({...v,footer:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={pageSetup.differentFirstPage} onChange={e=>setPageSetup(v=>({...v,differentFirstPage:e.target.checked}))}/>{t(ar,'Different first page','صفحة أولى مختلفة')}</label><div className="mt-2 grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'First-page header','رأس الصفحة الأولى')}<input disabled={!pageSetup.differentFirstPage} value={pageSetup.firstHeader} onChange={e=>setPageSetup(v=>({...v,firstHeader:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label><label className="text-xs font-medium">{t(ar,'First-page footer','تذييل الصفحة الأولى')}<input disabled={!pageSetup.differentFirstPage} value={pageSetup.firstFooter} onChange={e=>setPageSetup(v=>({...v,firstFooter:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label></div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={pageSetup.differentOddEven} onChange={e=>setPageSetup(v=>({...v,differentOddEven:e.target.checked}))}/>{t(ar,'Different odd/even pages','صفحات فردية وزوجية مختلفة')}</label><div className="mt-2 grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Odd header','رأس الفردية')}<input disabled={!pageSetup.differentOddEven} value={pageSetup.oddHeader} onChange={e=>setPageSetup(v=>({...v,oddHeader:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label><label className="text-xs font-medium">{t(ar,'Even header','رأس الزوجية')}<input disabled={!pageSetup.differentOddEven} value={pageSetup.evenHeader} onChange={e=>setPageSetup(v=>({...v,evenHeader:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label><label className="text-xs font-medium">{t(ar,'Odd footer','تذييل الفردية')}<input disabled={!pageSetup.differentOddEven} value={pageSetup.oddFooter} onChange={e=>setPageSetup(v=>({...v,oddFooter:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label><label className="text-xs font-medium">{t(ar,'Even footer','تذييل الزوجية')}<input disabled={!pageSetup.differentOddEven} value={pageSetup.evenFooter} onChange={e=>setPageSetup(v=>({...v,evenFooter:e.target.value}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-50"/></label></div></div><div><div className="mb-2 text-xs font-semibold text-slate-700">{t(ar,'Page numbers & Section','ترقيم الصفحات والقسم')}</div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium">{t(ar,'Number format','تنسيق الرقم')}<select value={pageSetup.pageNumberFormat} onChange={e=>setPageSetup(v=>({...v,pageNumberFormat:e.target.value as any}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="decimal">1, 2, 3</option><option value="roman-lower">i, ii, iii</option><option value="roman-upper">I, II, III</option><option value="letter-upper">A, B, C</option><option value="letter-lower">a, b, c</option></select></label><label className="text-xs font-medium">{t(ar,'Start at','ابدأ من')}<input type="number" min="1" value={pageSetup.pageNumberStart} onChange={e=>setPageSetup(v=>({...v,pageNumberStart:Number(e.target.value)||1}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label></div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={pageSetup.showPageNumbers} onChange={e=>setPageSetup(v=>({...v,showPageNumbers:e.target.checked}))}/>{t(ar,'Show page numbers','إظهار أرقام الصفحات')}</label><div className="mt-3 grid grid-cols-3 gap-3"><label className="text-xs font-medium">{t(ar,'Columns','الأعمدة')}<select value={pageSetup.columns} onChange={e=>setPageSetup(v=>({...v,columns:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label><label className="text-xs font-medium">{t(ar,'Column gap (mm)','فاصل الأعمدة (مم)')}<input type="number" min="4" max="40" value={pageSetup.columnGapMm} onChange={e=>setPageSetup(v=>({...v,columnGapMm:Number(e.target.value)||4}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-medium">{t(ar,'Section break','فاصل القسم')}<select value={pageSetup.breakType} onChange={e=>setPageSetup(v=>({...v,breakType:e.target.value as any}))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"><option value="next-page">{t(ar,'Next page','الصفحة التالية')}</option><option value="continuous">{t(ar,'Continuous','مستمر')}</option><option value="even-page">{t(ar,'Even page','صفحة زوجية')}</option><option value="odd-page">{t(ar,'Odd page','صفحة فردية')}</option></select></label></div></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setPageSetupOpen(false)} className="rounded-lg border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={savePageSetup} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">{t(ar,'Apply','تطبيق')}</button></div></div></div>}
  {imageDialogOpen&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 print:hidden" role="dialog" aria-modal="true" aria-label={t(ar,'Image','صورة')}><div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 text-base font-semibold">{t(ar,'Insert / Edit Image','إدراج / تعديل صورة')}</div><div className="grid gap-3"><label className="text-xs font-medium text-slate-600">{t(ar,'Image URL','رابط الصورة')}<input value={imageSrc.startsWith('data:')?'':imageSrc} onChange={e=>setImageSrc(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><label className="text-xs font-medium text-slate-600">{t(ar,'Or choose a local image','أو اختر صورة من الجهاز')}<input type="file" accept="image/*" onChange={e=>onImageFile(e.target.files?.[0]||null)} className="mt-1 block w-full text-sm"/></label><label className="text-xs font-medium text-slate-600">{t(ar,'Alt text','النص البديل')}<input value={imageAlt} onChange={e=>setImageAlt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-medium text-slate-600">{t(ar,'Width (px)','العرض (بكسل)')}<input type="number" min="40" value={imageWidth} onChange={e=>setImageWidth(Number(e.target.value)||40)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><label className="text-xs font-medium text-slate-600">{t(ar,'Height (px, optional)','الارتفاع (بكسل، اختياري)')}<input type="number" min="40" value={imageHeight??''} onChange={e=>setImageHeight(e.target.value?Number(e.target.value):undefined)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setImageDialogOpen(false)} className="rounded-lg border px-3 py-2 text-sm">{t(ar,'Cancel','إلغاء')}</button><button type="button" onClick={saveImage} disabled={!imageSrc.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40">{t(ar,'Insert image','إدراج الصورة')}</button></div></div></div>}
  <style>{`[data-placeholder]:empty::before{content:attr(data-placeholder);color:#b5b9bf;pointer-events:none;white-space:nowrap;}
[data-placeholder]:empty{min-height:32px;}
@media print{
${printPageCss(doc.page)}
html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0!important}
.writer-page{box-sizing:border-box;break-after:page;page-break-after:always;break-inside:avoid;box-shadow:none!important;overflow:visible!important}
.writer-page:last-child{break-after:auto;page-break-after:auto}
.writer-page [contenteditable]{outline:none!important;background:transparent!important}
.writer-page [dir='rtl']{unicode-bidi:plaintext}
.writer-page p,.writer-page li{orphans:3;widows:3}
.writer-page [data-writer-block]{break-inside:auto}
.writer-page [style*="break-before: page"]{break-before:page;page-break-before:always}
.writer-page [style*="break-after: avoid"]{break-after:avoid;page-break-after:avoid}
.writer-page figure,.writer-page .writer-image,.writer-page .writer-caption,.writer-page .writer-footnote,.writer-page .writer-endnote{break-inside:avoid;page-break-inside:avoid}
.writer-page button{display:none!important}
.writer-page table{width:100%;border-collapse:collapse}
.writer-page thead{display:table-header-group}
.writer-page tfoot{display:table-footer-group}
.writer-table-header{break-after:auto;page-break-after:auto}
.writer-page tr{break-inside:auto;page-break-inside:auto}
.writer-page tr:has(td[style*='avoid']){break-inside:avoid;page-break-inside:avoid}
.imkan-writer-printing .writer-page{print-color-adjust:exact;-webkit-print-color-adjust:exact}
.writer-page img{max-width:100%;break-inside:avoid;page-break-inside:avoid}
.writer-page a{color:inherit!important;text-decoration:none!important}
.writer-page{font-family:Arial,Tahoma,sans-serif}
}`}</style>
 </div>;
}
