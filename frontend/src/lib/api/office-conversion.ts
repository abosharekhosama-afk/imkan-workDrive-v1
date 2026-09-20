import { apiRequest } from './client';

export type OfficeExport = { filename: string; mimeType: string; dataBase64: string };
export type OfficeConversionReport = { sourceFormat:string; targetFormat:string; converterVersion:string; nativeSchemaVersion:number; diagnostics:{code:string;severity:'info'|'warning'|'loss';message:string;path?:string;category?:'preserved'|'converted'|'warning'|'unsupported'}[]; summary:{info:number;warning:number;loss:number;preserved:number;converted:number;unsupported:number}; roundTrip?:{performed:boolean;exportedBytes:number;reimportedType:'WRITER'|'SHEET'|'SHOW';sourceMetrics:Record<string,number>;roundTripMetrics:Record<string,number>;metricDiffs:Record<string,number>;structurallyStable:boolean} };
export async function importOfficeFile(file: File, folderId?: string | null) {
  const dataBase64 = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.readAsDataURL(file);});
  return apiRequest<{fileId:string;type:string;content:any;revision:number;importedFrom:string}>('/office/import',{method:'POST',body:JSON.stringify({filename:file.name,dataBase64,folderId})});
}
export function exportOfficeFile(fileId:string,format:'docx'|'xlsx'|'pptx'){return apiRequest<OfficeExport>(`/office/files/${fileId}/export`,{method:'POST',body:JSON.stringify({format})});}
export function downloadOfficeExport(result:OfficeExport){const bytes=Uint8Array.from(atob(result.dataBase64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:result.mimeType}));const a=document.createElement('a');a.href=url;a.download=result.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function getOfficeConversionDiagnostics(fileId:string, format:'docx'|'xlsx'|'pptx'){return apiRequest<OfficeConversionReport>(`/office/files/${fileId}/conversion-diagnostics?format=${format}`,{method:'GET'});}

export function runOfficeConversionRoundTrip(fileId:string, format:'docx'|'xlsx'|'pptx'){return apiRequest<OfficeConversionReport>(`/office/files/${fileId}/conversion-roundtrip`,{method:'POST',body:JSON.stringify({format})});}
