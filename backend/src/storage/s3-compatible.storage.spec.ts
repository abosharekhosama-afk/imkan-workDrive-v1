import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { runWithTenant } from '../auth/tenant-context';
import { S3CompatibleStorageAdapter } from './s3-compatible.storage';
import { StorageObjectRequest } from './storage.types';

const ORG_A = '00000000-0000-4000-8000-000000000001';
const ORG_B = '00000000-0000-4000-8000-000000000002';
const FILE_ID = '00000000-0000-4000-8000-000000000021';
const VERSION_ID = '00000000-0000-4000-8000-000000000031';
const USER_ID = '00000000-0000-4000-8000-000000000011';

describe('S3CompatibleStorageAdapter', () => {
  const presign = jest.fn(async () => 'https://signed.example/object');
  const client = { send: jest.fn() };
  const config = {
    get: (key: string) => {
      if (key === 'S3_BUCKET') return 'workdrive-dev';
      if (key === 'S3_SIGNED_URL_EXPIRES_SECONDS') return '900';
      return undefined;
    },
  } as ConfigService;
  const storage = new S3CompatibleStorageAdapter(
    config,
    client as never,
    presign,
  );

  const ownedByA: StorageObjectRequest = {
    fileId: FILE_ID,
    versionId: VERSION_ID,
    ownerOrgId: ORG_A,
  };

  beforeEach(() => {
    presign.mockClear();
    presign.mockResolvedValue('https://signed.example/object');
    client.send.mockReset();
    client.send.mockResolvedValue({});
  });

  it('builds a tenant-isolated object key from server tenant context', () => {
    const key = runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.buildObjectKey(FILE_ID, VERSION_ID),
    );
    expect(key).toBe(`tenant_${ORG_A}/files/${FILE_ID}/${VERSION_ID}`);
  });

  it('generates an upload signed URL for a PutObject command', async () => {
    const result = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createUploadUrl({ ...ownedByA, contentType: 'application/pdf' }),
    );
    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://signed.example/object');
    expect(result.expiresInSeconds).toBe(900);
    expect(result.objectKey).toBe(
      `tenant_${ORG_A}/files/${FILE_ID}/${VERSION_ID}`,
    );
    expect(presign).toHaveBeenCalledTimes(1);
    const command = presign.mock.calls[0][1];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Key).toBe(result.objectKey);
    expect(command.input.Bucket).toBe('workdrive-dev');
  });

  it('generates a download signed URL for a GetObject command', async () => {
    const result = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createDownloadUrl(ownedByA),
    );
    expect(result.method).toBe('GET');
    expect(result.url).toBe('https://signed.example/object');
    const command = presign.mock.calls[0][1];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input.Key).toBe(
      `tenant_${ORG_A}/files/${FILE_ID}/${VERSION_ID}`,
    );
  });

  it('rejects missing tenant context', async () => {
    await expect(storage.createUploadUrl(ownedByA)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a client-supplied orgId field', async () => {
    const poisoned = { ...ownedByA, orgId: ORG_B } as StorageObjectRequest;
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.createUploadUrl(poisoned),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid resource ownership', async () => {
    await expect(
      runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
        storage.createDownloadUrl({ ...ownedByA, ownerOrgId: ORG_B }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never uses a foreign orgId in the object key even if ownerOrgId is forged after check', async () => {
    const key = await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.createUploadUrl(ownedByA),
    );
    expect(key.objectKey.startsWith(`tenant_${ORG_A}/`)).toBe(true);
    expect(key.objectKey.includes(ORG_B)).toBe(false);
  });

  it('verifies the tenant object exists via HeadObject', async () => {
    await runWithTenant({ orgId: ORG_A, userId: USER_ID }, () =>
      storage.assertObjectExists(ownedByA),
    );
    expect(client.send).toHaveBeenCalled();
    const command = client.send.mock.calls[0][0];
    expect(command.constructor.name).toBe('HeadObjectCommand');
    expect(command.input.Key).toBe(
      `tenant_${ORG_A}/files/${FILE_ID}/${VERSION_ID}`,
    );
  });
});
