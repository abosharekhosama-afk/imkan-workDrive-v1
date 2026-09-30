import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, ResourceType } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { MailService } from '../mail/mail.service';
import { commentNoticeEmail } from '../mail/email-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { FollowsService } from '../follows/follows.service';
import { EffectivePermissionService } from '../permissions/effective-permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { mentionedMemberIds, threadRootId } from './comments-logic';

const userSelect = { id: true, name: true, email: true } as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly follows: FollowsService,
    private readonly access: EffectivePermissionService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async list(user: AccessTokenPayload, fileId: string) {
    await this.assertRead(user, fileId);
    return this.prisma.comment.findMany({
      where: { orgId: user.org_id, fileId, parentId: null, deletedAt: null },
      include: {
        user: { select: userSelect },
        replies: { where: { deletedAt: null }, include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(user: AccessTokenPayload, fileId: string, body: string, parentId?: string) {
    const text = this.clean(body);
    const file = await this.assertComment(user, fileId);
    let rootId: string | null = null;
    if (parentId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: parentId, orgId: user.org_id, fileId, deletedAt: null }, select: { id: true, parentId: true, userId: true } });
      if (!parent) throw new NotFoundException('Parent comment not found');
      rootId = threadRootId(parent);
    }
    const created = await this.prisma.comment.create({
      data: { orgId: user.org_id, fileId, userId: user.sub, body: text, parentId: rootId },
      include: { user: { select: userSelect } },
    });
    const members = await this.members(user.org_id);
    const mentioned = new Set(mentionedMemberIds(text, members));
    const targets = new Set<string>();
    if (file.ownerId && file.ownerId !== user.sub) targets.add(file.ownerId);
    if (rootId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: rootId, orgId: user.org_id }, select: { userId: true } });
      if (parent?.userId && parent.userId !== user.sub) targets.add(parent.userId);
    }
    mentioned.forEach((id) => { if (id !== user.sub) targets.add(id); });
    await this.prisma.fileActivity.create({
      data: { orgId: user.org_id, fileId, userId: user.sub, action: 'COMMENT', metadata: { commentId: created.id, parentId: rootId, mentions: [...mentioned] } },
    });
    const actor = created.user?.name || created.user?.email || 'A collaborator';
    await Promise.all([...targets].map((userId) => this.notifications.createOfficeNotification({
      userId,
      orgId: user.org_id,
      category: 'collaboration',
      type: mentioned.has(userId) ? 'MENTION' : 'COMMENT',
      title: mentioned.has(userId) ? 'You were mentioned in a file comment' : 'New file comment',
      body: `${actor} commented on ${file.name}${mentioned.has(userId) ? ' and mentioned you' : ''}.`,
      resourceType: 'FILE',
      resourceId: fileId,
      priority: mentioned.has(userId) ? 'HIGH' : 'NORMAL',
    })));
    void this.mailNotice(file.id, file.name, created.id, text, actor, targets, mentioned).catch(() => undefined);
    void this.follows.notifyResourceEvent({ orgId: user.org_id, resourceType: 'FILE', resourceId: fileId, actorUserId: user.sub, action: AuditAction.COMMENT, resourceName: file.name }).catch(() => undefined);
    return created;
  }

  async update(user: AccessTokenPayload, id: string, body: string) {
    const text = this.clean(body);
    const current = await this.owned(user, id);
    return this.prisma.comment.update({ where: { id: current.id }, data: { body: text, editedAt: new Date() }, include: { user: { select: userSelect } } });
  }

  async remove(user: AccessTokenPayload, id: string) {
    const current = await this.owned(user, id);
    const now = new Date();
    await this.prisma.comment.updateMany({ where: { orgId: user.org_id, OR: [{ id: current.id }, { parentId: current.id }] }, data: { deletedAt: now } });
    return { ok: true };
  }

  async setResolved(user: AccessTokenPayload, id: string, resolved: boolean) {
    const current = await this.prisma.comment.findFirst({ where: { id, orgId: user.org_id, deletedAt: null } });
    if (!current) throw new NotFoundException('Comment not found');
    await this.assertComment(user, current.fileId);
    const rootId = threadRootId(current);
    return this.prisma.comment.update({
      where: { id: rootId },
      data: resolved ? { resolvedAt: new Date(), resolvedById: user.sub } : { resolvedAt: null, resolvedById: null },
      include: { user: { select: userSelect }, replies: { where: { deletedAt: null }, include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } } },
    });
  }

  private clean(body: string) {
    const text = String(body || '').trim();
    if (!text || text.length > 5000) throw new ForbiddenException('Invalid comment');
    return text;
  }

  private async assertRead(user: AccessTokenPayload, fileId: string) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, select: { id: true, name: true, ownerId: true } });
    if (!file) throw new NotFoundException('File not found');
    if (!(await this.access.canRead(user, ResourceType.FILE, fileId))) throw new ForbiddenException('You do not have access to this file');
    return file;
  }

  private async assertComment(user: AccessTokenPayload, fileId: string) {
    const file = await this.assertRead(user, fileId);
    if (!(await this.access.canComment(user, ResourceType.FILE, fileId))) throw new ForbiddenException('You do not have permission to comment on this file');
    return file;
  }

  private async owned(user: AccessTokenPayload, id: string) {
    const current = await this.prisma.comment.findFirst({ where: { id, orgId: user.org_id, deletedAt: null } });
    if (!current) throw new NotFoundException('Comment not found');
    const admin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    if (current.userId !== user.sub && !admin) throw new ForbiddenException('Not allowed');
    return current;
  }

  private members(orgId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      select: { user: { select: userSelect } },
    }).then((rows) => rows.map((row) => row.user));
  }

  private async mailNotice(fileId: string, fileName: string, commentId: string, excerpt: string, actor: string, targets: Set<string>, mentioned: Set<string>) {
    if (targets.size === 0) return;
    const people = await this.prisma.user.findMany({ where: { id: { in: [...targets] } }, select: { id: true, email: true } });
    const origin = String(this.config.get('FRONTEND_URL') || '').replace(/\/$/, '');
    const link = origin ? `${origin}/files?file=${encodeURIComponent(fileId)}&comment=${encodeURIComponent(commentId)}` : fileName;
    await Promise.all(people.filter((person) => person.email).map((person) => this.mail.send({
      to: person.email,
      ...commentNoticeEmail({ fileName, actor, excerpt: excerpt.slice(0, 280), link, mentioned: mentioned.has(person.id) }),
    }).catch(() => undefined)));
  }
}
