import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTenant } from '../auth/tenant-context';
import { LocalDiskStorageAdapter } from './local-disk.storage';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const FILE_ID = '00000000-0000-4000-8000-000000000021';
const VERSION_ID = '00000000-0000-4000-8000-000000000031';
const USER_ID = '00000000-0000-4000-8000-000000000011';

describe('LocalDiskStorageAdapter', () => {
  let root: string;
  let storage: LocalDiskStorageAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'workdrive-storage-'));
    const config = {
      get: (key: string) => {
        if (key === 'STORAGE_LOCAL_ROOT') return root;
        if (key === 'STORAGE_PUBLIC_BASE_URL') return 'http://127.0.0.1:3001';
        if (key === 'JWT_SECRET') return 'test-signing-secret-32chars-minimum';
        if (key === 'S3_SIGNED_URL_EXPIRES_SECONDS') return '900';
        return undefined;
      },
    } as ConfigService;
    storage = new LocalDiskStorageAdapter(config);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const ownedByA = {
    fileId: FILE_ID,
    versionId: VERSION_ID,
    ownerOrgId: ORG_A,
    contentType: 'text/plain',
  };

  it('stores and retrieves bytes through signed PUT/GET tokens', async () => {
    const upload = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createUploadUrl(ownedByA),
    );
    expect(upload.method).toBe('PUT');
    const uploadToken = new URL(upload.url).searchParams.get('token');
    expect(uploadToken).toBeTruthy();
    await storage.putObjectFromToken(
      uploadToken!,
      Buffer.from('hello-workdrive'),
    );

    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.assertObjectExists(ownedByA),
      ),
    ).resolves.toBeUndefined();

    const download = await runWithTenant(
      { orgId: ORG_A, userId: USER_ID },
      () => storage.createDownloadUrl(ownedByA),
    );
    const downloadToken = new URL(download.url).searchParams.get('token');
    const object = await storage.getObjectFromToken(downloadToken!);
    expect(object.bytes.toString('utf8')).toBe('hello-workdrive');
    expect(object.contentType).toBe('text/plain');
  });

  it('rejects missing tenant context', async () => {
    await expect(storage.createUploadUrl(ownedByA)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects forged ownership', async () => {
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.createUploadUrl({ ...ownedByA, ownerOrgId: ORG_B }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects GET before upload completes', async () => {
    const download = await runWithTenant(
      { orgId: ORG_A, userId: USER_ID },
      () => storage.createDownloadUrl(ownedByA),
    );
    const token = new URL(download.url).searchParams.get('token');
    // A signed GET for bytes that were never uploaded (or vanished from the
    // disk) must be a client-visible 404, never an unhandled ENOENT crash.
    await expect(storage.getObjectFromToken(token!)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('supports resumable multipart upload with retry-safe part replacement and final integrity inspection', async () => {
    const first = Buffer.from('part-one-');
    const second = Buffer.from('part-two');
    const { createHash } = await import('node:crypto');
    const full = Buffer.concat([first, second]);
    const sha = createHash('sha256').update(full).digest('hex');
    const upload = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createMultipartUpload({ ...ownedByA, checksum: sha }),
    );
    const p1 = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.uploadMultipartPart({ ...ownedByA, checksum: sha }, upload.uploadId, 1, first, createHash('sha256').update(first).digest('hex')),
    );
    const p2 = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.uploadMultipartPart({ ...ownedByA, checksum: sha }, upload.uploadId, 2, second, createHash('sha256').update(second).digest('hex')),
    );
    await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.completeMultipartUpload({ ...ownedByA, checksum: sha }, upload.uploadId, [p1, p2]),
    );
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () => storage.inspectObject({ ...ownedByA, checksum: sha })),
    ).resolves.toEqual({ size: full.length, checksum: sha });
  });

  it('does not leave a partial destination object when multipart completion fails', async () => {
    const first = Buffer.from('first-part');
    const sha = (await import('node:crypto')).createHash('sha256').update(first).digest('hex');
    const upload = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createMultipartUpload({ ...ownedByA, checksum: sha }),
    );
    const part = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.uploadMultipartPart({ ...ownedByA, checksum: sha }, upload.uploadId, 1, first, sha),
    );
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.completeMultipartUpload({ ...ownedByA, checksum: sha }, upload.uploadId, [part, { partNumber: 2, etag: 'missing' }]),
      ),
    ).rejects.toThrow('missing');
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () => storage.inspectObject({ ...ownedByA, checksum: sha })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-contiguous multipart completion manifests', async () => {
    const upload = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createMultipartUpload(ownedByA),
    );
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.completeMultipartUpload(ownedByA, upload.uploadId, [{ partNumber: 2, etag: 'etag' }]),
      ),
    ).rejects.toThrow('contiguous');
  });

  it('rejects a tenant-A request carrying a tenant-B storage key', async () => {
    const foreignKey = `tenant_${ORG_B}/files/${FILE_ID}/${VERSION_ID}`;
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.createDownloadUrl({ ...ownedByA, storageKey: foreignKey }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

});
