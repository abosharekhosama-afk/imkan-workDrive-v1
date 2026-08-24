import { PrismaClient, OrgRole } from '@prisma/client';
import { SEED_ORGANIZATION, SEED_USERS } from '../src/auth/seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { id: SEED_ORGANIZATION.id },
    update: { name: SEED_ORGANIZATION.name },
    create: {
      id: SEED_ORGANIZATION.id,
      name: SEED_ORGANIZATION.name,
    },
  });

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: {
        orgId_email: { orgId: organization.id, email: user.email },
      },
      update: { role: user.role as OrgRole },
      create: {
        id: user.id,
        orgId: organization.id,
        email: user.email,
        role: user.role as OrgRole,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
