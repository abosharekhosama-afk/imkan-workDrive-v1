export const TENANT_SCOPED_MODELS = new Set([
  'User',
  'TeamFolder',
  'TeamFolderMember',
  'Folder',
  'File',
  'FileVersion',
  'StorageObject',
  'FileShare',
  'FileShareRecipient',
  'TrashEntry',
  'FileActivity',
  'Tag',
  'AuditLog',
]);

export type QueryArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
};

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'upsert']);

export function applyOrgScope(
  model: string,
  args: QueryArgs | undefined,
  orgId: string,
): QueryArgs {
  return applyOrgScopeForOperation(model, 'findMany', args, orgId);
}

export function applyOrgScopeForOperation(
  model: string,
  operation: string,
  args: QueryArgs | undefined,
  orgId: string,
): QueryArgs {
  const next: QueryArgs = { ...(args ?? {}) };
  if (!TENANT_SCOPED_MODELS.has(model)) {
    return next;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    const tenantWhere = { orgId };
    next.where = next.where ? { AND: [next.where, tenantWhere] } : tenantWhere;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    if (operation === 'createMany' && Array.isArray(next.data)) {
      next.data = next.data.map((row) => ({ ...row, orgId }));
    } else if (next.data && !Array.isArray(next.data)) {
      if (operation === 'upsert') {
        next.data = { ...next.data, orgId };
      } else {
        next.data = { ...next.data, orgId };
      }
    }
  }

  return next;
}
