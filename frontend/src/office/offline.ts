import { flushOfficeQueue, readOfficeQueue, queueOfficeOperation, type OfficeQueuedOperation, createOfficeOperation, applyOfficePatchDocument } from './collaboration-v2';
import { diffOfficeDocuments } from './offline-logic';
import { planOfficeRebase } from './office-rebase-logic';
import { getOfficeOperations, openOfficeDocument } from '@/lib/api/office';
import type { OfficeOperationPatch } from '@/lib/api/office';
import { officeClone, officeEqual, scheduleOfficeIdle } from './performance';

type OfflineSnapshot = { fileId:string; kind:'SHEET'|'SHOW'|'WRITER'; revision:number; document:any; updatedAt:string };
type OfflineConflict = { fileId:string; kind:'SHEET'|'SHOW'|'WRITER'; local:any; remote:any; remoteRevision:number; detectedAt:string; reason:string };

const snapshotKey=(fileId:string)=>`imkan:office:snapshot:${fileId}`;
const conflictKey=(fileId:string)=>`imkan:office:conflict:${fileId}`;

export function cacheOfficeSnapshot(fileId:string,kind:OfflineSnapshot['kind'],revision:number,document:any){
  try {
    const snapshot = {fileId,kind,revision,document:officeClone(document),updatedAt:new Date().toISOString()};
    scheduleOfficeIdle(() => { try { localStorage.setItem(snapshotKey(fileId),JSON.stringify(snapshot)); } catch {} });
  } catch {}
}
export function readOfficeSnapshot(fileId:string):OfflineSnapshot|null{try{const x=JSON.parse(localStorage.getItem(snapshotKey(fileId))||'null');return x?.fileId===fileId?x:null}catch{return null}}
export function clearOfficeSnapshot(fileId:string){try{localStorage.removeItem(snapshotKey(fileId))}catch{}}
export function saveOfflineConflict(c:OfflineConflict){try{localStorage.setItem(conflictKey(c.fileId),JSON.stringify(c))}catch{}}
export function readOfflineConflict(fileId:string):OfflineConflict|null{try{return JSON.parse(localStorage.getItem(conflictKey(fileId))||'null')}catch{return null}}
export function clearOfflineConflict(fileId:string){try{localStorage.removeItem(conflictKey(fileId))}catch{}}

type RebaseMode = 'safe' | 'adopt';

function sameDocument(local: unknown, remote: unknown) {
  return local != null && remote != null && officeEqual(local, remote);
}

function splitQueuedOperation<T extends { opId: string; baseRevision: number; patches: OfficeOperationPatch[] }>(op: T, remotePatches: OfficeOperationPatch[], remoteDocument: unknown, revision: number, mode: RebaseMode): Array<T & { held?: boolean }> {
  const planned = planOfficeRebase(op.patches, remotePatches, remoteDocument, mode);
  const next: Array<T & { held?: boolean }> = [];
  if (planned.safe.length) next.push({ ...op, baseRevision: revision, patches: planned.safe, held: false });
  if (planned.pending.length) next.push({ ...op, opId: op.opId.endsWith(':held') ? op.opId : `${op.opId}:held`, baseRevision: revision, patches: planned.pending, held: true });
  return next;
}

export async function prepareOfflineConflict(fileId:string,kind:OfflineSnapshot['kind'],reason:string){
  const queued=readOfficeQueue(fileId);
  const local=applyQueuedOperations(fileId,readOfficeSnapshot(fileId)?.document ?? null);
  try{
    const remote=await openOfficeDocument(fileId);
    const remoteDocument=remote.content;
    if (sameDocument(local, remoteDocument)) { discardOfflineQueue(fileId); return null; }
    saveOfflineConflict({fileId,kind,local,remote:remoteDocument,remoteRevision:remote.revision,detectedAt:new Date().toISOString(),reason});
    return readOfflineConflict(fileId);
  }catch{
    saveOfflineConflict({fileId,kind,local,remote:null,remoteRevision:readOfficeSnapshot(fileId)?.revision||0,detectedAt:new Date().toISOString(),reason});
    return readOfflineConflict(fileId);
  }
}

export async function rebaseOfflineQueue(fileId:string, mode: RebaseMode = 'safe'){
  const conflict=readOfflineConflict(fileId); if(!conflict?.remote)return {ok:false,reason:'REMOTE_UNAVAILABLE',pendingCount:0} as const;
  if (sameDocument(conflict.local, conflict.remote)) { discardOfflineQueue(fileId); return {ok:true,document:conflict.remote,revision:conflict.remoteRevision,queueCount:0,pendingCount:0} as const; }
  const queue=readOfficeQueue(fileId); if(!queue.length){ clearOfflineConflict(fileId); return {ok:true,document:conflict.remote,revision:conflict.remoteRevision,queueCount:0,pendingCount:0} as const; }
  const base=Math.min(...queue.map(x=>x.baseRevision));
  const newer=await getOfficeOperations(fileId,base);
  const remotePatches=newer.flatMap(op=>Array.isArray(op.payload?.patches)?op.payload.patches as OfficeOperationPatch[]:[]);
  const rebased=queue.flatMap(op=>splitQueuedOperation(op, remotePatches, conflict.remote, conflict.remoteRevision, mode));
  const pendingCount=rebased.filter(op=>op.held).length;
  if (rebased.length) localStorage.setItem(`imkan:office:offline:${fileId}`,JSON.stringify(rebased));
  else localStorage.removeItem(`imkan:office:offline:${fileId}`);
  let merged=conflict.remote;
  for (const op of rebased) if (!op.held) merged=applyOfficePatchDocument(merged, op.patches);
  cacheOfficeSnapshot(fileId,conflict.kind,conflict.remoteRevision,merged);
  if (!pendingCount) clearOfflineConflict(fileId);
  return {ok:true,document:merged,revision:conflict.remoteRevision,queueCount:rebased.filter(op=>!op.held).length,pendingCount} as const;
}

