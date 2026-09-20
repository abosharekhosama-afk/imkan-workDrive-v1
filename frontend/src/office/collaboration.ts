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
