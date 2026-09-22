import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
@Injectable()
export class CollaborationService { constructor(private readonly prisma: PrismaService) {}
 async overview(user: AccessTokenPayload, limit=50) { const take=Math.min(Math.max(limit,1),100); const [notifications,activities,comments]=await Promise.all([
  this.prisma.notification.findMany({where:{orgId:user.org_id,userId:user.sub},orderBy:{createdAt:'desc'},take}),
  this.prisma.fileActivity.findMany({where:{orgId:user.org_id,userId:user.sub},orderBy:{createdAt:'desc'},take,include:{file:{select:{id:true,name:true}}}}),
  this.prisma.comment.findMany({where:{orgId:user.org_id,userId:user.sub,deletedAt:null},orderBy:{createdAt:'desc'},take,include:{file:{select:{id:true,name:true}}}}),
 ]); return {notifications,activities,comments}; }
}
