import { apiRequest } from './client.ts';
export type FileCollection = { id:string; name:string; description:string|null; type:string; status:string; folder:{id:string;name:string}; submissionsCount:number; filesCount:number; expiresAt:string|null; createdAt:string };
export function listCollections(){ return apiRequest<FileCollection[]>('/collections'); }
export function createCollection(input:{name:string;description?:string;folderId:string;type:'INTERNAL'|'EXTERNAL';expiresAt?:string|null;maxFiles?:number|null;collectName?:boolean;collectEmail?:boolean;separateFolderPerUser?:boolean}) { return apiRequest<FileCollection & {token:string;publicPath:string}>('/collections',{method:'POST',body:JSON.stringify(input)}); }
export function updateCollection(id:string,input:Partial<{name:string;description:string;status:'ACTIVE'|'DISABLED'|'COMPLETED';expiresAt:string|null}>){return apiRequest(`/collections/${id}`,{method:'PATCH',body:JSON.stringify(input)});}
export function deleteCollection(id:string){return apiRequest(`/collections/${id}`,{method:'DELETE'});}

export type CollectionSubmission = {id:string;submitterName:string|null;submitterEmail:string|null;fileCount:number;status:string;submittedAt:string;file:{id:string;name:string;mimeType:string|null;size:string|number;folderId:string}|null};
export function listCollectionSubmissions(id:string){return apiRequest<CollectionSubmission[]>(`/collections/${id}/submissions`);}
