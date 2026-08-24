import { apiRequest } from "./client";
import type { ResourceType } from "./types";

export type RecentRecord = { id: string; resourceType: ResourceType; resourceId: string; name: string; action: string; accessedAt: string };
export function listRecent(): Promise<RecentRecord[]> { return apiRequest<RecentRecord[]>("/workspace/recent"); }
