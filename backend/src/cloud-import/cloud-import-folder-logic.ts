export const MAX_FOLDER_IMPORT_FILES = 500;

export type RemoteEntryKind = 'file' | 'folder';

export function remoteEntryKind(mimeType: string | null | undefined, kind?: string | null): RemoteEntryKind {
  if (kind === 'folder' || kind === 'file') return kind;
  if (mimeType === 'application/vnd.google-apps.folder' || mimeType === 'folder') return 'folder';
  return 'file';
}

export function sortRemoteEntries<T extends { name: string; kind?: RemoteEntryKind | string | null }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const aFolder = remoteEntryKind(null, a.kind) === 'folder' ? 0 : 1;
    const bFolder = remoteEntryKind(null, b.kind) === 'folder' ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
