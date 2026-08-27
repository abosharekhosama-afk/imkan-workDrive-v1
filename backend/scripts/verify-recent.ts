import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://127.0.0.1:3001';

function jwtSecretFromEnv(): string {
  const envPath = path.resolve(__dirname, '..', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((value) => value.startsWith('JWT_SECRET='));
  if (!line) throw new Error('JWT_SECRET missing from backend .env');
  return line.split('=')[1].replace(/^"|"$/g, '');
}

const JWT_SECRET = jwtSecretFromEnv();

async function jwtSign(payload: object): Promise<string> {
  const { default: jwt } = await import('jsonwebtoken');
  return jwt.sign(payload, JWT_SECRET, {});
}

async function main(): Promise<void> {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000011';
  const jti = randomUUID();
  const token = await jwtSign({
    sub: userId,
    org_id: orgId,
    email: 'admin@example.imkan',
    role: 'ADMIN',
    jti,
  });
  await prisma.session.create({
    data: {
      id: jti,
      orgId,
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const auth = { Authorization: `Bearer ${token}` };

  // 1. open root contents
  const rootsRes = await fetch(`${BASE}/folders`, { headers: auth });
  console.log('GET /folders ->', rootsRes.status);
  const roots = (await rootsRes.json()) as {
    folders?: Array<{ id: string; name: string }>;
  };
  const folderId = roots.folders?.[0]?.id ?? null;
  console.log('folder:', folderId);

  if (folderId) {
    // 2. open the folder -> should record VIEW access event
    const detail = await fetch(`${BASE}/folders/${folderId}`, { headers: auth });
    console.log(`GET /folders/${folderId} ->`, detail.status);
    const body = (await detail.json()) as { files?: Array<{ id: string }> };
    const fileId = body.files?.[0]?.id;
    if (fileId) {
      // 3. request a download URL -> DOWNLOAD event
      const dl = await fetch(`${BASE}/files/${fileId}/download`, { headers: auth });
      console.log(`GET /files/${fileId}/download ->`, dl.status);
    }
  }

  // small delay for fire-and-forget writes
  await new Promise((r) => setTimeout(r, 800));

  // 4. check workspace/recent
  const recentRes = await fetch(`${BASE}/workspace/recent`, { headers: auth });
  const recent = (await recentRes.json()) as Array<Record<string, unknown>>;
  console.log('GET /workspace/recent ->', recentRes.status);
  console.log(JSON.stringify(recent.slice(0, 5), null, 2));

  // cleanup session
  await prisma.session.deleteMany({ where: { id: jti } });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
