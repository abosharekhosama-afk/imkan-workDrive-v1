import { ForbiddenException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import type { AdminConsoleSetting } from '@prisma/client';

export type AdminConsoleSettingsDto = {
  id: string;
  orgId: string;
  logoDataUrl: string | null;
  customDomain: string | null;
  defaultView: string;
  thumbnailSize: number;
  previewPanel: string;
  convertOnUpload: boolean;
  allowNonZohoWriter: boolean;
  allowNonZohoSheet: boolean;
  allowNonZohoShow: boolean;
  saveNewFilesAsDrafts: boolean;
  ocrLanguage: string;
  allowDirectEmailSharing: boolean;
  directSharingScope: string;
  allowExternalShareLinks: boolean;
  enforceSharePasswords: boolean;
  defaultShareExpiryDays: number | null;
  collectExternalUserInfo: boolean;
  allowDownloadLinks: boolean;
  downloadLinkExpiryDays: number | null;
  allowPermalinkEmbeds: boolean;
  allowEmbedDownloadPrint: boolean;
  allowCollections: boolean;
  collectionManagerScope: string;
  collectionExternalName: string;
  myFoldersLimitBytes: string | null;
  versionMode: string;
  versionLimit: number | null;
  publicTeamFolderCreator: string;
  privateTeamFolderCreator: string;
  sameDomainJoinEnabled: boolean;
};

export const ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS = {
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
} as const;

export function assertAdminRole(role: OrgRole | string | undefined): void {
  if (role !== OrgRole.ADMIN && role !== OrgRole.SUPER_ADMIN) {
    throw new ForbiddenException('Admin access required');
  }
}

export function serializeAdminConsoleSettings(
  row: AdminConsoleSetting | Record<string, unknown>,
): AdminConsoleSettingsDto {
  const value = (key: string, fallback: unknown = null) => {
    const raw = (row as Record<string, unknown>)[key];
    return raw === undefined ? fallback : raw;
  };

  return {
    id: String(value('id', '')),
    orgId: String(value('orgId', '')),
    logoDataUrl: value('logoDataUrl') == null ? null : String(value('logoDataUrl')),
    customDomain: value('customDomain') == null ? null : String(value('customDomain')),
    defaultView: String(value('defaultView', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.defaultView)),
    thumbnailSize: Number(value('thumbnailSize', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.thumbnailSize)),
    previewPanel: String(value('previewPanel', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.previewPanel)),
    convertOnUpload: Boolean(value('convertOnUpload', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.convertOnUpload)),
    allowNonZohoWriter: Boolean(value('allowNonZohoWriter', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowNonZohoWriter)),
    allowNonZohoSheet: Boolean(value('allowNonZohoSheet', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowNonZohoSheet)),
    allowNonZohoShow: Boolean(value('allowNonZohoShow', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowNonZohoShow)),
    saveNewFilesAsDrafts: Boolean(value('saveNewFilesAsDrafts', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.saveNewFilesAsDrafts)),
    ocrLanguage: String(value('ocrLanguage', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.ocrLanguage)),
    allowDirectEmailSharing: Boolean(value('allowDirectEmailSharing', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowDirectEmailSharing)),
    directSharingScope: String(value('directSharingScope', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.directSharingScope)),
    allowExternalShareLinks: Boolean(value('allowExternalShareLinks', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowExternalShareLinks)),
    enforceSharePasswords: Boolean(value('enforceSharePasswords', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.enforceSharePasswords)),
    defaultShareExpiryDays: value('defaultShareExpiryDays') == null ? null : Number(value('defaultShareExpiryDays')),
    collectExternalUserInfo: Boolean(value('collectExternalUserInfo', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.collectExternalUserInfo)),
    allowDownloadLinks: Boolean(value('allowDownloadLinks', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowDownloadLinks)),
    downloadLinkExpiryDays: value('downloadLinkExpiryDays') == null ? null : Number(value('downloadLinkExpiryDays')),
    allowPermalinkEmbeds: Boolean(value('allowPermalinkEmbeds', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowPermalinkEmbeds)),
    allowEmbedDownloadPrint: Boolean(value('allowEmbedDownloadPrint', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowEmbedDownloadPrint)),
    allowCollections: Boolean(value('allowCollections', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.allowCollections)),
    collectionManagerScope: String(value('collectionManagerScope', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.collectionManagerScope)),
    collectionExternalName: String(value('collectionExternalName', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.collectionExternalName)),
    myFoldersLimitBytes: value('myFoldersLimitBytes') == null ? null : String(value('myFoldersLimitBytes')),
    versionMode: String(value('versionMode', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.versionMode)),
    versionLimit: value('versionLimit') == null ? null : Number(value('versionLimit')),
    publicTeamFolderCreator: String(value('publicTeamFolderCreator', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.publicTeamFolderCreator)),
    privateTeamFolderCreator: String(value('privateTeamFolderCreator', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.privateTeamFolderCreator)),
    sameDomainJoinEnabled: Boolean(value('sameDomainJoinEnabled', ADMIN_CONSOLE_SETTINGS_CREATE_DEFAULTS.sameDomainJoinEnabled)),
  };
}

export function buildAdminConsoleSettingsUpdate(
  current: AdminConsoleSettingsDto,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const bool = (key: keyof AdminConsoleSettingsDto) =>
    typeof input[key] === 'boolean' ? input[key] : current[key];
  const str = (key: keyof AdminConsoleSettingsDto, fallback?: string) =>
    typeof input[key] === 'string' && String(input[key]).length
      ? String(input[key])
      : (current[key] ?? fallback ?? null);
  const intOrNull = (key: keyof AdminConsoleSettingsDto) =>
    input[key] === null
      ? null
      : Number.isFinite(Number(input[key]))
        ? Math.trunc(Number(input[key]))
        : current[key] ?? null;

  const logo = typeof input.logoDataUrl === 'string' ? input.logoDataUrl : current.logoDataUrl ?? null;
  const customDomain = Object.prototype.hasOwnProperty.call(input, 'customDomain')
    ? input.customDomain == null || String(input.customDomain).trim() === ''
      ? null
      : String(input.customDomain).trim()
    : current.customDomain ?? null;

  return {
    logoDataUrl: logo,
    customDomain,
    defaultView: str('defaultView', 'COMPACT'),
    thumbnailSize: Math.min(5, Math.max(1, Number(input.thumbnailSize ?? current.thumbnailSize ?? 3))),
    previewPanel: str('previewPanel', 'PREVIEW'),
    convertOnUpload: bool('convertOnUpload'),
    allowNonZohoWriter: bool('allowNonZohoWriter'),
    allowNonZohoSheet: bool('allowNonZohoSheet'),
    allowNonZohoShow: bool('allowNonZohoShow'),
    saveNewFilesAsDrafts: bool('saveNewFilesAsDrafts'),
    ocrLanguage: str('ocrLanguage', 'NONE'),
    allowDirectEmailSharing: bool('allowDirectEmailSharing'),
    directSharingScope: str('directSharingScope', 'ANY_EXTERNAL_USER'),
    allowExternalShareLinks: bool('allowExternalShareLinks'),
    enforceSharePasswords: bool('enforceSharePasswords'),
    defaultShareExpiryDays: intOrNull('defaultShareExpiryDays'),
    collectExternalUserInfo: bool('collectExternalUserInfo'),
    allowDownloadLinks: bool('allowDownloadLinks'),
    downloadLinkExpiryDays: intOrNull('downloadLinkExpiryDays'),
    allowPermalinkEmbeds: bool('allowPermalinkEmbeds'),
    allowEmbedDownloadPrint: bool('allowEmbedDownloadPrint'),
    allowCollections: bool('allowCollections'),
    collectionManagerScope: str('collectionManagerScope', 'ANYONE_ON_TEAM'),
    collectionExternalName: str('collectionExternalName', 'COLLECTION'),
    myFoldersLimitBytes:
      input.myFoldersLimitBytes === null || input.myFoldersLimitBytes === undefined
        ? current.myFoldersLimitBytes == null
          ? null
          : BigInt(current.myFoldersLimitBytes)
        : BigInt(Math.max(0, Math.trunc(Number(input.myFoldersLimitBytes)))),
    versionMode: str('versionMode', 'ALL'),
    versionLimit:
      input.versionLimit === null
        ? null
        : Math.max(1, Math.trunc(Number(input.versionLimit ?? current.versionLimit ?? 1))),
    publicTeamFolderCreator: str('publicTeamFolderCreator', 'ANYONE'),
    privateTeamFolderCreator: str('privateTeamFolderCreator', 'ANYONE'),
    sameDomainJoinEnabled: bool('sameDomainJoinEnabled'),
  };
}

export function isMissingAdminConsoleSettingsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code ?? '');
  const message = String((error as { message?: string }).message ?? '');
  return code === 'P2021' || /admin_console_settings/i.test(message) && /does not exist|doesn't exist|unknown table/i.test(message);
}
