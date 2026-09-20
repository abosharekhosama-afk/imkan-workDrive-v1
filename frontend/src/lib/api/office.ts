import { apiRequest, getAccessToken, getApiBaseUrl } from './client';

export type OfficeType = 'WRITER' | 'SHEET' | 'SHOW';

export type OfficeDocument = {
  id: string; fileId: string; type: OfficeType; nativeFormat: string; content: any; revision: number; updatedAt: string; sourceTemplateId?: string | null; sourceTemplateVersionId?: string | null;
};

export function getOfficeCapabilities() { return apiRequest('/office/capabilities'); }
export function createOfficeDocument(input: { name: string; type: OfficeType; folderId?: string | null }) { return apiRequest<OfficeDocument>('/office/documents', { method: 'POST', body: JSON.stringify(input) }); }
export function openOfficeDocument(fileId: string) { return apiRequest<OfficeDocument>(`/office/files/${fileId}`); }
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
