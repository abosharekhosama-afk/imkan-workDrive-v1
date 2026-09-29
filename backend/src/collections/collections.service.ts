import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { FilesService } from '../files/files.service';
import { MailService } from '../mail/mail.service';
import { collectionInviteEmail, collectionSubmissionEmail } from '../mail/email-templates';
import { parseInviteEmails } from './collection-email-logic';
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService, private readonly mail: MailService, private readonly config: ConfigService) {}
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
    const row = await this.prisma.fileCollection.create({ data: { orgId: user.org_id, createdById: user.sub, folderId, name, description: body.description ? String(body.description).slice(0, 4000) : null, notes: body.notes ? String(body.notes).slice(0, 4000) : null, type: body.type === 'INTERNAL' ? 'INTERNAL' : 'EXTERNAL', tokenHash: this.hash(token), expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, maxFiles: body.maxFiles == null ? null : Math.max(1, Math.min(1000, Number(body.maxFiles))), maxFileSizeBytes: body.maxFileSizeBytes == null ? null : BigInt(body.maxFileSizeBytes), collectName: body.collectName !== false, collectEmail: Boolean(body.collectEmail), collectPhone: Boolean(body.collectPhone), sameNameAsVersion: Boolean(body.sameNameAsVersion), notifyOnSubmission: body.notifyOnSubmission !== false, separateFolderPerUser: Boolean(body.separateFolderPerUser) }, include: { folder: { select: { id: true, name: true } } } });
    const { tokenHash, ...safe } = row;
    return { ...safe, token, publicPath: `/collect/${token}` };
  }
  async regenerateLink(user: AccessTokenPayload, id: string) {
    await this.assertManager(user);
    const current = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new NotFoundException('Collection not found');
    if (current.status !== 'ACTIVE') throw new BadRequestException('Enable the collection before generating a link');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.fileCollection.update({ where: { id }, data: { tokenHash: this.hash(token) } });
    return { token, publicPath: `/collect/${token}` };
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
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0,4000) : null;
    if (body.maxFiles !== undefined) data.maxFiles = body.maxFiles == null ? null : Math.max(1, Math.min(1000, Number(body.maxFiles)));
    if (body.maxFileSizeBytes !== undefined) data.maxFileSizeBytes = body.maxFileSizeBytes == null ? null : BigInt(body.maxFileSizeBytes);
    for (const key of ['collectName','collectEmail','collectPhone','sameNameAsVersion','notifyOnSubmission','separateFolderPerUser']) if (body[key] !== undefined) data[key] = Boolean(body[key]);
    return this.prisma.fileCollection.update({ where: { id }, data, select: { id:true,name:true,status:true,description:true,expiresAt:true,updatedAt:true } });
  }
  async remove(user: AccessTokenPayload, id: string) { await this.assertManager(user); const row = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id } }); if (!row) throw new NotFoundException('Collection not found'); await this.prisma.fileCollection.delete({ where: { id } }); return { deleted: true, id }; }

  async emailLink(user: AccessTokenPayload, id: string, body: { emails?: string[] | string; message?: string; token?: string }) {
    await this.assertManager(user);
    const collection = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id }, include: { organization: { select: { name: true } } } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.status !== 'ACTIVE') throw new BadRequestException('Enable the collection before emailing the link');
    const token = String(body?.token ?? '').trim();
    if (!token || this.hash(token) !== collection.tokenHash) throw new BadRequestException('Collection link is out of date. Generate the link again.');
    const parsed = parseInviteEmails(body?.emails);
    if (!parsed.emails.length) throw new BadRequestException('Add at least one valid email address');
    const requester = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { name: true, email: true } });
    const requesterName = requester?.name?.trim() || requester?.email || 'A teammate';
    const message = body?.message ? String(body.message).trim().slice(0, 2000) : '';
    const link = `${this.frontendUrl()}/collect/${token}`;
    let delivered = true;
    for (const email of parsed.emails) {
      const rendered = collectionInviteEmail({
        collectionName: collection.name,
        requesterName,
        organizationName: collection.organization.name,
        description: collection.description,
        message,
        link,
        expiresAt: collection.expiresAt,
        signInRequired: collection.type === 'INTERNAL',
      });
      const sent = await this.mail.send({ to: email, ...rendered });
      if (!sent.delivered) delivered = false;
      await this.prisma.collectionEmailInvite.create({ data: { collectionId: collection.id, email, message: message || null, delivered: sent.delivered } });
    }
    return { sent: parsed.emails.length, delivered, invalid: parsed.invalid };
  }

  private frontendUrl() { return (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, ''); }

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
    const submitterName = row.collectName ? String(body?.submitterName ?? '').trim().slice(0, 180) || null : null;
    const submitterEmail = row.collectEmail ? String(body?.submitterEmail ?? '').trim().slice(0, 320) || null : null;
    const submitterPhone = row.collectPhone ? String(body?.submitterPhone ?? '').trim().slice(0, 40) || null : null;
    if (row.maxFiles) {
      const identityWhere = submitterEmail ? { submitterEmail } : submitterPhone ? { submitterPhone } : submitterName ? { submitterName } : null;
      if (!identityWhere) throw new BadRequestException('A submitter identity is required when a per-user file limit is enabled');
      const existing = await this.prisma.collectionSubmission.aggregate({ where: { collectionId: row.id, ...identityWhere }, _sum: { fileCount: true } });
      if ((existing._sum.fileCount ?? 0) >= row.maxFiles) throw new BadRequestException('Per-user file limit reached');
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new BadRequestException('A valid SHA-256 checksum is required');
    let destinationFolderId = row.folderId;
    if (row.separateFolderPerUser) {
      const parent = await this.prisma.folder.findFirst({ where: { id: row.folderId, orgId: row.orgId }, select: { id: true, teamFolderId: true } });
      if (!parent) throw new NotFoundException('Collection destination folder not found');
      const rawLabel = submitterName || submitterEmail || submitterPhone || 'External submitter';
      const safeLabel = rawLabel.normalize('NFKC').replace(/[\\/\0-\x1f]/g, '-').trim().slice(0, 90) || 'External submitter';
      const identityWhere = submitterEmail ? { submitterEmail } : submitterPhone ? { submitterPhone } : submitterName ? { submitterName } : null;
      const previous = identityWhere ? await this.prisma.collectionSubmission.findFirst({ where: { collectionId: row.id, ...identityWhere, status: 'RECEIVED', fileId: { not: null } }, orderBy: { submittedAt: 'desc' }, select: { fileId: true } }) : null;
      const previousFile = previous?.fileId ? await this.prisma.file.findFirst({ where: { id: previous.fileId, orgId: row.orgId }, select: { folderId: true } }) : null;
      const reusableFolder = previousFile?.folderId ? await this.prisma.folder.findFirst({ where: { id: previousFile.folderId, orgId: row.orgId, parentId: parent.id }, select: { id: true } }) : null;
      if (reusableFolder) destinationFolderId = reusableFolder.id;
      else {
        const existingCount = await this.prisma.folder.count({ where: { orgId: row.orgId, parentId: parent.id, name: { startsWith: safeLabel } } });
        const folderName = existingCount ? `${safeLabel} (${existingCount + 1})` : safeLabel;
        const created = await this.prisma.folder.create({ data: { orgId: row.orgId, teamFolderId: parent.teamFolderId, parentId: parent.id, name: folderName, ownerId: row.createdById } });
        destinationFolderId = created.id;
      }
    }
    const submission = await this.prisma.collectionSubmission.create({ data: { collectionId: row.id, submitterName, submitterEmail, submitterPhone, fileCount: 1, status: 'UPLOADING' } });
    const user = { sub: row.createdById, org_id: row.orgId, email: 'collection-upload@internal.invalid', role: 'ADMIN' };
    try {
      const upload = await this.files.requestUpload(user, { name, folderId: destinationFolderId, size, mimeType, sha256 });
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
    await this.prisma.collectionSubmission.update({ where: { id: submission.id }, data: { fileCount: 1, fileId: result.file_id, status: 'RECEIVED', submittedAt: new Date() } });
    if (row.notifyOnSubmission) {
      const who = submission.submitterName || submission.submitterEmail || 'A user';
      await this.prisma.notification.create({ data: { orgId: row.orgId, userId: row.createdById, type: 'SYSTEM', title: 'New collection submission', body: `${who} submitted a file to ${row.name}.`, resourceType: 'FILE', resourceId: result.file_id } }).catch(() => undefined);
      const owner = await this.prisma.user.findUnique({ where: { id: row.createdById }, select: { email: true } });
      const file = await this.prisma.file.findFirst({ where: { id: result.file_id, orgId: row.orgId }, select: { name: true, folderId: true } });
      if (owner?.email) {
        const rendered = collectionSubmissionEmail({ collectionName: row.name, submitter: who, fileName: file?.name || 'a file', folderUrl: `${this.frontendUrl()}/files/${file?.folderId || row.folderId}` });
        await this.mail.send({ to: owner.email, ...rendered }).catch(() => undefined);
      }
    }
    return { completed: true, submissionId, file: result };
  }
  async submissions(user: AccessTokenPayload, id: string) {
    await this.assertManager(user);
    const collection = await this.prisma.fileCollection.findFirst({ where: { id, orgId: user.org_id }, select: { id: true } });
    if (!collection) throw new NotFoundException('Collection not found');
    const rows = await this.prisma.collectionSubmission.findMany({ where: { collectionId: id }, orderBy: { submittedAt: 'desc' } });
    const fileIds = rows.flatMap((row) => row.fileId ? [row.fileId] : []);
    const files = fileIds.length ? await this.prisma.file.findMany({ where: { id: { in: fileIds }, orgId: user.org_id }, select: { id: true, name: true, mimeType: true, size: true, folderId: true } }) : [];
    const byId = new Map(files.map((file) => [file.id, file]));
    return rows.map(({ uploadVersionId, ...row }) => ({ ...row, file: row.fileId ? byId.get(row.fileId) ?? null : null }));
  }
  async publicInfo(token: string) {
    if (!token || token.length > 100) throw new NotFoundException('Collection not found');
    const row = await this.prisma.fileCollection.findUnique({ where: { tokenHash: this.hash(token) }, include: { organization: { select: { name: true } } } });
    if (!row || row.status !== 'ACTIVE' || (row.expiresAt && row.expiresAt <= new Date())) throw new NotFoundException('This collection is unavailable');
    return { name: row.name, description: row.description, type: row.type, organizationName: row.organization.name, collectName: row.collectName, collectEmail: row.collectEmail, collectPhone: row.collectPhone, maxFiles: row.maxFiles, maxFileSizeBytes: row.maxFileSizeBytes?.toString() ?? null };
  }
}
