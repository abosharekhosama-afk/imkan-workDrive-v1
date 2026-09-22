import { ResourceType } from '@prisma/client';
import { SharesService } from './shares.service';
import { PermissionService } from '../permissions/permission.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const FILE = '00000000-0000-4000-8000-000000000021';
const OWNER = '00000000-0000-4000-8000-000000000011';
const RECIPIENT = '00000000-0000-4000-8000-000000000012';

describe('share recipient permissions', () => {
  it('changes only the selected recipient permission', async () => {
    const prisma: any = {
      fileShare: { findFirst: jest.fn().mockResolvedValue({ id: 'share-1', orgId: ORG, fileId: FILE }) },
      file: { findFirst: jest.fn().mockResolvedValue({ id: FILE, orgId: ORG, ownerId: OWNER, deletedAt: null, folder: { teamFolderId: null } }) },
      fileShareRecipient: {
        findFirst: jest.fn().mockResolvedValue({ id: 'recipient-row', shareId: 'share-1', userId: RECIPIENT, orgId: ORG }),
        update: jest.fn().mockResolvedValue({}),
      },
      fileActivity: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new SharesService(
      prisma,
      new PermissionService(),
      { get: () => 'https://workdrive.example' } as any,
      {} as any,
      {} as any,
    );
    const result = await service.updateRecipient({ sub: OWNER, org_id: ORG, role: 'MEMBER', email: 'owner@example.com' } as any, 'share-1', RECIPIENT, 'EDIT');
    expect(result).toEqual({ shareId: 'share-1', userId: RECIPIENT, permission: 'EDIT' });
    expect(prisma.fileShareRecipient.update).toHaveBeenCalledWith({ where: { id: 'recipient-row' }, data: { permission: 'EDIT' } });
    expect(prisma.fileShare.update).toBeUndefined();
  });

  it('rejects invalid recipient permissions', async () => {
    const service = new SharesService({} as any, new PermissionService(), { get: () => '' } as any, {} as any, {} as any);
    await expect(service.updateRecipient({ sub: OWNER, org_id: ORG, role: 'MEMBER' } as any, 'share-1', RECIPIENT, 'NO_ACCESS')).rejects.toThrow();
  });
});
