import { apiRequest, getAccessToken, getApiBaseUrl } from './client';

export type OfficeType = 'WRITER' | 'SHEET' | 'SHOW';

export type OfficeDocument = {
  id: string; fileId: string; type: OfficeType; nativeFormat: string; content: any; revision: number; updatedAt: string; sourceTemplateId?: string | null; sourceTemplateVersionId?: string | null;
};

export function getOfficeCapabilities() { return apiRequest('/office/capabilities'); }
export function createOfficeDocument(input: { name: string; type: OfficeType; folderId?: string | null }) { return apiRequest<OfficeDocument>('/office/documents', { method: 'POST', body: JSON.stringify(input) }); }
export function openOfficeDocument(fileId: string) { return apiRequest<OfficeDocument>(`/office/files/${fileId}`); }
export type OfficeWorkDriveContext = {
  file: { id: string; name: string; originalName: string; extension?: string | null; mimeType?: string | null; size: number; updatedAt: string; ownerId: string };
  location: { id: string; name: string; parentId?: string | null; teamFolderId?: string | null } | null;
  permissions: { canRead: boolean; canWrite: boolean };
  sharing: { activeShareCount: number };
  office: { type: OfficeType; nativeFormat: string; revision: number; updatedAt: string } | null;
  currentVersion: OfficeVersionSummary | null;
  versions: OfficeVersionSummary[];
};
export type OfficeVersionSummary = { id: string; versionNumber: number; status: string; size: number; mimeType: string; sha256Hash: string; createdAt: string; uploadedBy: { id: string; name?: string | null; email: string; avatarUrl?: string | null } };
export function getOfficeWorkDriveContext(fileId: string) { return apiRequest<OfficeWorkDriveContext>(`/office/files/${fileId}/workdrive-context`); }
export type OfficeApprovalStatus = { fileId: string; officeType: OfficeType; current: any | null; history: any[] };
export function requestOfficeApproval(fileId: string, input: { workflowId: string; participantRules?: unknown; fieldValues?: Record<string, unknown>; comment?: string }) { return apiRequest(`/office/files/${fileId}/approval`, { method: 'POST', body: JSON.stringify(input) }); }
export function getOfficeApprovalStatus(fileId: string) { return apiRequest<OfficeApprovalStatus>(`/office/files/${fileId}/approval`); }


export type OfficeSecurityPolicy = {
  id: string; orgId: string; forceReadOnly: boolean; disableExport: boolean; disableCopy: boolean; disableOffline: boolean; requireWatermark: boolean; watermarkText?: string | null; createdAt: string; updatedAt: string; organizationPolicy?: OfficeSecurityPolicy;
};
export type OfficeAdminCenter = {
  generatedAt: string;
  documents: { total: number; byType: Record<string, number> };
  collaboration: { activeSessions: number; activePresence: number; operations24h: number };
  templates: { active: number; variables: number };
  backgroundJobs: Record<string, number>;
  automationRuns: Record<string, number>;
  policies: { security: { forceReadOnly: boolean; disableExport: boolean; disableCopy: boolean; disableOffline: boolean; requireWatermark: boolean; watermarkText?: string | null } | null; audit: { retentionDays: number; immutableChain: boolean; exportEnabled: boolean } | null };
  recentDocuments: Array<{ id: string; fileId: string; name: string; type: OfficeType; revision: number; updatedAt: string }>;
};
export function getOfficeAdminCenter() { return apiRequest<OfficeAdminCenter>('/office/admin-center'); }

export function getOfficeSecurityPolicy() { return apiRequest<OfficeSecurityPolicy>('/office/security-policy'); }
export function updateOfficeSecurityPolicy(input: Partial<Omit<OfficeSecurityPolicy, 'id'|'orgId'|'createdAt'|'updatedAt'>>) { return apiRequest<OfficeSecurityPolicy>('/office/security-policy', { method: 'PATCH', body: JSON.stringify(input) }); }

export type OfficeDocumentPolicy = {
  id: string; documentId: string; allowExport: boolean; allowCopy: boolean; allowOffline: boolean;
  readOnly: boolean; watermarkEnabled: boolean; watermarkText?: string | null; createdAt: string; updatedAt: string;
};
export function getOfficePolicy(fileId: string) { return apiRequest<OfficeDocumentPolicy>(`/office/files/${fileId}/policy`); }
export function updateOfficePolicy(fileId: string, input: Partial<Omit<OfficeDocumentPolicy, 'id'|'documentId'|'createdAt'|'updatedAt'>>) {
  return apiRequest<OfficeDocumentPolicy>(`/office/files/${fileId}/policy`, { method: 'PATCH', body: JSON.stringify(input) });
}

