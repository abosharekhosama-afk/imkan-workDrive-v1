import { Injectable } from '@nestjs/common';
import { OfficeService } from './office.service';
import { streamOfficeRealtimeEvents } from './office-realtime';

/** Phase 28 real-time collaboration facade. Transport is intentionally isolated from editor logic. */
@Injectable()
export class OfficeCollaborationService {
  constructor(private readonly office: OfficeService) {}
  presence(user: any, fileId: string) { return this.office.listPresence(user, fileId); }
  heartbeat(user: any, sessionId: string, body: any) { return this.office.heartbeatPresence(user, sessionId, body); }
  operations(user: any, fileId: string, sinceRevision?: number) { return this.office.listOperations(user, fileId, sinceRevision); }
  stream(fileId: string) { return streamOfficeRealtimeEvents(fileId); }
}
