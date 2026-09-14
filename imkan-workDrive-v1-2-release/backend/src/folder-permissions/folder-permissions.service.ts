import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { OrgRole } from '@prisma/client';

@Injectable()
export class FolderPermissionsService {
  constructor(private readonly prisma: PrismaService) {}
  private assertAdmin(user: AccessTokenPayload){ if(user.role!==OrgRole.ADMIN && user.role!==OrgRole.SUPER_ADMIN) throw new ForbiddenException('Organization admin access required'); }
  async list(user: AccessTokenPayload, folderId: string){
    this.assertAdmin(user);
    const folder=await this.prisma.folder.findFirst({where:{id:folderId,orgId:user.org_id}}); if(!folder) throw new NotFoundException('Folder not found');
    return this.prisma.$queryRawUnsafe<any[]>(`SELECT fp.id,fp.user_id AS userId,fp.group_id AS groupId,fp.access,fp.hidden,fp.created_at AS createdAt, u.name AS userName,u.email AS userEmail,g.name AS groupName FROM folder_permissions fp LEFT JOIN users u ON u.id=fp.user_id LEFT JOIN groups g ON g.id=fp.group_id WHERE fp.org_id=? AND fp.folder_id=? ORDER BY fp.created_at DESC`,user.org_id,folderId);
  }
  async upsert(user: AccessTokenPayload, folderId:string, body:{userId?:string;groupId?:string;access:string;hidden?:boolean}){
    this.assertAdmin(user);
    const folder=await this.prisma.folder.findFirst({where:{id:folderId,orgId:user.org_id}}); if(!folder) throw new NotFoundException('Folder not found');
    if((body.userId && body.groupId)||(!body.userId&&!body.groupId)) throw new ForbiddenException('Provide exactly one subject');
    if(!['NONE','VIEW','COMMENT','EDIT','ORGANIZE'].includes(body.access)) throw new ForbiddenException('Invalid access');
    const id=randomUUID();
    await this.prisma.$executeRawUnsafe(`DELETE FROM folder_permissions WHERE org_id=? AND folder_id=? AND ((user_id IS NOT NULL AND user_id=?) OR (group_id IS NOT NULL AND group_id=?))`,user.org_id,folderId,body.userId??'',body.groupId??'');
    await this.prisma.$executeRawUnsafe(`INSERT INTO folder_permissions (id,org_id,folder_id,user_id,group_id,access,hidden,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))`,id,user.org_id,folderId,body.userId??null,body.groupId??null,body.access,body.hidden??false);
    await this.prisma.auditLog.create({data:{orgId:user.org_id,actorId:user.sub,action:'FOLDER_PERMISSION_CHANGED',resourceType:'FOLDER',resourceId:folderId,metadata:{userId:body.userId,groupId:body.groupId,access:body.access,hidden:body.hidden??false}}});
    return {id,folderId,...body};
  }
  async remove(user: AccessTokenPayload, permissionId:string){ this.assertAdmin(user); const result=await this.prisma.$executeRawUnsafe(`DELETE FROM folder_permissions WHERE id=? AND org_id=?`,permissionId,user.org_id); if(!result) throw new NotFoundException('Permission not found'); return {id:permissionId,deleted:true}; }
}
