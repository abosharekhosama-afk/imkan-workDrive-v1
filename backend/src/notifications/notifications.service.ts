import { Injectable, NotFoundException } from '@nestjs/common';
import { Subject, filter } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

export type OfficeNotificationCategory = 'collaboration' | 'templateAutomation' | 'exports' | 'compliance' | 'externalStorage';
export type OfficeNotificationInput = {
  userId: string;
  orgId: string;
  category: OfficeNotificationCategory;
  title: string;
  body?: string | null;
  resourceType?: 'FILE' | 'FOLDER' | null;
  resourceId?: string | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
};

const streams = new Subject<{ userId: string; notification: any }>();

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AccessTokenPayload) {
    return this.prisma.notification.findMany({ where:{orgId:user.org_id,userId:user.sub}, orderBy:{createdAt:'desc'}, take:100 });
  }
  async unreadCount(user: AccessTokenPayload) { return { count: await this.prisma.notification.count({where:{orgId:user.org_id,userId:user.sub,readAt:null}}) }; }
  async markRead(user: AccessTokenPayload,id:string) { const n=await this.prisma.notification.updateMany({where:{id,orgId:user.org_id,userId:user.sub},data:{readAt:new Date()}}); if(!n.count) throw new NotFoundException('Notification not found'); return {ok:true}; }
  async markAllRead(user: AccessTokenPayload) { await this.prisma.notification.updateMany({where:{orgId:user.org_id,userId:user.sub,readAt:null},data:{readAt:new Date()}}); return {ok:true}; }

  async getOfficePreferences(user: AccessTokenPayload) {
    return this.prisma.officeNotificationPreference.upsert({
      where: { orgId_userId: { orgId: user.org_id, userId: user.sub } },
      create: { orgId: user.org_id, userId: user.sub },
      update: {},
    });
  }

  async updateOfficePreferences(user: AccessTokenPayload, input: Partial<Record<OfficeNotificationCategory, boolean>>) {
    const data: Record<string, boolean> = {};
    for (const key of ['collaboration','templateAutomation','exports','compliance','externalStorage'] as OfficeNotificationCategory[]) {
      if (typeof input[key] === 'boolean') data[key] = input[key] as boolean;
    }
    return this.prisma.officeNotificationPreference.upsert({
      where: { orgId_userId: { orgId: user.org_id, userId: user.sub } },
      create: { orgId: user.org_id, userId: user.sub, ...data },
      update: data,
    });
  }

  async createOfficeNotification(input: OfficeNotificationInput) {
    const preferences = await this.prisma.officeNotificationPreference.findUnique({ where: { orgId_userId: { orgId: input.orgId, userId: input.userId } } });
    if (preferences && preferences[input.category] === false) return null;
    const row = await this.prisma.notification.create({ data: {
      orgId: input.orgId, userId: input.userId, type: 'SYSTEM', title: input.title, body: input.body ?? null,
      priority: input.priority ?? 'NORMAL', resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null,
    }});
    streams.next({ userId: input.userId, notification: row });
    return row;
  }

  streamForUser(userId: string) { return streams.asObservable().pipe(filter(event => event.userId === userId)); }
}
