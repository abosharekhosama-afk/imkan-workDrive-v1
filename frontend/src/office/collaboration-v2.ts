import { submitOfficeOperation, openOfficeDocument, type OfficeOperationPatch } from '@/lib/api/office';
import { ApiError } from '@/lib/api/client';
import { diffOfficeDocuments } from './offline-logic';

export type OfficeQueuedOperation = { opId:string; fileId:string; baseRevision:number; patches:OfficeOperationPatch[]; createdAt:string; kind:'SHEET'|'SHOW'|'WRITER'; clientId:string; sequence:number; held?:boolean };
const key=(fileId:string)=>`imkan:office:offline:${fileId}`;
export function queueOfficeOperation(op:OfficeQueuedOperation){ const all=readOfficeQueue(op.fileId); all.push(op); localStorage.setItem(key(op.fileId),JSON.stringify(all.slice(-200))); }
export function readOfficeQueue(fileId:string):OfficeQueuedOperation[]{try{const v=JSON.parse(localStorage.getItem(key(fileId))||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
export function removeOfficeOperation(fileId:string,opId:string){const next=readOfficeQueue(fileId).filter(x=>x.opId!==opId); if(next.length)localStorage.setItem(key(fileId),JSON.stringify(next));else localStorage.removeItem(key(fileId));}
function replaceQueuedOperation(fileId:string,op:OfficeQueuedOperation){const next=readOfficeQueue(fileId).map(x=>x.opId===op.opId?op:x); localStorage.setItem(key(fileId),JSON.stringify(next));}

async function submitQueuedOperation(fileId:string,op:OfficeQueuedOperation,sessionId:string|undefined){
  return submitOfficeOperation(fileId,{opId:op.opId,baseRevision:op.baseRevision,patches:op.patches,sessionId,clientId:op.clientId,sequence:op.sequence});
}

function readSnapshotDocument(fileId:string){
  try{
    const snap=JSON.parse(localStorage.getItem(`imkan:office:snapshot:${fileId}`)||'null');
    return snap?.fileId===fileId?snap.document:null;
  }catch{return null}
}

export async function flushOfficeQueue(fileId:string,sessionId:string|undefined,onRevision?:(r:number)=>void,onConflict?:(e:unknown)=>void){
  if(typeof navigator!=='undefined'&&!navigator.onLine)return;
  for(const op of [...readOfficeQueue(fileId)]){
    if(op.held) continue;
    let current=op;
    let attempted=false;
    while(true){
      try{
        const r=await submitQueuedOperation(fileId,current,sessionId);
        removeOfficeOperation(fileId,current.opId);
        const rest=readOfficeQueue(fileId).map(x=>({...x,baseRevision:r.revision}));
        if(rest.length)localStorage.setItem(key(fileId),JSON.stringify(rest));
        onRevision?.(r.revision);
        break;
      }catch(e){
        const code=e instanceof ApiError?e.code:undefined;
        if(!attempted && (code==='OFFICE_OPERATION_REVISION'||code==='OFFICE_OPERATION_RETRY')){
          attempted=true;
          try{
            const remote=await openOfficeDocument(fileId);
            current={...current,baseRevision:remote.revision};
            replaceQueuedOperation(fileId,current);
            continue;
          }catch{
            onConflict?.(e);
            return;
          }
        }
        if(code==='OFFICE_OPERATION_EMPTY'){
          try{
            const snap=readSnapshotDocument(fileId);
            const remote=await openOfficeDocument(fileId);
            const patches=diffOfficeDocuments(remote.content,snap ?? remote.content);
            if(patches.length){
              current={...current,baseRevision:remote.revision,patches};
              replaceQueuedOperation(fileId,current);
              attempted=false;
              continue;
            }
          }catch{/* fall through */}
          removeOfficeOperation(fileId,current.opId);
          continue;
        }
        onConflict?.(e);
        break;
      }
    }
  }
}
const clientKey=(fileId:string)=>`imkan:office:client:${fileId}`;
function getClientId(fileId:string){let id=localStorage.getItem(clientKey(fileId));if(!id){id=crypto.randomUUID();localStorage.setItem(clientKey(fileId),id)}return id}
function nextSequence(fileId:string){const k=`${clientKey(fileId)}:seq`;const n=Number(localStorage.getItem(k)||'0')+1;localStorage.setItem(k,String(n));return n}
export function createOfficeOperation(fileId:string,baseRevision:number,patches:OfficeOperationPatch[],kind:'SHEET'|'SHOW'|'WRITER'):OfficeQueuedOperation{return{opId:crypto.randomUUID(),fileId,baseRevision,patches,kind,createdAt:new Date().toISOString(),clientId:getClientId(fileId),sequence:nextSequence(fileId)}}
export function applyOfficePatchDocument<T>(doc:T,patches:OfficeOperationPatch[]):T{const out=JSON.parse(JSON.stringify(doc));for(const p of patches){const parts=p.path.split('/').slice(1).map(decodeURIComponent);if(parts[0]==='sheetsById'){const sh=(out as any).sheets?.find((x:any)=>x.id===parts[1]);if(sh&&parts[2]==='cells'){sh.cells??={};const k=parts.slice(3).join('/');if(p.op==='delete')delete sh.cells[k];else sh.cells[k]=p.value}else if(sh&&p.op==='set'&&parts.length===2){const i=(out as any).sheets.indexOf(sh);(out as any).sheets[i]=p.value}continue}if(parts[0]==='slidesById'){const sl=(out as any).slides?.find((x:any)=>x.id===parts[1]);if(sl&&parts[2]==='elements'){const i=sl.elements.findIndex((x:any)=>x.id===parts[3]);if(i>=0&&p.op==='set')sl.elements[i]=p.value;else if(i>=0&&p.op==='delete')sl.elements.splice(i,1)}else if(sl&&p.op==='set'&&parts.length===2){const i=(out as any).slides.indexOf(sl);(out as any).slides[i]=p.value}continue}let t:any=out;for(let i=0;i<parts.length-1;i++){t[parts[i]]??={};t=t[parts[i]]}const k=parts.at(-1)!;if(p.op==='delete')delete t[k];else t[k]=p.value}return out}
export const cellPatch=(sheetId:string,cellKey:string,value:any):OfficeOperationPatch=>({op:'set',path:`/sheetsById/${encodeURIComponent(sheetId)}/cells/${encodeURIComponent(cellKey)}`,value});
export const sheetPatch=(sheetId:string,sheet:any):OfficeOperationPatch=>({op:'set',path:`/sheetsById/${encodeURIComponent(sheetId)}`,value:sheet});
export const slidePatch=(slideId:string,slide:any):OfficeOperationPatch=>({op:'set',path:`/slidesById/${encodeURIComponent(slideId)}`,value:slide});
export const slideElementPatch=(slideId:string,elementId:string,element:any):OfficeOperationPatch=>({op:'set',path:`/slidesById/${encodeURIComponent(slideId)}/elements/${encodeURIComponent(elementId)}`,value:element});
