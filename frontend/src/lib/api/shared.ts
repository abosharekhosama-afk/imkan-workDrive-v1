import { apiRequest } from "./client";
import { emitGlobalToast } from "../global-toast";

export type SharedRecipient = {
  userId: string;
  permission?: string;
  user?: { id: string; name: string | null; email: string };
};

export type SharedItem = {
  id: string;
  resourceType: "FILE" | "FOLDER";
  resourceId: string;
  permission?: string;
  expiresAt: string | null;
  name?: string | null;
  owner?: { id: string; name: string | null; email: string } | null;
  status?: string;
  /** True when the share grants download rights to the recipient. */
  canDownload?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  mimeType?: string | null;
  /** Active-file byte size (omitted on folder rows). */
  size?: number | null;
  recipients?: SharedRecipient[];
  linkUrl?: string;
};

export function listSharedWithMe(): Promise<SharedItem[]> {
  return apiRequest<SharedItem[]>("/shares/with-me");
}

export function listSharedByMe(): Promise<SharedItem[]> {
  return apiRequest<SharedItem[]>("/shares/by-me");
}


export async function updateShareRecipientPermission(shareId: string, userId: string, permission: string): Promise<{ shareId: string; userId: string; permission: string }> { const result=await apiRequest(`/shares/${encodeURIComponent(shareId)}/recipients/${encodeURIComponent(userId)}`, { method:"PATCH", body:JSON.stringify({permission}) }); emitGlobalToast({message:"Permission updated",messageAr:"تم تحديث الصلاحية"}); return result; }

export async function removeShareRecipient(shareId: string, userId: string): Promise<{ shareId: string; userId: string; removed: boolean }> { const result=await apiRequest(`/shares/${encodeURIComponent(shareId)}/recipients/${encodeURIComponent(userId)}`, { method:"DELETE" }); emitGlobalToast({message:"Access removed",messageAr:"تمت إزالة الوصول"}); return result; }

export async function revokeShare(shareId: string): Promise<{ id: string; revoked: boolean }> { const result=await apiRequest(`/shares/${encodeURIComponent(shareId)}`, { method:"DELETE" }); emitGlobalToast({message:"Sharing revoked",messageAr:"تم إلغاء المشاركة"}); return result; }
