import type { CloudFileListing, CloudRemoteFile } from './cloud-import';

/** Listing responses are `{ files, nextPageToken, parent }`, not a bare array. */
export function cloudFilesFromListing(
  listing: CloudFileListing | CloudRemoteFile[] | null | undefined,
): CloudRemoteFile[] {
  if (Array.isArray(listing)) return listing;
  if (listing && Array.isArray(listing.files)) return listing.files;
  return [];
}