export function discardOfflineQueue(fileId:string){
  try{localStorage.removeItem(`imkan:office:offline:${fileId}`)}catch{}
  clearOfflineConflict(fileId);
}

export { diffOfficeDocuments } from './offline-logic';

export function queueDocumentChange(fileId:string,kind:OfficeQueuedOperation['kind'],baseRevision:number,previous:any,next:any){
  const patches=diffOfficeDocuments(previous,next);
  if(!patches.length)return null;
  const op=createOfficeOperation(fileId,baseRevision,patches,kind);
  queueOfficeOperation(op);
  return op;
}

export function applyQueuedOperations<T>(fileId:string,document:T):T{
  let next=officeClone(document);
  for(const op of readOfficeQueue(fileId)) next=applyOfficePatchDocument(next,op.patches);
  return next;
}

export function offlineQueueCount(fileId:string){return readOfficeQueue(fileId).length}

export async function syncOfficeOffline(fileId:string,sessionId:string|undefined,onRevision?:(r:number)=>void,onConflict?:(e:any)=>void){
  await flushOfficeQueue(fileId,sessionId,onRevision,e=>{saveOfflineConflict({fileId,kind:'SHEET',local:readOfficeSnapshot(fileId)?.document,remote:null,remoteRevision:readOfficeSnapshot(fileId)?.revision||0,detectedAt:new Date().toISOString(),reason:e?.message||'SYNC_CONFLICT'});onConflict?.(e)})
}

export function installOfflineSync(fileId:string,sessionId:()=>string|undefined,callbacks:{onOnline?:()=>void;onOffline?:()=>void;onRevision?:(r:number)=>void;onConflict?:(e:any)=>void}){
  if(typeof window==='undefined')return()=>{};
  const online=()=>{callbacks.onOnline?.();void syncOfficeOffline(fileId,sessionId(),callbacks.onRevision,callbacks.onConflict)};
  const offline=()=>callbacks.onOffline?.();
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline)};
}

export async function prepareWriterConflict(fileId:string,reason:string){
  const mod=await import('./writer/collaboration');
  const queue=mod.readWriterQueue(fileId);
  const snap=readOfficeSnapshot(fileId);
  const local=queue.reduce((d:any,op:any)=>mod.applyQueuedWriterOperation(d,op),snap?.document ?? null);
  try{
    const remote=await openOfficeDocument(fileId);
    if (sameDocument(local, remote.content)) { discardWriterQueue(fileId); return null; }
    saveOfflineConflict({fileId,kind:'WRITER',local,remote:remote.content,remoteRevision:remote.revision,detectedAt:new Date().toISOString(),reason});
  }catch{
    saveOfflineConflict({fileId,kind:'WRITER',local,remote:null,remoteRevision:snap?.revision||0,detectedAt:new Date().toISOString(),reason});
  }
  return readOfflineConflict(fileId);
}

export async function rebaseWriterQueue(fileId:string, mode: RebaseMode = 'safe'){
  const conflict=readOfflineConflict(fileId); if(!conflict?.remote)return {ok:false,reason:'REMOTE_UNAVAILABLE',pendingCount:0} as const;
  if (sameDocument(conflict.local, conflict.remote)) { discardWriterQueue(fileId); return {ok:true,document:conflict.remote,revision:conflict.remoteRevision,queueCount:0,pendingCount:0} as const; }
  const mod=await import('./writer/collaboration');
  const queue=mod.readWriterQueue(fileId); if(!queue.length){clearOfflineConflict(fileId);return {ok:true,document:conflict.remote,revision:conflict.remoteRevision,queueCount:0,pendingCount:0} as const;}
  const base=Math.min(...queue.map((x:any)=>x.baseRevision));
  const newer=await getOfficeOperations(fileId,base);
  const remotePatches=newer.flatMap(op=>Array.isArray(op.payload?.patches)?op.payload.patches as OfficeOperationPatch[]:[]);
  const rebased=queue.flatMap((op:any)=>splitQueuedOperation(op, remotePatches, conflict.remote, conflict.remoteRevision, mode));
  const pendingCount=rebased.filter((op:any)=>op.held).length;
  if (rebased.length) localStorage.setItem(`imkan:writer:offline:${fileId}`,JSON.stringify(rebased));
  else localStorage.removeItem(`imkan:writer:offline:${fileId}`);
  let merged=conflict.remote; for(const op of rebased) if(!op.held) merged=mod.applyQueuedWriterOperation(merged,op);
  cacheOfficeSnapshot(fileId,'WRITER',conflict.remoteRevision,merged);
  if (!pendingCount) clearOfflineConflict(fileId);
  return {ok:true,document:merged,revision:conflict.remoteRevision,queueCount:rebased.filter((op:any)=>!op.held).length,pendingCount} as const;
}

export function discardWriterQueue(fileId:string){try{localStorage.removeItem(`imkan:writer:offline:${fileId}`)}catch{} clearOfflineConflict(fileId);}
