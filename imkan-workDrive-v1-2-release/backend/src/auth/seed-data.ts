import { OrgRole, MembershipStatus, FolderType } from '@prisma/client';

export const SEED_ORGANIZATION = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'IMKAN Demo Organization',
} as const;

export const SEED_USERS = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    email: 'admin@example.imkan',
    name: 'Admin User',
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    email: 'organizer@example.imkan',
    name: 'Organizer User',
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    email: 'viewer@example.imkan',
    name: 'Viewer User',
  },
] as const;

export const SEED_MEMBERSHIPS = [
  {
    id: '00000000-0000-4000-8000-000000000111',
    userId: '00000000-0000-4000-8000-000000000011',
    organizationId: '00000000-0000-4000-8000-000000000001',
    role: OrgRole.SUPER_ADMIN,
    status: MembershipStatus.ACTIVE,
    isPrimary: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000112',
    userId: '00000000-0000-4000-8000-000000000012',
    organizationId: '00000000-0000-4000-8000-000000000001',
    role: OrgRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    isPrimary: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000113',
    userId: '00000000-0000-4000-8000-000000000013',
    organizationId: '00000000-0000-4000-8000-000000000001',
    role: OrgRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    isPrimary: true,
  },
] as const;

export const SEED_TEAM_FOLDER = {
  id: '00000000-0000-4000-8000-000000000061',
  name: 'Marketing Team Folder',
} as const;

export const SEED_TEAM_FOLDER_MEMBER_USER_ID =
  '00000000-0000-4000-8000-000000000012';

export const SEED_PERSONAL_FOLDERS = [
  {
    id: '00000000-0000-4000-8000-000000000041',
    ownerId: '00000000-0000-4000-8000-000000000011',
    orgId: '00000000-0000-4000-8000-000000000001',
    name: 'My Folder',
    folderType: FolderType.PERSONAL,
  },
  {
    id: '00000000-0000-4000-8000-000000000042',
    ownerId: '00000000-0000-4000-8000-000000000012',
    orgId: '00000000-0000-4000-8000-000000000001',
    name: 'My Folder',
    folderType: FolderType.PERSONAL,
  },
  {
    id: '00000000-0000-4000-8000-000000000043',
    ownerId: '00000000-0000-4000-8000-000000000013',
    orgId: '00000000-0000-4000-8000-000000000001',
    name: 'My Folder',
    folderType: FolderType.PERSONAL,
  },
] as const;

export const SEED_FILE = {
  id: '00000000-0000-4000-8000-000000000021',
  name: 'quarterly-report.pdf',
  originalName: 'quarterly-report.pdf',
  extension: 'pdf',
  mimeType: 'application/pdf',
  sha256Hash:
    '1111111111111111111111111111111111111111111111111111111111111111',
  size: 2048,
} as const;

export const SEED_FILE_VERSIONS = [
  { versionNumber: 1, size: 1024 },
  { versionNumber: 2, size: 2048 },
] as const;

export const SEED_TAG_NAME = 'finance';