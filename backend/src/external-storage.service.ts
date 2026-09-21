import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExternalStorageStatus, ConnectionAuthType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from './auth/jwt.types';
import { PrismaService } from './prisma/prisma.service';
import { ConnectionsService } from './connections/connections.service';
import { OfficeService } from './office/office.service';
import { NotificationsService } from './notifications/notifications.service';

const PROVIDERS = new Set(['google', 'microsoft', 'dropbox']);
const MAX_ITEMS = 100;

@Injectable()
export class ExternalStorageService {
  constructor(private readonly prisma: PrismaService, private readonly connections: ConnectionsService, private readonly office: OfficeService, private readonly notifications: NotificationsService) {}

  private assertProvider(provider: string) { if (!PROVIDERS.has(provider)) throw new BadRequestException('Unsupported external storage provider'); }
  private serialize(row: any) { return { id: row.id, provider: row.provider, name: row.name, connectionId: row.connectionId, rootPath: row.rootPath, readEnabled: row.readEnabled, writeEnabled: row.writeEnabled, status: row.status, lastTestedAt: row.lastTestedAt, lastTestOk: row.lastTestOk, lastTestMessage: row.lastTestMessage, createdAt: row.createdAt, updatedAt: row.updatedAt }; }

  async list(user: AccessTokenPayload) {
    const rows = await this.prisma.externalStorageMount.findMany({ where: { orgId: user.org_id, userId: user.sub }, orderBy: { updatedAt: 'desc' } });
    return rows.map(r => this.serialize(r));
  }

