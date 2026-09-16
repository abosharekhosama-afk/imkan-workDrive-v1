import { ForbiddenException } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';

function makeEngine(canWrite = true, canRead = true, canShare = true) {
  const prisma = {
    file: { findFirst: jest.fn(), updateMany: jest.fn() },
    folder: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    favorite: { upsert: jest.fn() },
    tag: { upsert: jest.fn() },
    fileTag: { upsert: jest.fn() },
  } as any;
  const permissions = { canWrite: jest.fn(() => canWrite), canRead: jest.fn(() => canRead), canShare: jest.fn(() => canShare) } as any;
  const shares = { createShare: jest.fn() } as any;
  const functions = {} as any;
  return { engine: new WorkflowEngineService(prisma, shares, functions, permissions) as any, prisma, permissions };
}

const user = { sub: 'u1', org_id: 'org1', role: 'MEMBER' } as any;
const fileEvent = { eventType: 'manual', fileId: 'f1', folderId: 'src', name: 'file.txt', userId: 'u1', resourceType: 'FILE' as const };

describe('Workflow runtime authorization', () => {
  it('requires write access before moving a file', async () => {
    const { engine, prisma } = makeEngine(false, true, true);
    prisma.folder.findFirst.mockResolvedValue({ id: 'dest', orgId: 'org1', ownerId: 'u1', teamFolderId: null });
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: 'org1', ownerId: 'other', folderId: 'src', teamFolderId: null });

    await expect(engine.executeAction(user, { ...fileEvent }, { type: 'move', config: { destinationFolderId: 'dest' } }, 'w1', 'r1'))
      .rejects.toThrow(ForbiddenException);
  });

  it('requires read access to the source and write access to the destination before copying', async () => {
    const { engine, prisma } = makeEngine(true, false, true);
    prisma.folder.findFirst.mockResolvedValue({ id: 'dest', orgId: 'org1', ownerId: 'u1', teamFolderId: null });
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: 'org1', ownerId: 'other', folderId: 'src', teamFolderId: null });

    await expect(engine.executeAction(user, { ...fileEvent }, { type: 'copy', config: { destinationFolderId: 'dest' } }, 'w1', 'r1'))
      .rejects.toThrow(ForbiddenException);
  });

  it('requires share permission before generating a public link', async () => {
    const { engine, prisma } = makeEngine(true, true, false);
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: 'org1', ownerId: 'other', folderId: 'src', teamFolderId: null });

    await expect(engine.executeAction(user, { ...fileEvent }, { type: 'generate_link', config: {} }, 'w1', 'r1'))
      .rejects.toThrow(ForbiddenException);
  });

  it('requires write access before marking a file final', async () => {
    const { engine, prisma } = makeEngine(false, true, true);
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: 'org1', ownerId: 'other', folderId: 'src', teamFolderId: null });

    await expect(engine.executeAction(user, { ...fileEvent }, { type: 'mark_final', config: {} }, 'w1', 'r1'))
      .rejects.toThrow(ForbiddenException);
    expect(prisma.file.updateMany).not.toHaveBeenCalled();
  });

  it('requires write access to a parent folder before creating a workflow folder', async () => {
    const { engine, prisma } = makeEngine(false, true, true);
    prisma.folder.findFirst.mockResolvedValue({ id: 'parent', orgId: 'org1', ownerId: 'other', teamFolderId: null, parentId: null });

    await expect(engine.executeAction(user, { ...fileEvent, folderId: 'parent' }, { type: 'create_folder', config: {} }, 'w1', 'r1'))
      .rejects.toThrow(ForbiddenException);
    expect(prisma.folder.create).not.toHaveBeenCalled();
  });
});
