import { ForbiddenException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseService admin settings', () => {
  const adminUser = { sub: 'user-1', org_id: 'org-1', role: OrgRole.ADMIN, jti: 'session-1' };
  const memberUser = { sub: 'user-2', org_id: 'org-1', role: OrgRole.MEMBER, jti: 'session-2' };

  function createService() {
    const prisma = {
      adminConsoleSetting: {
        upsert: jest.fn().mockResolvedValue({
          id: 'settings-1',
          orgId: 'org-1',
          logoDataUrl: null,
          customDomain: null,
          defaultView: 'COMPACT',
          thumbnailSize: 3,
          previewPanel: 'PREVIEW',
          convertOnUpload: false,
          allowNonZohoWriter: true,
          allowNonZohoSheet: true,
          allowNonZohoShow: true,
          saveNewFilesAsDrafts: true,
          ocrLanguage: 'NONE',
          allowDirectEmailSharing: true,
          directSharingScope: 'ANY_EXTERNAL_USER',
          allowExternalShareLinks: true,
          enforceSharePasswords: false,
          defaultShareExpiryDays: null,
          collectExternalUserInfo: false,
          allowDownloadLinks: true,
          downloadLinkExpiryDays: null,
          allowPermalinkEmbeds: true,
          allowEmbedDownloadPrint: true,
          allowCollections: true,
          collectionManagerScope: 'ANYONE_ON_TEAM',
          collectionExternalName: 'COLLECTION',
          myFoldersLimitBytes: null,
          versionMode: 'ALL',
          versionLimit: null,
          publicTeamFolderCreator: 'ANYONE',
          privateTeamFolderCreator: 'ANYONE',
          sameDomainJoinEnabled: false,
        }),
        update: jest.fn(),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const service = new EnterpriseService(prisma as any);
    return { service, prisma };
  }

  it('returns serialized settings for authenticated admins', async () => {
    const { service } = createService();
    const result = await service.consoleSettings(adminUser as any);
    expect(result.orgId).toBe('org-1');
    expect(result.defaultView).toBe('COMPACT');
  });

  it('rejects authenticated non-admin users with 403', async () => {
    const { service } = createService();
    await expect(service.consoleSettings(memberUser as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
