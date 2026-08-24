import { apiRequest } from "./client";
export type SharedItem = { id: string; resourceType: "FILE" | "FOLDER"; resourceId: string; permission: string; expiresAt: string | null; recipients?: { userId: string; permission: string }[] };
export function listSharedWithMe(): Promise<SharedItem[]> { return apiRequest<SharedItem[]>("/shares/with-me"); }
export function listSharedByMe(): Promise<SharedItem[]> { return apiRequest<SharedItem[]>("/shares/by-me"); }
