import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OfficeEmailProvider, Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { ConnectionsService } from '../connections/connections.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type EmailAttachment = { fileId: string; name: string; mimeType: string; bytes: Buffer };
type SendEmailInput = { to: string[]; subject: string; text: string; html?: string; attachments?: EmailAttachment[]; connectionId?: string };

@Injectable()
export class OfficeEmailService {
  constructor(private readonly prisma: PrismaService, private readonly connections: ConnectionsService, @Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  private assertAdmin(user: AccessTokenPayload) { if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') throw new ForbiddenException('Admin access required'); }
  private validateEmails(values: string[]) { const emails = [...new Set(values.map((v) => String(v).trim().toLowerCase()).filter(Boolean))]; if (!emails.length || emails.length > 50 || emails.some((v) => !/^\S+@\S+\.\S+$/.test(v))) throw new BadRequestException('Invalid email recipient list'); return emails; }

  async getSettings(user: AccessTokenPayload) {
    this.assertAdmin(user);
    const row = await this.prisma.officeEmailSettings.findUnique({ where: { orgId: user.org_id } });
    if (!row) return { configured: false, enabled: false, provider: null, connectionId: '', fromEmail: '', fromName: '' };
    return { configured: true, enabled: row.enabled, provider: row.provider, connectionId: row.connectionId, fromEmail: row.fromEmail, fromName: row.fromName ?? '' };
  }

  async updateSettings(user: AccessTokenPayload, input: Record<string, unknown>) {
    this.assertAdmin(user);
    const provider = String(input.provider ?? '').toUpperCase() as OfficeEmailProvider;
    if (![OfficeEmailProvider.SENDGRID, OfficeEmailProvider.GMAIL].includes(provider)) throw new BadRequestException('Email provider must be SENDGRID or GMAIL');
    const connectionId = String(input.connectionId ?? '').trim();
    const fromEmail = String(input.fromEmail ?? '').trim().toLowerCase();
    const fromName = String(input.fromName ?? '').trim().slice(0, 160);
    if (!connectionId) throw new BadRequestException('Email connection is required');
    if (!/^\S+@\S+\.\S+$/.test(fromEmail)) throw new BadRequestException('A valid from email is required');
    const connection = await this.connections.get(user, connectionId);
    if (connection.status !== 'ACTIVE') throw new BadRequestException('Email connection is not active');
    if (provider === OfficeEmailProvider.SENDGRID && connection.provider !== 'sendgrid') throw new BadRequestException('SendGrid email requires a SendGrid connection');
    if (provider === OfficeEmailProvider.GMAIL && connection.provider !== 'google') throw new BadRequestException('Gmail email requires a Google OAuth connection');
    const row = await this.prisma.officeEmailSettings.upsert({ where: { orgId: user.org_id }, create: { id: randomUUID(), orgId: user.org_id, provider, connectionId, fromEmail, fromName: fromName || null, enabled: input.enabled !== false, updatedById: user.sub }, update: { provider, connectionId, fromEmail, fromName: fromName || null, enabled: input.enabled !== false, updatedById: user.sub } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'OFFICE_EMAIL_SETTINGS_UPDATED', resourceType: 'OFFICE_EMAIL_SETTINGS', resourceId: row.id, metadata: { provider, connectionId, fromEmail } as Prisma.InputJsonValue } }).catch(() => undefined);
    return this.getSettings(user);
  }

  async testSettings(user: AccessTokenPayload, to?: string) {
    this.assertAdmin(user);
    const settings = await this.prisma.officeEmailSettings.findUnique({ where: { orgId: user.org_id } });
    if (!settings || !settings.enabled) throw new BadRequestException('Office email is not configured or enabled');
    const recipient = this.validateEmails([to || user.email])[0];
    await this.sendWithSettings(user, settings, { to: [recipient], subject: 'IMKAN Office email test', text: 'This is a test email from IMKAN Office.', html: '<p>This is a test email from <strong>IMKAN Office</strong>.</p>' });
    return { ok: true, recipient };
  }

  async send(user: AccessTokenPayload, input: SendEmailInput) {
    const settings = await this.prisma.officeEmailSettings.findUnique({ where: { orgId: user.org_id } });
    if (!settings || !settings.enabled) throw new BadRequestException('Office email is not configured or enabled');
    const to = this.validateEmails(input.to);
    const subject = String(input.subject ?? '').trim().slice(0, 500); const text = String(input.text ?? '').slice(0, 100000); const html = input.html ? String(input.html).slice(0, 200000) : undefined;
    if (!subject || !text) throw new BadRequestException('Email subject and body are required');
    await this.sendWithSettings(user, settings, { ...input, to, subject, text, html });
    return { ok: true, recipients: to.length };
  }

  private async sendWithSettings(user: AccessTokenPayload, settings: { provider: OfficeEmailProvider; connectionId: string; fromEmail: string; fromName: string | null }, input: Omit<SendEmailInput, 'connectionId'>) {
    if (settings.provider === OfficeEmailProvider.SENDGRID) {
      const payload: any = { personalizations: [{ to: input.to.map((email) => ({ email })) }], from: { email: settings.fromEmail, ...(settings.fromName ? { name: settings.fromName } : {}) }, subject: input.subject, content: [{ type: 'text/plain', value: input.text }] };
      if (input.html) payload.content.push({ type: 'text/html', value: input.html });
      if (input.attachments?.length) payload.attachments = input.attachments.map((a) => ({ content: a.bytes.toString('base64'), filename: a.name, type: a.mimeType || 'application/octet-stream', disposition: 'attachment' }));
      const result = await this.connections.executeWorkflowRest(user, settings.connectionId, 'POST', '/v3/mail/send', payload, undefined, { responseMode: 'TEXT', maxResponseBytes: 4000, retries: 2, idempotencyKey: `email:${randomUUID()}`, actionType: 'office_email_send' } as any);
      if (!result.ok) throw new BadRequestException(`Email provider returned HTTP ${result.status}`);
      return result;
    }
    const boundary = `imkan_${randomUUID().replace(/-/g, '')}`;
    const lines: string[] = [`From: ${settings.fromName ? `${settings.fromName} <${settings.fromEmail}>` : settings.fromEmail}`, `To: ${input.to.join(', ')}`, `Subject: ${this.encodeHeader(input.subject)}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', input.text];
    if (input.html) lines.push(`--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', input.html);
    for (const a of input.attachments ?? []) lines.push(`--${boundary}`, `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${this.safeFilename(a.name)}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${this.safeFilename(a.name)}"`, '', a.bytes.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '');
    lines.push(`--${boundary}--`, '');
    const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const result = await this.connections.executeWorkflowRest(user, settings.connectionId, 'POST', '/gmail/v1/users/me/messages/send', { raw }, undefined, { responseMode: 'JSON', maxResponseBytes: 10000, retries: 2, idempotencyKey: `email:${randomUUID()}`, actionType: 'office_email_send' } as any);
    if (!result.ok) throw new BadRequestException(`Gmail returned HTTP ${result.status}`);
    return result;
  }

  private encodeHeader(value: string) { return /[^\x00-\x7F]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : value; }
  private safeFilename(value: string) { return String(value).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'attachment'; }

  async loadAttachment(user: AccessTokenPayload, fileId: string): Promise<EmailAttachment> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, orgId: user.org_id, deletedAt: null }, select: { id: true, name: true, mimeType: true, storageKey: true, versions: { where: { status: 'ACTIVE' }, orderBy: { versionNumber: 'desc' }, take: 1, include: { storageObject: { select: { storageKey: true } } } } } });
    if (!file) throw new NotFoundException('Attachment file not found');
    const storageKey = file.versions[0]?.storageObject.storageKey ?? file.storageKey;
    if (!storageKey) throw new NotFoundException('Attachment storage is unavailable');
    const bytes = await this.storage.readStoredObject(storageKey);
    return { fileId: file.id, name: file.name, mimeType: file.mimeType || 'application/octet-stream', bytes };
  }
}
