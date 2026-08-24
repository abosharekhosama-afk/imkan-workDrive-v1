export type MoveCopyInput = { destinationFolderId: string | null };
export type BulkFileOperationInput = { ids: string[]; destinationFolderId?: string | null };

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request body');
  return value as Record<string, unknown>;
}

export function parseMoveCopy(value: unknown): MoveCopyInput {
  const body = assertObject(value);
  const destinationFolderId = body.destinationFolderId;
  if (destinationFolderId !== null && typeof destinationFolderId !== 'string') throw new Error('destinationFolderId must be a string or null');
  return { destinationFolderId: destinationFolderId ?? null };
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
