import { PrismaClient } from "@prisma/client";

const folderId = process.argv[2];
if (!folderId) {
  process.exit(0);
}

const prisma = new PrismaClient();

async function main() {
  const files = await prisma.file.findMany({
    where: { folderId },
    select: { id: true },
  });
  const fileIds = files.map((file) => file.id);
  if (fileIds.length > 0) {
    await prisma.share.deleteMany({ where: { resourceId: { in: fileIds } } });
    await prisma.fileVersion.deleteMany({ where: { fileId: { in: fileIds } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: fileIds } } });
    await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
  }
  await prisma.auditLog.deleteMany({ where: { resourceId: folderId } });
  await prisma.folder.deleteMany({ where: { id: folderId } });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "cleanup failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
