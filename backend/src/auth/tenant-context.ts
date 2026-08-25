import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantStore = {
  orgId: string;
  userId: string;
};

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return tenantStorage.run(store, fn);
}

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
}

export function requireTenantOrgId(): string {
  const orgId = tenantStorage.getStore()?.orgId;
  if (!orgId) {
    throw new Error('Tenant context is missing');
  }
  return orgId;
}
