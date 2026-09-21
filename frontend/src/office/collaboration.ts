'use client';
import { useEffect, useState } from 'react';
import { getOfficePresence, heartbeatOfficePresence, type OfficePresence } from '@/lib/api/office';

export function useOfficePresence(fileId: string, sessionId: string) {
  const [presence, setPresence] = useState<OfficePresence[]>([]);
  useEffect(() => {
    if (!fileId || !sessionId) return;
    let cancelled = false;
    const refresh = async () => { try { const next = await getOfficePresence(fileId); if (!cancelled) setPresence(next); } catch {} };
    const beat = async () => { try { await heartbeatOfficePresence(sessionId, { status: document.hidden ? 'IDLE' : 'ACTIVE' }); } catch {} };
    void refresh(); void beat();
    const refreshTimer = setInterval(() => void refresh(), 5000);
    const beatTimer = setInterval(() => void beat(), 15000);
    const onVisibility = () => void beat();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; clearInterval(refreshTimer); clearInterval(beatTimer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [fileId, sessionId]);
  return presence;
}

import { streamOfficeEvents, type OfficeRealtimeEvent } from '@/lib/api/office';

export function useOfficeRealtime(fileId: string, sessionId: string, userId: string | undefined, onRemoteSave: (event: OfficeRealtimeEvent) => void) {
  useEffect(() => {
    if (!fileId || !sessionId) return;
    const controller = new AbortController();
    let stopped = false;
    const connect = async () => {
      try {
        await streamOfficeEvents(fileId, (event) => {
          if (event.type === 'document-saved' && event.sessionId !== sessionId && event.userId !== userId) onRemoteSave(event);
        }, controller.signal);
      } catch {}
      if (!stopped && !controller.signal.aborted) {
        window.setTimeout(() => { if (!stopped) void connect(); }, 1000);
      }
    };
    void connect();
    return () => { stopped = true; controller.abort(); };
  }, [fileId, sessionId, userId, onRemoteSave]);
}

import { submitWriterOperation } from '@/lib/api/office';
import { createWriterOperation, diffWriterDocuments, queueWriterOperation, readWriterQueue, removeWriterOperation, type WriterOperation } from './writer/collaboration';
import type { WriterDocument } from './writer/model';

export function enqueueWriterChange(fileId: string, baseRevision: number, previous: WriterDocument, next: WriterDocument, sessionId?: string) {
  const patches = diffWriterDocuments(previous, next);
  if (!patches.length) return null;
  const operation = createWriterOperation(fileId, baseRevision, patches);
  queueWriterOperation(operation);
  void flushWriterQueue(fileId, sessionId);
  return operation;
}

export async function flushWriterQueue(fileId: string, sessionId?: string, onRevision?: (revision: number) => void, onConflict?: (error: any) => void) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const queue = readWriterQueue(fileId);
  for (const operation of queue) {
    try {
      const result = await submitWriterOperation(fileId, { opId: operation.opId, baseRevision: operation.baseRevision, patches: operation.patches, sessionId });
      removeWriterOperation(fileId, operation.opId);
      const remaining = readWriterQueue(fileId).map(item => ({ ...item, baseRevision: result.revision }));
      if (remaining.length) localStorage.setItem(`imkan:writer:offline:${fileId}`, JSON.stringify(remaining));
      onRevision?.(result.revision);
    } catch (error: any) {
      onConflict?.(error);
      break;
    }
  }
}

export function writerOfflineQueueCount(fileId: string) { return readWriterQueue(fileId).length; }