export type OfficeAuditEvent = { id: string; action: string; createdAt: string; actor: { id: string; name?: string|null; email: string; avatarUrl?: string|null } | null; metadata?: any };
export type OfficeAuditPolicy = { id: string; orgId: string; retentionDays: number; immutableChain: boolean; exportEnabled: boolean; createdAt: string; updatedAt: string };
export type OfficeComplianceEvent = OfficeAuditEvent & { resourceType: string; resourceId: string; previousHash?: string | null; integrityHash?: string | null };
export function getOfficeAuditPolicy() { return apiRequest<OfficeAuditPolicy>('/office/compliance/audit-policy'); }
export function updateOfficeAuditPolicy(input: Partial<Pick<OfficeAuditPolicy, 'retentionDays'|'immutableChain'|'exportEnabled'>>) { return apiRequest<OfficeAuditPolicy>('/office/compliance/audit-policy', { method: 'PATCH', body: JSON.stringify(input) }); }
export function getOfficeComplianceAudit(input?: { limit?: number; action?: string; resourceType?: string; actorId?: string; since?: string; until?: string }) {
 const q = new URLSearchParams(); Object.entries(input ?? {}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='') q.set(k,String(v)); });
 return apiRequest<{policy: Pick<OfficeAuditPolicy,'retentionDays'|'immutableChain'|'exportEnabled'>; events: OfficeComplianceEvent[]; count: number}>(`/office/compliance/audit${q.toString()?`?${q.toString()}`:''}`);
}
export function exportOfficeComplianceAudit(input?: { resourceType?: string; since?: string; until?: string }) {
 const q = new URLSearchParams(); Object.entries(input ?? {}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='') q.set(k,String(v)); });
 return apiRequest<{generatedAt:string;policy:Pick<OfficeAuditPolicy,'retentionDays'|'immutableChain'>;events:OfficeComplianceEvent[]}>(`/office/compliance/audit/export${q.toString()?`?${q.toString()}`:''}`);
}
export function verifyOfficeAuditIntegrity(input?: { resourceType?: string; resourceId?: string; limit?: number }) {
 const q = new URLSearchParams(); Object.entries(input ?? {}).forEach(([k,v])=>{ if(v!==undefined&&v!==null&&v!=='') q.set(k,String(v)); });
 return apiRequest<{valid:boolean;checked:number;invalid:number;legacyUnhashed:number}>(`/office/compliance/audit/verify${q.toString()?`?${q.toString()}`:''}`);
}

export function getOfficeAuditEvents(fileId: string, input?: { limit?: number; action?: string; since?: string; until?: string }) {
  const q = new URLSearchParams();
  if (input?.limit !== undefined) q.set('limit', String(input.limit));
  if (input?.action) q.set('action', input.action);
  if (input?.since) q.set('since', input.since);
  if (input?.until) q.set('until', input.until);
  return apiRequest<OfficeAuditEvent[]>(`/office/files/${fileId}/audit${q.toString() ? `?${q.toString()}` : ''}`);
}
export function saveOfficeDocument(fileId: string, content: any, expectedRevision?: number, sessionId?: string) { return apiRequest<OfficeDocument>(`/office/files/${fileId}`, { method: 'PATCH', body: JSON.stringify({ content, expectedRevision, sessionId }) }); }
export function openOfficeSession(fileId: string) { return apiRequest<{ sessionId: string; document: OfficeDocument }>(`/office/files/${fileId}/session`, { method: 'POST' }); }
export function touchOfficeSession(sessionId: string) { return apiRequest(`/office/sessions/${sessionId}/touch`, { method: 'PATCH' }); }
export function closeOfficeSession(sessionId: string) { return apiRequest(`/office/sessions/${sessionId}`, { method: 'DELETE' }); }

export type OfficePresence = {
  id: string; sessionId: string; userId: string; status: 'ACTIVE'|'IDLE'; lastSeenAt: string;
  cursor?: any; selection?: any; user: { id: string; name?: string|null; email: string; avatarUrl?: string|null };
};

export type OfficeOperation = {
  id: string; kind: string; baseRevision: number; revision: number; createdAt: string;
  payload: any; user: { id: string; name?: string|null; email: string; avatarUrl?: string|null };
};

export function getOfficePresence(fileId: string) { return apiRequest<OfficePresence[]>(`/office/files/${fileId}/presence`); }
export function heartbeatOfficePresence(sessionId: string, body: { cursor?: any; selection?: any; status?: 'ACTIVE'|'IDLE' }) { return apiRequest<OfficePresence>(`/office/sessions/${sessionId}/presence`, { method: 'POST', body: JSON.stringify(body) }); }
export function getOfficeOperations(fileId: string, sinceRevision?: number) { return apiRequest<OfficeOperation[]>(`/office/files/${fileId}/operations${sinceRevision !== undefined ? `?sinceRevision=${sinceRevision}` : ''}`); }

export type OfficeRealtimeEvent = {
  fileId: string;
  type: 'document-saved' | 'presence-changed';
  revision?: number;
  operationId?: string;
  userId?: string;
  sessionId?: string;
  status?: string;
  at: string;
};

export async function streamOfficeEvents(fileId: string, onEvent: (event: OfficeRealtimeEvent) => void, signal?: AbortSignal) {
  const token = await getAccessToken();
  if (!token) throw new Error('UNAUTHENTICATED');
  const response = await fetch(`${getApiBaseUrl()}/office/files/${fileId}/events`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Office realtime stream failed (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { onEvent(JSON.parse(data) as OfficeRealtimeEvent); } catch {}
    }
  }
  reader.releaseLock();
}

export type OfficeOperationPatch = { op: 'set' | 'delete'; path: string; value?: any };
export function submitOfficeOperation(fileId: string, input: { opId: string; baseRevision: number; patches: OfficeOperationPatch[]; sessionId?: string; clientId?: string; sequence?: number }) {
  return apiRequest<{ document: OfficeDocument; operationId: string; opId: string; revision: number }>(`/office/files/${fileId}/operations`, { method: 'POST', body: JSON.stringify(input) });
}
export function submitWriterOperation(fileId: string, input: { opId: string; baseRevision: number; patches: any[]; sessionId?: string; clientId?: string; sequence?: number }) {
  return submitOfficeOperation(fileId, input);
}
