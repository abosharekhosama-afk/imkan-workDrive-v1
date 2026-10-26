import { BadRequestException } from '@nestjs/common';

export const ENSURE_PATH_MAX_DEPTH = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Characters rejected by WorkDrive folder names plus ASCII control characters.
const FORBIDDEN_RE = /[\\:*?"<>|\u0000-\u001f]/;

export type EnsurePathInput = { segments: string[]; parentId?: string };

export function parseEnsurePath(body: unknown): EnsurePathInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid payload');
  const r = body as Record<string, unknown>;
  let segments: unknown[];
  if (typeof r.path === 'string') segments = r.path.split('/');
  else if (Array.isArray(r.segments)) segments = r.segments;
  else throw new BadRequestException('path is required');
  const cleaned = segments.map((s) => (typeof s === 'string' ? s.trim() : null)).filter((s) => s !== '');
  if (cleaned.length === 0) throw new BadRequestException('path must contain at least one folder name');
  if (cleaned.length > ENSURE_PATH_MAX_DEPTH) throw new BadRequestException(`path may contain at most ${ENSURE_PATH_MAX_DEPTH} folders`);
  for (const s of cleaned) {
    if (s === null || s.length > 191 || s === '.' || s === '..' || FORBIDDEN_RE.test(s)) {
      throw new BadRequestException('path contains an invalid folder name');
    }
  }
  const parentId = r.parentId ?? r.parent_id;
  if (parentId !== undefined && parentId !== null && parentId !== '' && (typeof parentId !== 'string' || !UUID_RE.test(parentId))) {
    throw new BadRequestException('Invalid parentId');
  }
  return { segments: cleaned as string[], parentId: parentId ? String(parentId) : undefined };
}
