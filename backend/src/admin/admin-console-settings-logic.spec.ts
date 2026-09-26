import { ForbiddenException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import {
  ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS,
  assertAdminRole,
  buildAdminConsoleSettingsUpdate,
  isMissingAdminConsoleSettingsTableError,
  serializeAdminConsoleSettings,
} from './admin-console-settings-logic';

describe('admin-console-settings-logic', () => {
  it('allows ADMIN and SUPER_ADMIN roles', () => {
    expect(() => assertAdminRole(OrgRole.ADMIN)).not.toThrow();
    expect(() => assertAdminRole(OrgRole.SUPER_ADMIN)).not.toThrow();
  });

  it('rejects non-admin roles with 403 semantics', () => {
    expect(() => assertAdminRole(OrgRole.MEMBER)).toThrow(ForbiddenException);
  });

  it('serializes bigint storage limits as strings', () => {
    const dto = serializeAdminConsoleSettings({
      id: 'settings-1',
      orgId: 'org-1',
      myFoldersLimitBytes: BigInt(1024),
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
      versionMode: 'ALL',
      versionLimit: null,
      publicTeamFolderCreator: 'ANYONE',
      privateTeamFolderCreator: 'ANYONE',
      sameDomainJoinEnabled: false,
      logoDataUrl: null,
      customDomain: null,
    });
    expect(dto.myFoldersLimitBytes).toBe('1024');
    expect(dto.defaultView).toBe('COMPACT');
  });

  it('builds update payloads with bigint storage limits', () => {
    const current = serializeAdminConsoleSettings({
      id: 'settings-1',
      orgId: 'org-1',
      myFoldersLimitBytes: '2048',
      ...ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS,
      logoDataUrl: null,
      customDomain: null,
    });
    const update = buildAdminConsoleSettingsUpdate(current, { myFoldersLimitBytes: '4096', convertOnUpload: true });
    expect(update.convertOnUpload).toBe(true);
    expect(update.myFoldersLimitBytes).toEqual(BigInt(4096));
  });

  it('detects missing admin_console_settings table errors', () => {
    expect(isMissingAdminConsoleSettingsTableError({ code: 'P2021' })).toBe(true);
    expect(isMissingAdminConsoleSettingsTableError(new Error("Table 'admin_console_settings' doesn't exist"))).toBe(true);
    expect(isMissingAdminConsoleSettingsTableError(new Error('Unique constraint failed'))).toBe(false);
  });
});
