import { join } from 'node:path';

/** Candidate paths for Nest `blank-assets` after build (dist/templates/blank-assets). */
export function blankTemplateAssetCandidates(fileName: string, serviceDirname: string, cwd = process.cwd()): string[] {
  return [
    // Production: compiled service lives in dist/src/templates, assets in dist/templates/blank-assets.
    join(serviceDirname, '..', '..', 'templates', 'blank-assets', fileName),
    join(serviceDirname, 'blank-assets', fileName),
    join(cwd, 'dist', 'templates', 'blank-assets', fileName),
    join(cwd, 'dist', 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'dist', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'dist', 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'src', 'templates', 'blank-assets', fileName),
  ];
}

export type OfficeEditorSegment = 'writer' | 'sheet' | 'show';

/** Maps Office document type / extension to IMKAN Office editor segment. */
export function templateOfficeEditorSegment(
  officeType: string | null | undefined,
  extension: string | null | undefined,
): OfficeEditorSegment | null {
  const type = String(officeType ?? '').trim().toUpperCase();
  if (type === 'WRITER') return 'writer';
  if (type === 'SHEET') return 'sheet';
  if (type === 'SHOW') return 'show';
  const ext = String(extension ?? '').replace(/^\./, '').trim().toLowerCase();
  if (['doc', 'docx', 'docm', 'rtf'].includes(ext)) return 'writer';
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'pps', 'ppsx'].includes(ext)) return 'show';
  return null;
}

export function templateOfficeEditorPath(
  fileId: string,
  officeType: string | null | undefined,
  extension: string | null | undefined,
  templateId: string,
): string | null {
  const segment = templateOfficeEditorSegment(officeType, extension);
  if (!segment) return null;
  return `/office/${segment}/${fileId}?templateId=${encodeURIComponent(templateId)}`;
}
