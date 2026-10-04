import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { TemplateType } from '@prisma/client';

const BLANK_ASSET_FILES: Record<TemplateType, string> = {
  DOCUMENT: 'blank-document.docx',
  SPREADSHEET: 'blank-spreadsheet.xlsx',
  PRESENTATION: 'blank-presentation.pptx',
};

/** Candidate paths for Nest `blank-assets` after build (dist/templates/blank-assets). */
export function blankTemplateAssetCandidates(fileName: string, serviceDirname: string, cwd = process.cwd()): string[] {
  const unique = new Set<string>([
    // Production: compiled service lives in dist/src/templates, assets in dist/templates/blank-assets.
    join(serviceDirname, '..', '..', 'templates', 'blank-assets', fileName),
    join(serviceDirname, 'blank-assets', fileName),
    join(cwd, 'dist', 'templates', 'blank-assets', fileName),
    join(cwd, 'dist', 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'dist', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'dist', 'src', 'templates', 'blank-assets', fileName),
    join(cwd, 'backend', 'src', 'templates', 'blank-assets', fileName),
  ]);
  return [...unique];
}

/** Load canonical blank Office bytes for template creation. */
export async function readBlankTemplateAssetBytes(
  type: TemplateType,
  serviceDirname: string,
  cwd = process.cwd(),
): Promise<Buffer> {
  const fileName = BLANK_ASSET_FILES[type];
  const tried: string[] = [];
  for (const assetPath of blankTemplateAssetCandidates(fileName, serviceDirname, cwd)) {
    tried.push(assetPath);
    try {
      return await readFile(assetPath);
    } catch {
      // Try the next deployment layout.
    }
  }
  throw new Error(
    `Blank ${type.toLowerCase()} template asset is not available on the server (tried ${tried.length} path(s))`,
  );
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
  // Primary editor is Univer; IMKAN Office remains at /office/{segment}/...
  return `/office/univer/${encodeURIComponent(fileId)}?kind=${segment}&templateId=${encodeURIComponent(templateId)}`;
}
