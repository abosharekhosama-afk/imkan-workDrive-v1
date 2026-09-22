import { apiRequest } from '@/lib/api/client';

export type FileCommentUser = { id: string; name?: string | null; email?: string | null };
export type FileComment = {
  id: string;
  fileId: string;
  userId: string;
  body: string;
  parentId?: string | null;
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: FileCommentUser;
  replies?: FileComment[];
};

export function listFileComments(fileId: string) {
  return apiRequest<FileComment[]>(`/files/${fileId}/comments`);
}

export function addFileComment(fileId: string, body: string, parentId?: string) {
  return apiRequest<FileComment>(`/files/${fileId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, ...(parentId ? { parentId } : {}) }),
  });
}

export function updateFileComment(fileId: string, commentId: string, body: string) {
  return apiRequest<FileComment>(`/files/${fileId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export function deleteFileComment(fileId: string, commentId: string) {
  return apiRequest<{ ok: boolean }>(`/files/${fileId}/comments/${commentId}`, { method: 'DELETE' });
}