  async create(user: AccessTokenPayload, input: { name: string; connectionId: string; provider: string; rootPath?: string; readEnabled?: boolean; writeEnabled?: boolean }) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 255) throw new BadRequestException('Invalid mount name');
    this.assertProvider(input.provider);
    const connection = await this.prisma.connection.findFirst({ where: { id: input.connectionId, orgId: user.org_id, OR: [{ ownerId: user.sub }, { visibility: 'ORGANIZATION' }, { shares: { some: { userId: user.sub } } }] }, select: { id: true, provider: true, authType: true, status: true } });
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.provider !== input.provider || connection.authType !== ConnectionAuthType.OAUTH2) throw new BadRequestException('Mount requires a matching OAuth storage connection');
    if (!PROVIDERS.has(connection.provider)) throw new BadRequestException('Connection provider is not supported for external storage');
    const row = await this.prisma.externalStorageMount.create({ data: { id: randomUUID(), orgId: user.org_id, userId: user.sub, connectionId: connection.id, provider: input.provider, name, rootPath: input.rootPath?.trim() || null, readEnabled: input.readEnabled !== false, writeEnabled: input.writeEnabled === true } });
    return this.serialize(row);
  }

  async update(user: AccessTokenPayload, id: string, input: { name?: string; rootPath?: string | null; readEnabled?: boolean; writeEnabled?: boolean; status?: ExternalStorageStatus }) {
    const row = await this.prisma.externalStorageMount.findFirst({ where: { id, orgId: user.org_id, userId: user.sub } });
    if (!row) throw new NotFoundException('External storage mount not found');
    if (input.writeEnabled === true && input.readEnabled === false) throw new BadRequestException('Write access requires read access');
    const updated = await this.prisma.externalStorageMount.update({ where: { id }, data: { ...(input.name !== undefined ? { name: String(input.name).trim() } : {}), ...(input.rootPath !== undefined ? { rootPath: input.rootPath?.trim() || null } : {}), ...(typeof input.readEnabled === 'boolean' ? { readEnabled: input.readEnabled } : {}), ...(typeof input.writeEnabled === 'boolean' ? { writeEnabled: input.writeEnabled } : {}), ...(input.status ? { status: input.status } : {}) } });
    return this.serialize(updated);
  }

  async remove(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.externalStorageMount.findFirst({ where: { id, orgId: user.org_id, userId: user.sub }, select: { id: true } });
    if (!row) throw new NotFoundException('External storage mount not found');
    await this.prisma.externalStorageMount.delete({ where: { id } });
    return { ok: true };
  }

  private async mount(user: AccessTokenPayload, id: string) {
    const row = await this.prisma.externalStorageMount.findFirst({ where: { id, orgId: user.org_id, userId: user.sub } });
    if (!row) throw new NotFoundException('External storage mount not found');
    if (row.status !== ExternalStorageStatus.ACTIVE) throw new ForbiddenException('External storage mount is not active');
    return row;
  }

  private async token(user: AccessTokenPayload, connectionId: string) {
    const { row, secrets } = await this.connections.getSecretsForExecution(user, connectionId);
    if (row.authType !== ConnectionAuthType.OAUTH2 || !secrets.accessToken) throw new ForbiddenException('Storage connection requires OAuth authentication');
    return secrets.accessToken;
  }

  private async request(user: AccessTokenPayload, mount: any, method: string, url: string, init: RequestInit = {}) {
    const token = await this.token(user, mount.connectionId);
    const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, method, headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    let body: any = text; try { body = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new BadRequestException(`External storage returned HTTP ${response.status}`);
    return body;
  }

  async test(user: AccessTokenPayload, id: string) {
    const mount = await this.mount(user, id);
    try { await this.listRemote(user, mount); await this.prisma.externalStorageMount.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: true, lastTestMessage: 'Connection and storage access verified', status: ExternalStorageStatus.ACTIVE } }); return { ok: true, message: 'Connection and storage access verified' }; }
    catch (e) { const message = e instanceof Error ? e.message.slice(0, 500) : 'External storage test failed'; await this.prisma.externalStorageMount.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: false, lastTestMessage: message, status: ExternalStorageStatus.ERROR } }); return { ok: false, message }; }
  }

  async listRemote(user: AccessTokenPayload, mount: any, path?: string) {
    if (!mount.readEnabled) throw new ForbiddenException('Read access is disabled for this mount');
    const target = path?.trim() || mount.rootPath || '';
    if (mount.provider === 'google') {
      const parent = target || 'root';
      const q = encodeURIComponent(`'${parent}' in parents and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${MAX_ITEMS}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,parents)`;
      const body = await this.request(user, mount, 'GET', url); return { provider: mount.provider, path: target, items: (body?.files ?? []).slice(0, MAX_ITEMS) };
    }
    if (mount.provider === 'microsoft') {
      const encoded = target ? `/me/drive/items/${encodeURIComponent(target)}/children` : '/me/drive/root/children';
      const url = `https://graph.microsoft.com/v1.0${encoded}?$top=${MAX_ITEMS}&$select=id,name,size,lastModifiedDateTime,folder,file,webUrl`;
      const body = await this.request(user, mount, 'GET', url); return { provider: mount.provider, path: target, items: (body?.value ?? []).slice(0, MAX_ITEMS) };
    }
    const body = await this.request(user, mount, 'POST', 'https://api.dropboxapi.com/2/files/list_folder', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: target }) });
    return { provider: mount.provider, path: target, items: (body?.entries ?? []).slice(0, MAX_ITEMS) };
  }

  async browse(user: AccessTokenPayload, id: string, path?: string) { const mount = await this.mount(user, id); return this.listRemote(user, mount, path); }

  async exportOffice(user: AccessTokenPayload, id: string, fileId: string, format: 'docx'|'xlsx'|'pptx', remoteName?: string, remoteParentId?: string) {
    const mount = await this.mount(user, id); if (!mount.writeEnabled) throw new ForbiddenException('Write access is disabled for this mount');
    const exported = await this.office.exportFile(user, fileId, format); const bytes = Buffer.from(exported.dataBase64, 'base64'); const name = String(remoteName || exported.filename).trim() || exported.filename;
    if (mount.provider === 'microsoft') {
      const parent = remoteParentId || mount.rootPath;
      const url = parent ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parent)}:/${encodeURIComponent(name)}:/content` : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`;
      const result = await this.request(user, mount, 'PUT', url, { headers: { 'Content-Type': exported.mimeType }, body: bytes }); await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'externalStorage', title: 'Office file exported to external storage', body: `${name} was exported to ${mount.name}.`, resourceType: 'FILE', resourceId: fileId }).catch(() => undefined); return result;
    }
    if (mount.provider === 'dropbox') {
      const path = `${remoteParentId || mount.rootPath || ''}/${name}`.replace(/\/+/g, '/').replace(/^\/?!/, '/');
      const result = await this.request(user, mount, 'POST', 'https://content.dropboxapi.com/2/files/upload', { headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: false }) }, body: bytes }); await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'externalStorage', title: 'Office file exported to external storage', body: `${name} was exported to ${mount.name}.`, resourceType: 'FILE', resourceId: fileId }).catch(() => undefined); return result;
    }
    const metadata = JSON.stringify({ name, ...(remoteParentId || mount.rootPath ? { parents: [remoteParentId || mount.rootPath] } : {}) });
    const token = await this.token(user, mount.connectionId);
    const boundary = `imkan-${randomUUID()}`; const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${exported.mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new BadRequestException(`Google Drive upload returned HTTP ${response.status}`);
    const result = await response.json();
    await this.notifications.createOfficeNotification({ userId: user.sub, orgId: user.org_id, category: 'externalStorage', title: 'Office file exported to external storage', body: `${name} was exported to ${mount.name}.`, resourceType: 'FILE', resourceId: fileId }).catch(() => undefined);
    return result;
  }
}
