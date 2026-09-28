import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { FilesService } from '../files/files.service';
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async assertManager(user: AccessTokenPayload) {
    const settings = await this.prisma.adminConsoleSetting.findUnique({ where: { orgId: user.org_id } });
    if (settings?.allowCollections === false) throw new ForbiddenException('Collections are disabled for this team');
    if (settings?.collectionManagerScope === 'TEAM_ADMINS_ONLY' && !['ADMIN','SUPER_ADMIN'].includes(user.role)) throw new ForbiddenException('Only team admins can manage collections');
  }
  async list(user: AccessTokenPayload) {
    await this.assertManager(user);
    const rows = await this.prisma.fileCollection.findMany({ where: { orgId: user.org_id }, include: { folder: { select: { id: true, name: true } }, submissions: { select: { id: true, fileCount: true, submittedAt: true, status: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ tokenHash, ...row }) => ({ ...row, submissionsCount: row.submissions.length, filesCount: row.submissions.reduce((n, s) => n + s.fileCount, 0) }));
  }
  async create(user: AccessTokenPayload, body: any) {
    await this.assertManager(user);
    const name = String(body?.name ?? '').trim();
    const folderId = String(body?.folderId ?? '').trim();
    if (!name || name.length > 180 || !folderId) throw new BadRequestException('Name and destination folder are required');
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, orgId: user.org_id } });
    if (!folder) throw new NotFoundException('Destination folder not found');
    const token = randomBytes(32).toString('base64url');
    const row = await this.prisma.fileCollection.create({ data: { orgId: user.org_id, createdById: user.sub, folderId, name, description: body.description ? String(body.description).slice(0, 4000) : null, type: body.type === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL', tokenHash: this.hash(token), expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, maxFiles: body.maxFiles == null ? null : Math.max(1, Math.min(1000, Number(body.maxFiles))), maxFileSizeBytes: body.maxFileSizeBytes == null ? null : BigInt(body.maxFileSizeBytes), collectName: body.collectName !== false, collectEmail: Boolean(body.collectEmail), separateFolderPerUser: Boolean(body.separateFolderPerUser) }, include: { folder: { select: { id: true, name: true } } } });
    const { tokenHash, ...safe } = row;
    return { ...safe, token, publicPath: `/collect/${token}` };
  }
  async update(user: AccessTokenPayload, id: string, body: any) {
    await this.assertManager(user);
    const current = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new NotFoundException('Collection not found');
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim().slice(0,180);
    if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0,4000) : null;
    if (body.status !== undefined) { if (!['ACTIVE','DISABLED','COMPLETED'].includes(body.status)) throw new BadRequestException('Invalid status'); data.status = body.status; }
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    return this.prisma.fileCollection.update({ where: { id }, data, select: { id:true,name:true,status:true,description:true,expiresAt:true,updatedAt:true } });
  }
  async remove(user: AccessTokenPayload, id: string) { await this.assertManager(user); const row = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id } }); if (!row) throw new NotFoundException('Collection not found'); await this.prisma.fileCollection.delete({ where: { id } }); return { deleted: true, id }; }

  private async resolvePublic(token: string) {
    if (!token || token.length > 100) throw new NotFoundException('Collection not found');
    const row = await this.prisma.fileCollection.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!row || row.status !== 'ACTIVE' || (row.expiresAt && row.expiresAt <= new Date())) throw new NotFoundException('This collection is unavailable');
    return row;
  }
  async publicUploadRequest(token: string, body: any) {
    const row = await this.resolvePublic(token);
    const name = String(body?.name ?? '').trim();
    const size = Number(body?.size);
    const mimeType = String(body?.mimeType ?? 'application/octet-stream');
    const sha256 = String(body?.sha256 ?? '').toLowerCase();
    if (!name || name.length > 191 || !Number.isSafeInteger(size) || size < 1) throw new BadRequestException('Invalid file details');
    if (row.maxFileSizeBytes && BigInt(size) > row.maxFileSizeBytes) throw new BadRequestException('File exceeds the collection size limit');
    const existing = await this.prisma.collectionSubmission.aggregate({ where: { collectionId: row.id }, _sum: { fileCount: true } });
    if (row.maxFiles && (existing._sum.fileCount ?? 0) >= row.maxFiles) throw new BadRequestException('Collection file limit reached');
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BadRequestException('A valid SHA-256 checksum is required');
    const submission = await this.prisma.collectionSubmission.create({ data: { collectionId: row.id, submitterName: row.collectName ? String(body?.submitterName ?? '').slice(0,180) || null : null, submitterEmail: row.collectEmail ? String(body?.submitterEmail ?? '').slice(0,320) || null : null, fileCount: 1, status: 'UPLOADING' } });
    const user = { sub: row.createdById, org_id: row.orgId, email: 'collection-upload@internal.invalid', role: 'ADMIN' };
    try {
      const upload = await this.files.requestUpload(user, { name, folderId: row.folderId, size, mimeType, sha256 });
      await this.prisma.collectionSubmission.update({ where: { id: submission.id }, data: { uploadVersionId: upload.upload_id } });
      return { submissionId: submission.id, ...upload };
    } catch (error) { await this.prisma.collectionSubmission.delete({ where: { id: submission.id } }); throw error; }
  }
  async completePublicUpload(token: string, body: any) {
    const row = await this.resolvePublic(token);
    const submissionId = String(body?.submissionId ?? '');
    const uploadId = String(body?.uploadId ?? '');
    const submission = await this.prisma.collectionSubmission.findFirst({ where: { id: submissionId, collectionId: row.id, status: 'UPLOADING' } });
    if (!submission || !uploadId || submission.uploadVersionId !== uploadId) throw new NotFoundException('Upload session not found');
    const user = { sub: row.createdById, org_id: row.orgId, email: 'collection-upload@internal.invalid', role: 'ADMIN' };
    const result = await this.files.completeUpload(user, uploadId);
    await this.prisma.collectionSubmission.update({ where: { id: submission.id }, data: { fileCount: 1, status: 'RECEIVED', submittedAt: new Date() } });
    return { completed: true, submissionId, file: result };
  }
  async submissions(user: AccessTokenPayload, id: string) {
    await this.assertManager(user);
    const collection = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id }, select: { id: true } });
    if (!collection) throw new NotFoundException('Collection not found');
    return this.prisma.collectionSubmission.findMany({ where: { collectionId: id }, orderBy: { submittedAt: 'desc' } });
  }
  async publicInfo(token: string) {
    if (!token || token.length > 100) throw new NotFoundException('Collection not found');
    const row = await this.prisma.fileCollection.findUnique({ where: { tokenHash: this.hash(token) }, include: { organization: { select: { name: true } } } });
    if (!row || row.status !== 'ACTIVE' || (row.expiresAt && row.expiresAt <= new Date())) throw new NotFoundException('This collection is unavailable');
    return { name: row.name, description: row.description, type: row.type, organizationName: row.organization.name, collectName: row.collectName, collectEmail: row.collectEmail, maxFiles: row.maxFiles, maxFileSizeBytes: row.maxFileSizeBytes?.toString() ?? null };
  }
}
