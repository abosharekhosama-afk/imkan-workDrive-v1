export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
export const S3_CLIENT = Symbol('S3_CLIENT');
export const S3_PRESIGNER = Symbol('S3_PRESIGNER');

export type SignedUrlResult = {
  url: string;
  method: 'PUT' | 'GET';
  objectKey: string;
  expiresInSeconds: number;
};

export type StorageObjectRequest = {
  fileId: string;
  versionId: string;
  /** Server-side resource owner. Never taken from client orgId. */
  ownerOrgId: string;
  contentType?: string;
  /**
   * Download links default to `attachment`. Pass `inline` for preview URLs so
   * browsers render the bytes in-place instead of forcing a download.
   */
  disposition?: 'inline' | 'attachment';
  /** Original file name used to build a RFC 6266 compliant disposition. */
  fileName?: string;
};

export interface StorageService {
  buildObjectKey(fileId: string, versionId: string): string;
  createUploadUrl(request: StorageObjectRequest): Promise<SignedUrlResult>;
  createDownloadUrl(request: StorageObjectRequest): Promise<SignedUrlResult>;
  assertObjectExists(request: StorageObjectRequest): Promise<void>;
  deleteObject(request: StorageObjectRequest): Promise<void>;
  /** Deletes a physical object by its full tenant storage key (Database V2). */
  deleteStoredObject(storageKey: string): Promise<void>;
  /**
   * Resolves a tenant storage key to a local filesystem path. Implemented only
   * by the local-disk driver; used for inline (range-capable) streaming previews.
   * When absent, the caller falls back to a 302 redirect from a signed URL.
   */
  resolveObjectPath?(objectKey: string): string;
  /**
   * Server-side byte ingestion used by direct (multipart) uploads such as
   * `POST /files/:fileId/versions`. Both drivers implement it; the tenant
   * context and `ownerOrgId` are validated before any bytes are written.
   */
  storeObject(request: StorageObjectRequest, bytes: Buffer): Promise<void>;
}
