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
});
