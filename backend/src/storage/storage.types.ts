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
};

export interface StorageService {
  buildObjectKey(fileId: string, versionId: string): string;
  createUploadUrl(request: StorageObjectRequest): Promise<SignedUrlResult>;
  createDownloadUrl(request: StorageObjectRequest): Promise<SignedUrlResult>;
  assertObjectExists(request: StorageObjectRequest): Promise<void>;
  deleteObject(request: StorageObjectRequest): Promise<void>;
}
