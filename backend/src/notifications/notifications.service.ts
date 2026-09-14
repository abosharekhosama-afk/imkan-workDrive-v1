import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(user: AccessTokenPayload) { return this.prisma.notification.findMany({ where:{orgId:user.org_id,userId:user.sub}, orderBy:{createdAt:'desc'}, take:100 }); }
  async unreadCount(user: AccessTokenPayload) { return { count: await this.prisma.notification.count({where:{orgId:user.org_id,userId:user.sub,readAt:null}}) }; }
  async markRead(user: AccessTokenPayload,id:string) { const n=await this.prisma.notification.updateMany({where:{id,orgId:user.org_id,userId:user.sub},data:{readAt:new Date()}}); if(!n.count) throw new NotFoundException('Notification not found'); return {ok:true}; }
  async markAllRead(user: AccessTokenPayload) { await this.prisma.notification.updateMany({where:{orgId:user.org_id,userId:user.sub,readAt:null},data:{readAt:new Date()}}); return {ok:true}; }
}
