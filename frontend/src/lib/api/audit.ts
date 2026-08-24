import { apiRequest } from "./client";
import { auditPath } from "./audit-path";

export type AuditRecord = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  createdAt: string;
};

export function listAudit(): Promise<AuditRecord[]> {
  return apiRequest<AuditRecord[]>(auditPath());
}
