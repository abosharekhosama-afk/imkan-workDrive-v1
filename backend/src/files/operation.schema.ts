export type MoveCopyInput = { destinationFolderId: string | null; templateId?: string; customFields?: Record<string, unknown> };
export type BulkFileOperationInput = { ids: string[]; destinationFolderId?: string | null };

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request body');
  return value as Record<string, unknown>;
}

export function parseMoveCopy(value: unknown): MoveCopyInput {
  const body = assertObject(value);
  const destinationFolderId = body.destinationFolderId;
  if (destinationFolderId !== null && typeof destinationFolderId !== 'string') throw new Error('destinationFolderId must be a string or null');
  const templateId = body.templateId;
  if (templateId !== undefined && typeof templateId !== 'string') throw new Error('templateId must be a string');
  const customFields = body.customFields;
  if (customFields !== undefined && (!customFields || typeof customFields !== 'object' || Array.isArray(customFields))) throw new Error('customFields must be an object');
  return { destinationFolderId: destinationFolderId ?? null, templateId: templateId as string | undefined, customFields: customFields as Record<string, unknown> | undefined };
}

export function parseBulkFileOperation(value: unknown): BulkFileOperationInput {
  const body = assertObject(value);
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100) throw new Error('ids must contain 1 to 100 file ids');
  const ids = body.ids.filter((id): id is string => typeof id === 'string');
  if (ids.length !== body.ids.length) throw new Error('ids must contain strings');
  const destinationFolderId = body.destinationFolderId;
  if (destinationFolderId !== undefined && destinationFolderId !== null && typeof destinationFolderId !== 'string') throw new Error('destinationFolderId must be a string or null');
  return { ids, destinationFolderId: destinationFolderId ?? null };
}
