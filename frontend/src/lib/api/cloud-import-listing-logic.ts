import type { CloudFileListing, CloudRemoteFile } from './cloud-import';

/** Listing responses are `{ files, nextPageToken, parent }`, not a bare array. */
export function cloudFilesFromListing(
  listing: CloudFileListing | CloudRemoteFile[] | null | undefined,
): CloudRemoteFile[] {
  if (Array.isArray(listing)) return sortCloudRemoteFiles(listing);
  if (listing && Array.isArray(listing.files)) return sortCloudRemoteFiles(listing.files);
  return [];
}

export function isCloudFolder(entry: Pick<CloudRemoteFile, 'kind' | 'mimeType'> | null | undefined): boolean {
  if (!entry) return false;
  if (entry.kind === 'folder') return true;
  return entry.mimeType === 'application/vnd.google-apps.folder' || entry.mimeType === 'folder';
}

export function sortCloudRemoteFiles<T extends CloudRemoteFile>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const aFolder = isCloudFolder(a) ? 0 : 1;
    const bFolder = isCloudFolder(b) ? 0 : 1;
    if (aFolder !== bFolder) return aFolder - bFolder;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export type CloudBrowseCrumb = { id: string | null; name: string };

export function rootCloudBrowseCrumb(locale: 'en' | 'ar'): CloudBrowseCrumb {
  return { id: null, name: locale === 'ar' ? 'ملفاتي' : 'My files' };
}

export function pushCloudBrowseCrumb(path: CloudBrowseCrumb[], folder: CloudRemoteFile): CloudBrowseCrumb[] {
  return [...path, { id: folder.id, name: folder.name }];
}

export function sliceCloudBrowsePath(path: CloudBrowseCrumb[], index: number): CloudBrowseCrumb[] {
  if (index < 0) return path.slice(0, 1);
  return path.slice(0, index + 1);
}
