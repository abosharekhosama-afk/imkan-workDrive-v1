import { FileType } from '@prisma/client';

const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  'application/x-rar-compressed',
  'application/vnd.rar',
]);

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/rtf']);

const DOCUMENT_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
]);

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
]);

const PRESENTATION_MIME_TYPES = new Set([
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
]);

const CODE_MIME_TYPES = new Set([
  'application/javascript',
  'text/javascript',
  'application/json',
  'application/xml',
  'text/html',
  'text/css',
  'text/csv',
  'text/x-python',
  'application/x-httpd-php',
  'application/typescript',
]);

export function classifyFileType(mimeType?: string | null): FileType {
  if (!mimeType) {
    return FileType.OTHER;
  }
  if (mimeType.startsWith('image/')) return FileType.IMAGE;
  if (mimeType.startsWith('video/')) return FileType.VIDEO;
  if (mimeType.startsWith('audio/')) return FileType.AUDIO;
  if (mimeType === 'application/pdf') return FileType.PDF;
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return FileType.ARCHIVE;
  if (TEXT_MIME_TYPES.has(mimeType)) return FileType.TEXT;
  if (DOCUMENT_MIME_TYPES.has(mimeType)) return FileType.DOCUMENT;
  if (SPREADSHEET_MIME_TYPES.has(mimeType)) return FileType.SPREADSHEET;
  if (PRESENTATION_MIME_TYPES.has(mimeType)) return FileType.PRESENTATION;
  if (CODE_MIME_TYPES.has(mimeType)) return FileType.CODE;
  if (mimeType.startsWith('text/')) return FileType.DOCUMENT;
  return FileType.OTHER;
}

export function extractExtension(name: string): string | null {
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) {
    return null;
  }
  const extension = name.slice(index + 1).toLowerCase();
  if (extension.length > 16 || extension.includes('/')) {
    return null;
  }
  return extension;
}
