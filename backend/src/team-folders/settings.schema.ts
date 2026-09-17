import { BadRequestException } from '@nestjs/common';

export type UpdateTeamFolderSettingsInput = {
  isPublicToOrg?: boolean;
  allowExternalSharing?: boolean;
  allowViewerDownloads?: boolean;
};

export function parseUpdateTeamFolderSettings(body: unknown): UpdateTeamFolderSettingsInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Invalid team folder settings payload');
  }
  const record = body as Record<string, unknown>;
  const keys = ['isPublicToOrg', 'allowExternalSharing', 'allowViewerDownloads'];
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) throw new BadRequestException(`Unsupported setting: ${key}`);
    if (typeof record[key] !== 'boolean') throw new BadRequestException(`Invalid ${key}`);
  }
  return {
    ...(typeof record.isPublicToOrg === 'boolean' ? { isPublicToOrg: record.isPublicToOrg } : {}),
    ...(typeof record.allowExternalSharing === 'boolean' ? { allowExternalSharing: record.allowExternalSharing } : {}),
    ...(typeof record.allowViewerDownloads === 'boolean' ? { allowViewerDownloads: record.allowViewerDownloads } : {}),
  };
}
