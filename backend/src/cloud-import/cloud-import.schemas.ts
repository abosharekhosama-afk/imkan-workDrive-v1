import { BadRequestException } from '@nestjs/common';
const PROVIDERS = ['google', 'dropbox', 'onedrive'] as const;
export type CloudProvider = (typeof PROVIDERS)[number];
export function parseProvider(value: unknown): CloudProvider { if (typeof value !== 'string' || !(PROVIDERS as readonly string[]).includes(value)) throw new BadRequestException('Unsupported cloud provider'); return value as CloudProvider; }
export function parseCreateJobs(body: unknown): { folderId: string | null; connectionId: string | null; files: Array<{ id: string; name?: string }> } {
  if (!body || typeof body !== 'object') throw new BadRequestException('Invalid import request'); const record = body as Record<string, unknown>;
  const folderIdRaw = record.folderId === null || record.folderId === undefined ? null : record.folderId;
  const folderId: string | null = folderIdRaw === null ? null : String(folderIdRaw);
  const connectionIdRaw = record.connectionId === null || record.connectionId === undefined || record.connectionId === '' ? null : record.connectionId;
  if (connectionIdRaw !== null && (typeof connectionIdRaw !== 'string' || connectionIdRaw.length > 120)) throw new BadRequestException('Invalid connectionId');
  const connectionId: string | null = connectionIdRaw === null ? null : String(connectionIdRaw);
  if (folderId !== null && (typeof folderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(folderId))) throw new BadRequestException('Invalid folderId');
  if (!Array.isArray(record.files) || record.files.length < 1 || record.files.length > 50) throw new BadRequestException('Select between 1 and 50 cloud files');
  const files = record.files.map((item) => { if (!item || typeof item !== 'object') throw new BadRequestException('Invalid cloud file'); const value = item as Record<string, unknown>; if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 2048) throw new BadRequestException('Invalid cloud file id'); return { id: value.id, name: typeof value.name === 'string' ? value.name.slice(0, 255) : undefined }; });
  return { folderId, connectionId, files: [...new Map(files.map((file) => [file.id, file])).values()] };
}
