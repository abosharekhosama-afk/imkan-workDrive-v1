import type { WriterBlock, WriterChange, WriterComment, WriterDocument, WriterRun, WriterSnapshot } from './model';
import { cloneWriterDocument } from './commands';

export function textOfRuns(runs: WriterRun[]) { return runs.map(r => r.text).join(''); }
export function textOfBlock(block: WriterBlock) { return block.runs?.length ? textOfRuns(block.runs) : ''; }

export function addComment(doc: WriterDocument, blockId: string, text: string): WriterDocument {
  const next = cloneWriterDocument(doc); const value=text.trim(); if(!value) return next;
  next.review.comments.push({ id: crypto.randomUUID(), blockId, text:value.slice(0,4000), createdAt:new Date().toISOString(), resolved:false, replies:[] });
  return next;
}
export function replyComment(doc: WriterDocument, commentId: string, text: string): WriterDocument {
  const next=cloneWriterDocument(doc); const c=next.review.comments.find(x=>x.id===commentId); if(!c||!text.trim()) return next;
  c.replies ??=[]; c.replies.push({id:crypto.randomUUID(),text:text.trim().slice(0,2000),createdAt:new Date().toISOString()}); return next;
}
export function toggleCommentResolved(doc: WriterDocument, commentId: string): WriterDocument { const next=cloneWriterDocument(doc); const c=next.review.comments.find(x=>x.id===commentId); if(c)c.resolved=!c.resolved; return next; }
export function toggleTrackChanges(doc: WriterDocument): WriterDocument { const next=cloneWriterDocument(doc); next.review.trackChanges=!next.review.trackChanges; return next; }

export function recordChange(doc: WriterDocument, blockId: string, before: WriterRun[], after: WriterRun[], kind: WriterChange['kind']): WriterDocument {
  const next=cloneWriterDocument(doc); if(!next.review.trackChanges) return next;
  if(JSON.stringify(before)===JSON.stringify(after)) return next;
  next.review.changes.push({id:crypto.randomUUID(),blockId,kind,before:cloneRuns(before),after:cloneRuns(after),createdAt:new Date().toISOString(),status:'pending'});
  next.review.changes=next.review.changes.slice(-500); return next;
}
export function acceptChange(doc: WriterDocument, id: string): WriterDocument { const next=cloneWriterDocument(doc); const c=next.review.changes.find(x=>x.id===id); if(c)c.status='accepted'; return next; }
export function rejectChange(doc: WriterDocument, id: string): WriterDocument { const next=cloneWriterDocument(doc); const c=next.review.changes.find(x=>x.id===id); if(!c)return next; const block=next.blocks.find(b=>b.id===c.blockId); if(block)block.runs=cloneRuns(c.before); c.status='rejected'; return next; }
export function addSnapshot(doc: WriterDocument, revision: number): WriterDocument { const next=cloneWriterDocument(doc); const snapshot:WriterSnapshot={id:crypto.randomUUID(),revision,title:doc.title,createdAt:new Date().toISOString(),blocks:cloneWriterDocument(doc).blocks}; next.review.snapshots=[...next.review.snapshots,snapshot].slice(-20); return next; }
export function compareSnapshot(doc: WriterDocument, snapshotId: string) {
  const snap=doc.review.snapshots.find(x=>x.id===snapshotId); if(!snap)return [] as {blockId:string;before:string;after:string;changed:boolean}[];
  const ids=new Set([...snap.blocks.map(x=>x.id),...doc.blocks.map(x=>x.id)]);
  return [...ids].map(blockId=>{const before=snap.blocks.find(x=>x.id===blockId);const after=doc.blocks.find(x=>x.id===blockId);const b=before?textOfBlock(before):'';const a=after?textOfBlock(after):'';return {blockId,before:b,after:a,changed:b!==a};}).filter(x=>x.changed);
}
function cloneRuns(runs:WriterRun[]){return JSON.parse(JSON.stringify(runs)) as WriterRun[];}
