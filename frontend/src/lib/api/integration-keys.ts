import { apiRequest } from './client';
import { emitGlobalToast } from '../global-toast';

export type IntegrationKeyScope = 'files:read' | 'files:write' | 'folders:read' | 'folders:write';

export type IntegrationKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: IntegrationKeyScope[];
  rootFolder: { id: string; name: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  status: 'active' | 'revoked' | 'expired';
};

export type CreateIntegrationKeyInput = {
  name: string;
  scopes: IntegrationKeyScope[];
  rootFolderId: string | null;
  expiresAt: string | null;
};

export const listIntegrationKeys = () => apiRequest<IntegrationKey[]>('/admin/integration-keys');

export async function createIntegrationKey(body: CreateIntegrationKeyInput) {
  const result = await apiRequest<{ key: IntegrationKey; secret: string }>('/admin/integration-keys', { method: 'POST', body: JSON.stringify(body) });
  emitGlobalToast({ message: 'Access key created', messageAr: 'تم إنشاء مفتاح الوصول' });
  return result;
}

export async function revokeIntegrationKey(id: string) {
  const result = await apiRequest<IntegrationKey>(`/admin/integration-keys/${id}/revoke`, { method: 'POST' });
  emitGlobalToast({ message: 'Access key revoked', messageAr: 'تم إلغاء مفتاح الوصول' });
  return result;
}
