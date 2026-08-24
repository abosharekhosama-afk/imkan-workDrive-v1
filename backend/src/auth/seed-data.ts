import { OrgRole } from '@prisma/client';

export const SEED_ORGANIZATION = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'IMKAN Demo Organization',
} as const;

export const SEED_USERS = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    email: 'admin@example.imkan',
    role: OrgRole.ADMIN,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    email: 'organizer@example.imkan',
    role: OrgRole.MEMBER,
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    email: 'viewer@example.imkan',
    role: OrgRole.MEMBER,
  },
] as const;
