import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TABLE_MODELS: Array<[string, () => Promise<unknown[]>]> = [
  ['organizations', () => prisma.organization.findMany()],
  ['users', () => prisma.user.findMany()],
  ['team_folders', () => prisma.teamFolder.findMany()],
  ['team_folder_members', () => prisma.teamFolderMember.findMany()],
  ['folders', () => prisma.folder.findMany()],
  ['files', () => prisma.file.findMany()],
  ['favorites', () => prisma.favorite.findMany()],
  ['file_versions', () => prisma.fileVersion.findMany()],
  ['shares', () => prisma.fileShare.findMany()],
  ['share_recipients', () => prisma.fileShareRecipient.findMany()],
  ['access_events', () => prisma.accessEvent.findMany()],
  ['audit_logs', () => prisma.auditLog.findMany()],
  ['organization_invitations', () => prisma.organizationInvitation.findMany()],
  ['sessions', () => prisma.session.findMany()],
  ['password_reset_tokens', () => prisma.passwordResetToken.findMany()],
  ['notifications', () => prisma.notification.findMany()],
  ['comments', () => prisma.comment.findMany()],
  ['storage_quotas', () => prisma.storageQuota.findMany()],
  ['file_metadata', () => prisma.fileMetadata.findMany()],
  ['storage_objects', () => prisma.storageObject.findMany()],
  ['trash_entries', () => prisma.trashEntry.findMany()],
  ['file_activities', () => prisma.fileActivity.findMany()],
  ['tags', () => prisma.tag.findMany()],
  ['file_tags', () => prisma.fileTag.findMany()],
];

async function main(): Promise<void> {
  const outDir = path.resolve(__dirname, '..', '..', 'database', 'backup-v1');
  fs.mkdirSync(outDir, { recursive: true });
  const dump: Record<string, unknown[]> = {};
  for (const [table, query] of TABLE_MODELS) {
    const rows = await query();
    dump[table] = rows;
    console.log(`${table}: ${rows.length} rows`);
  }
  const outFile = path.join(outDir, `workdrive_dev_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(dump, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2), 'utf8');
  console.log(`Backup written to ${outFile}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
