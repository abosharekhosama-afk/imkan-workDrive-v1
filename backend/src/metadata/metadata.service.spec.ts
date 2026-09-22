import { BadRequestException } from '@nestjs/common';
import { MetadataService } from './metadata.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000011';

describe('MetadataService Phase 27', () => {
  const prisma = {
    fileDataTemplate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    folder: { findFirst: jest.fn(), update: jest.fn() },
    file: { findFirst: jest.fn() },
    fileMetadata: { upsert: jest.fn() },
  };
  const permissions = {
    isOrgAdminOrSuperAdmin: jest.fn(() => true),
    canWrite: jest.fn(() => true),
    canRead: jest.fn(() => true),
  };
  const service = new MetadataService(prisma as never, permissions as never);
  const user = { sub: USER, org_id: ORG, email: 'admin@example.imkan', role: 'ADMIN' };

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate/unsafe field keys', async () => {
    await expect(service.createTemplate(user, { name: 'Contracts', schema: [{ key: 'x', label: 'X', type: 'text' }, { key: 'x', label: 'X2', type: 'text' }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a typed data template with required fields', async () => {
    prisma.fileDataTemplate.create.mockResolvedValue({ id: 't1' });
    await service.createTemplate(user, { name: 'Contracts', schema: [{ key: 'contractNo', label: 'Contract No', type: 'text', required: true }, { key: 'status', label: 'Status', type: 'select', options: ['draft', 'signed'] }] });
    expect(prisma.fileDataTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Contracts', requiredFields: ['contractNo'] }) }));
  });

  it('rejects custom fields that are not in the bound template', async () => {
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: ORG, ownerId: USER, folder: { teamFolderId: null, dataTemplateId: 't1' }, metadata: null });
    prisma.fileDataTemplate.findFirst.mockResolvedValue({ id: 't1', orgId: ORG, active: true, schema: [{ key: 'status', label: 'Status', type: 'select', options: ['draft'] }] });
    await expect(service.updateFileMetadata(user, 'f1', { customFields: { secret: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid typed custom fields', async () => {
    prisma.file.findFirst.mockResolvedValue({ id: 'f1', orgId: ORG, ownerId: USER, folder: { teamFolderId: null, dataTemplateId: 't1' }, metadata: null });
    prisma.fileDataTemplate.findFirst.mockResolvedValue({ id: 't1', orgId: ORG, active: true, schema: [{ key: 'status', label: 'Status', type: 'select', options: ['draft', 'signed'], required: true }] });
    prisma.fileMetadata.upsert.mockResolvedValue({ id: 'm1' });
    await service.updateFileMetadata(user, 'f1', { customFields: { status: 'signed' } });
    expect(prisma.fileMetadata.upsert).toHaveBeenCalled();
  });

  it('never binds a foreign-org template', async () => {
    prisma.folder.findFirst.mockResolvedValue({ id: 'f1', orgId: ORG, ownerId: USER, teamFolderId: null });
    prisma.fileDataTemplate.findFirst.mockResolvedValue(null);
    await expect(service.bindFolder(user, 'f1', 'foreign')).rejects.toThrow('Data template not found');
  });
});
