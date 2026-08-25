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
};

export function applyOrgScope<T extends QueryArgs>(
  model: string,
  args: T,
  orgId: string,
): T {
  if (!orgId) {
    throw new Error('Tenant orgId is required for scoped queries');
  }
  if (!TENANT_SCOPED_MODELS.has(model)) {
    return args;
  }
  const scopedWhere = args.where ? { AND: [args.where, { orgId }] } : { orgId };
  return { ...args, where: scopedWhere };
}
