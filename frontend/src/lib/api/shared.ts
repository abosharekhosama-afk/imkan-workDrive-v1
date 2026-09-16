import { apiRequest } from "./client";

export type SharedRecipient = {
  userId: string;
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
};

export function listSharedWithMe(): Promise<SharedItem[]> {
  return apiRequest<SharedItem[]>("/shares/with-me");
}

export function listSharedByMe(): Promise<SharedItem[]> {
  return apiRequest<SharedItem[]>("/shares/by-me");
}
