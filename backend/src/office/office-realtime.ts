import { Subject, filter } from 'rxjs';

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

const events = new Subject<OfficeRealtimeEvent>();

export function publishOfficeRealtimeEvent(event: Omit<OfficeRealtimeEvent, 'at'>) {
  events.next({ ...event, at: new Date().toISOString() });
}

export function streamOfficeRealtimeEvents(fileId: string) {
  return events.asObservable().pipe(filter(event => event.fileId === fileId));
}
