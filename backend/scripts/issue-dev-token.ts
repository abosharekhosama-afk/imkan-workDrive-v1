import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const envPath = path.resolve(__dirname, '..', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((value) => value.startsWith('JWT_SECRET='));
  const secret = (line ?? '').split('=')[1].replace(/^"|"$/g, '');
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  const orgId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000011';
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: userId, org_id: orgId, email: 'admin@example.imkan', role: 'ADMIN', jti },
    secret,
  );
  await prisma.session.create({
    data: {
      id: jti,
      orgId,
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7_200_000),
    },
  });
  console.log(token);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
