import { apiRequest } from "./client";
import type { ResourceType } from "./types";

export type RecentRecord = {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  name: string;
  action: string;
  accessedAt: string;
  mimeType?: string | null;
  size?: number | null;
  updatedAt?: string | null;
  location?: string | null;
  folderId?: string | null;
};

export function listRecent(): Promise<RecentRecord[]> {
  return apiRequest<RecentRecord[]>("/workspace/recent");
}
