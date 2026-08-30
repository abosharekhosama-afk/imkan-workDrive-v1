import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamFolderRole } from '@prisma/client';
import type { AccessTokenPayload } from '../auth/jwt.types';
import {
  PermissionService,
  type AccessibleResource,
} from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { CreateFolderInput } from './create-folder.schema';
import type { BulkFolderOperationInput, FolderMoveCopyInput } from './operation.schema';
import { randomUUID } from 'node:crypto';

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}


  async move(user: AccessTokenPayload, id: string, input: FolderMoveCopyInput) {
    const folder = await this.requireMutableFolder(user, id);
    if (input.destinationFolderId === id) throw new BadRequestException('A folder cannot be moved into itself');
    if (input.destinationFolderId) await this.assertDestination(user, input.destinationFolderId, id);
    const updated = await this.prisma.folder.update({ where: { id }, data: { parentId: input.destinationFolderId } });
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FOLDER_MOVED', resourceType: 'FOLDER', resourceId: id } });
    return updated;
  }

  async copy(user: AccessTokenPayload, id: string, input: FolderMoveCopyInput) {
    const folder = await this.requireMutableFolder(user, id);
    if (input.destinationFolderId) await this.assertDestination(user, input.destinationFolderId, id);
    const destination = input.destinationFolderId ? await this.prisma.folder.findFirst({ where: { id: input.destinationFolderId }, select: { teamFolderId: true } }) : null;
    const targetTeamFolderId = destination?.teamFolderId ?? null;
    const copyTree = async (sourceId: string, parentId: string | null): Promise<string> => {
      const source = await this.prisma.folder.findFirst({ where: { id: sourceId }, include: { files: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } }, children: true } });
      if (!source) throw new NotFoundException('Folder not found');
      const newId = randomUUID();
      await this.prisma.folder.create({ data: { id: newId, orgId: user.org_id, teamFolderId: targetTeamFolderId, parentId, name: source.name, ownerId: user.sub } });
      for (const file of source.files) { const version=file.versions[0]; if(!version) continue; const newFileId=randomUUID(); await this.prisma.file.create({data:{id:newFileId,orgId:user.org_id,folderId:newId,name:file.name,originalName:file.originalName,extension:file.extension,mimeType:file.mimeType,fileType:file.fileType,size:file.size,sha256Hash:file.sha256Hash,ownerId:user.sub}}); await this.prisma.fileVersion.create({data:{id:randomUUID(),orgId:user.org_id,fileId:newFileId,versionNumber:1,storageObjectId:version.storageObjectId,size:version.size,mimeType:version.mimeType,extension:version.extension,sha256Hash:version.sha256Hash,uploadedById:user.sub}}); }
      for (const child of source.children) await copyTree(child.id,newId);
      return newId;
    };
    const copiedId=await copyTree(folder.id,input.destinationFolderId);
    await this.prisma.auditLog.create({ data: { orgId: user.org_id, actorId: user.sub, action: 'FOLDER_COPIED', resourceType: 'FOLDER', resourceId: copiedId } });
    return this.prisma.folder.findUnique({where:{id:copiedId}});
  }

  async permanentDelete(user: AccessTokenPayload, id: string) {
    const folder = await this.requireMutableFolder(user, id);
    const descendants = await this.collectDescendantFiles(id);
    const doomedIds = descendants.map((file) => file.id);
    const objectIds = [...new Set(descendants.flatMap((file) => file.versions.map((version) => version.storageObjectId)))];
    for (const objectId of objectIds) {
      const externalRefs = await this.prisma.fileVersion.count({ where: { storageObjectId: objectId, fileId: { notIn: doomedIds } } });
      if (externalRefs > 0) continue;
      const object = await this.prisma.storageObject.findUnique({ where: { id: objectId }, select: { storageKey: true } });
      if (object) await this.storage.deleteStoredObject(object.storageKey);
    }
    for (const file of descendants) { await this.prisma.file.delete({where:{id:file.id}}); }
    await this.prisma.folder.delete({where:{id}});
    await this.prisma.auditLog.create({ data:{orgId:user.org_id,actorId:user.sub,action:'FOLDER_PERMANENTLY_DELETED',resourceType:'FOLDER',resourceId:id} });
    return {id:folder.id,deleted:true,permanent:true};
  }

  async bulkMove(user: AccessTokenPayload, input: BulkFolderOperationInput) { const moved:string[]=[]; for(const id of input.ids){try{await this.move(user,id,{destinationFolderId:input.destinationFolderId??null});moved.push(id);}catch{}} return {moved}; }
  async bulkTrash(user: AccessTokenPayload, input: BulkFolderOperationInput) { const deleted:string[]=[]; for(const id of input.ids){try{await this.remove(user,id);deleted.push(id);}catch{}} return {deleted}; }

  private async requireMutableFolder(user: AccessTokenPayload,id:string){ const folder=await this.prisma.folder.findFirst({where:{id}}); if(!folder||folder.orgId!==user.org_id) throw new NotFoundException('Folder not found'); const resource=await this.toFolderAccessResource(user,folder); if(!this.permissions.canRead(user,resource)) throw new NotFoundException('Folder not found'); if(!this.permissions.canWrite(user,resource)) throw new ForbiddenException('Not allowed to modify this folder'); return folder; }
  private async assertDestination(user:AccessTokenPayload,id:string,movingId:string){ if(id===movingId) throw new BadRequestException('Invalid destination'); const destination=await this.prisma.folder.findFirst({where:{id}}); if(!destination||destination.orgId!==user.org_id) throw new NotFoundException('Destination folder not found'); if(!(await this.canReadFolder(user,destination))||!this.permissions.canWrite(user,await this.toFolderAccessResource(user,destination))) throw new ForbiddenException('Not allowed to use destination folder'); let current=destination.parentId; while(current){ if(current===movingId) throw new BadRequestException('Cannot move a folder into its descendant'); const p=await this.prisma.folder.findFirst({where:{id:current},select:{parentId:true}}); current=p?.parentId??null; } }
  private async collectDescendantFiles(rootId:string){ const ids:string[]=[]; const walk=async(id:string)=>{ ids.push(id); const children=await this.prisma.folder.findMany({where:{parentId:id},select:{id:true}}); for(const c of children) await walk(c.id); }; await walk(rootId); return this.prisma.file.findMany({where:{folderId:{in:ids}},include:{versions:true}}); }

  /**
   * Aggregates subtree metrics for the given root folders: total active file
   * size (recursive) and the latest contained-file updatedAt. Returned as two
   * plain maps keyed by folder id so listings can show folder Size / Modified
   * without mutating the `FolderRecord` shape used elsewhere.
   */
  private async folderTreeAggregates(rootIds:string[]):Promise<{ folderSizes:Record<string,number>; folderUpdatedAt:Record<string,string|null> }>{
    const folderSizes:Record<string,number>={}; const folderUpdatedAt:Record<string,string|null>={};
    if(rootIds.length===0) return { folderSizes, folderUpdatedAt };
    const visited=new Set(rootIds); const parentOf=new Map<string,string|null>();
    let frontier=[...rootIds];
    while(frontier.length>0){
      const children=await this.prisma.folder.findMany({where:{parentId:{in:frontier}},select:{id:true,parentId:true}});
      const next:string[]=[];
      for(const c of children){ if(visited.has(c.id)) continue; visited.add(c.id); parentOf.set(c.id,c.parentId); next.push(c.id); }
      frontier=next;
    }
    const directSize=new Map<string,number>(); const directUpdated=new Map<string,string|null>();
    if(visited.size>0){
      const files=await this.prisma.file.findMany({where:{folderId:{in:[...visited]},deletedAt:null},select:{folderId:true,size:true,updatedAt:true}});
      for(const f of files){
        const folderId=f.folderId; if(!folderId) continue;
        directSize.set(folderId,(directSize.get(folderId)??0)+Number(f.size??0));
        const iso=typeof f.updatedAt==='string'?f.updatedAt:new Date(f.updatedAt).toISOString();
        const prev=directUpdated.get(folderId) ?? null;
        if(!prev||iso>prev) directUpdated.set(folderId,iso);
      }
    }
    const total=new Map<string,number>(); const latest=new Map<string,string|null>();
    for(const id of visited){ total.set(id,directSize.get(id)??0); latest.set(id,directUpdated.get(id)??null); }
    const childrenByParent=new Map<string,string[]>();
    for(const [child,parent] of parentOf){ if(!parent) continue; const arr=childrenByParent.get(parent)??[]; arr.push(child); childrenByParent.set(parent,arr); }
    const merge=(id:string):void=>{ const kids=childrenByParent.get(id)??[]; for(const k of kids){ merge(k); const kSize=total.get(k)??0; total.set(id,(total.get(id)??0)+kSize); const kl=latest.get(k)??null; const il=latest.get(id)??null; if(kl&&(!il||kl>il)) latest.set(id,kl); } };
    for(const id of rootIds) merge(id);
    for(const id of rootIds){ folderSizes[id]=total.get(id)??0; folderUpdatedAt[id]=latest.get(id)??null; }
    return { folderSizes, folderUpdatedAt };
  }

  async create(user: AccessTokenPayload, input: CreateFolderInput) {
    const teamFolderId = await this.resolveCreateTeamFolderId(user, input);
    return this.prisma.folder.create({
      data: {
        name: input.name,
        parentId: input.parentId,
        teamFolderId,
        ownerId: user.sub,
        orgId: user.org_id,
      },
    });
  }

  async getMyFolder(user: AccessTokenPayload) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.sub, organizationId: user.org_id, status: 'ACTIVE' },
      select: { personalFolderId: true },
    });
    if (!membership?.personalFolderId) {
      throw new NotFoundException('Personal folder not found');
    }
    return this.getById(user, membership.personalFolderId);
  }

  async listContents(user: AccessTokenPayload, parentId?: string) {
    if (parentId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: parentId },
      });
      if (!parent || !(await this.canReadFolder(user, parent))) {
        throw new NotFoundException('Folder not found');
      }
    }
    const folderWhere = parentId ? { parentId } : { parentId: null };
    const fileWhere = parentId
      ? { folderId: parentId, deletedAt: null }
      : { folderId: null, deletedAt: null };
    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { ...folderWhere, orgId: user.org_id },
        include: { owner: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      this.prisma.file.findMany({
        where: { ...fileWhere, orgId: user.org_id },
        include: { owner: { select: { id: true, name: true, email: true, avatarUrl: true } }, folder: { select: { teamFolderId: true } } },
      }),
    ]);
    const visibleFolders: typeof folders = [];
    for (const folder of folders) {
      if (await this.canReadFolder(user, folder)) {
        visibleFolders.push(folder);
      }
    }
    const visibleFiles: typeof files = [];
    for (const file of files) {
      if (await this.canReadFile(user, file)) visibleFiles.push(file);
    }
    const roots = visibleFolders.map((folder) => folder.id);
    const aggregates = await this.folderTreeAggregates(roots);
    return { folders: visibleFolders, files: visibleFiles, ...aggregates };
  }

  async getById(user: AccessTokenPayload, id: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    if (!folder || !(await this.canReadFolder(user, folder))) {
      throw new NotFoundException('Folder not found');
    }
    const contents = await this.listContents(user, id);
    return { ...folder, ...contents };
  }

  async rename(user: AccessTokenPayload, id: string, name: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id } });
    if (!folder || folder.orgId !== user.org_id) {
      throw new NotFoundException('Folder not found');
    }
    const resource = await this.toFolderAccessResource(user, folder);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('Folder not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException('Not allowed to rename this folder');
    }
    const updated = await this.prisma.folder.update({
      where: { id: folder.id },
      data: { name },
    });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FOLDER_RENAMED',
        resourceType: 'FOLDER',
        resourceId: folder.id,
      },
    });
    return updated;
  }

  async remove(user: AccessTokenPayload, id: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id } });
    if (!folder || folder.orgId !== user.org_id) {
      throw new NotFoundException('Folder not found');
    }
    const resource = await this.toFolderAccessResource(user, folder);
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('Folder not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException('Not allowed to delete this folder');
    }
    const child = await this.prisma.folder.findFirst({
      where: { parentId: id },
    });
    const file = await this.prisma.file.findFirst({
      where: { folderId: id, deletedAt: null },
    });
    if (child || file) {
      throw new BadRequestException('Folder is not empty');
    }
    await this.prisma.folder.delete({ where: { id: folder.id } });
    await this.prisma.auditLog.create({
      data: {
        orgId: user.org_id,
        actorId: user.sub,
        action: 'FOLDER_DELETED',
        resourceType: 'FOLDER',
        resourceId: folder.id,
      },
    });
    return { id: folder.id, deleted: true };
  }

  private async resolveCreateTeamFolderId(
    user: AccessTokenPayload,
    input: CreateFolderInput,
  ): Promise<string | undefined> {
    let teamFolderId = input.teamFolderId;
    if (input.parentId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: input.parentId },
      });
      if (!parent || parent.orgId !== user.org_id) {
        throw new NotFoundException('Folder not found');
      }
      const inherited = parent.teamFolderId ?? null;
      if (input.teamFolderId && inherited !== input.teamFolderId) {
        throw new BadRequestException('teamFolderId does not match parent');
      }
      teamFolderId = inherited ?? undefined;
    }
    if (teamFolderId) {
      await this.assertCanAttachTeamFolder(user, teamFolderId);
    }
    return teamFolderId;
  }

  private async assertCanAttachTeamFolder(
    user: AccessTokenPayload,
    teamFolderId: string,
  ) {
    const teamFolder = await this.prisma.teamFolder.findFirst({
      where: { id: teamFolderId },
    });
    if (!teamFolder || teamFolder.orgId !== user.org_id) {
      throw new NotFoundException('Team Folder not found');
    }
    //const teamFolderRole = await this.resolveCallerRole(user, teamFolder.id);
    const resource = await this.toTeamFolderResource(
    user,
    teamFolder.orgId,
    teamFolder.id,
  );
    if (!this.permissions.canRead(user, resource)) {
      throw new NotFoundException('Team Folder not found');
    }
    if (!this.permissions.canWrite(user, resource)) {
      throw new ForbiddenException(
        'Not allowed to create a folder in this Team Folder',
      );
    }
  }

  private async resolveCallerRole(
    user: AccessTokenPayload,
    teamFolderId: string,
  ): Promise<TeamFolderRole | null> {
    const membership = await this.prisma.teamFolderMember.findFirst({
      where: { teamFolderId, userId: user.sub },
    });
    return membership?.role ?? null;
  }

  private async toTeamFolderResource(
  user: AccessTokenPayload,
  orgId: string,
  teamFolderId: string,
): Promise<AccessibleResource> {
  const [teamFolder, teamFolderRole] = await Promise.all([
    this.prisma.teamFolder.findFirst({
      where: { id: teamFolderId, orgId },
      select: { isPublicToOrg: true },
    }),
    this.resolveCallerRole(user, teamFolderId),
  ]);

  return {
    orgId,
    ownerId: teamFolderId,
    teamFolderId,
    teamFolderRole,
    isPublicToOrg: teamFolder?.isPublicToOrg ?? false,
  };
}

  private async toFolderAccessResource(
    user: AccessTokenPayload,
    folder: { orgId: string; ownerId: string; teamFolderId?: string | null },
  ): Promise<AccessibleResource> {
    if (!folder.teamFolderId) return this.toAccessibleResource(folder);
    const teamFolder = await this.prisma.teamFolder.findFirst({
      where: { id: folder.teamFolderId, orgId: folder.orgId },
      select: { isPublicToOrg: true },
    });
    const teamFolderRole = await this.resolveCallerRole(user, folder.teamFolderId);
    return {
      orgId: folder.orgId,
      ownerId: folder.teamFolderId,
      teamFolderId: folder.teamFolderId,
      teamFolderRole,
      isPublicToOrg: teamFolder?.isPublicToOrg ?? false,
    };
  }

  private async canReadFile(
    user: AccessTokenPayload,
    file: { orgId: string; ownerId: string; folder?: { teamFolderId: string | null } | null },
  ): Promise<boolean> {
    if (file.orgId !== user.org_id) return false;
    const teamFolderId = file.folder?.teamFolderId ?? null;
    if (teamFolderId) {
      return this.permissions.canRead(user, await this.toTeamFolderResource(user, file.orgId, teamFolderId));
    }
    if (this.permissions.canRead(user, this.toAccessibleResource(file))) return true;
    const share = await this.prisma.fileShare.findFirst({
      where: {
        fileId: (file as any).id,
        orgId: user.org_id,
        status: 'ACTIVE',
        recipients: { some: { userId: user.sub, orgId: user.org_id } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    return !!share;
  }

  private async canReadFolder(
    user: AccessTokenPayload,
    folder: { orgId: string; ownerId: string; teamFolderId?: string | null },
  ): Promise<boolean> {
    if (folder.orgId !== user.org_id) return false;
    if (!folder.teamFolderId) return this.permissions.canRead(user, this.toAccessibleResource(folder));
    const teamFolder = await this.prisma.teamFolder.findFirst({
      where: { id: folder.teamFolderId, orgId: folder.orgId },
      select: { isPublicToOrg: true },
    });
    const teamFolderRole = await this.resolveCallerRole(user, folder.teamFolderId);
    return this.permissions.canRead(user, {
      orgId: folder.orgId,
      ownerId: folder.teamFolderId,
      teamFolderId: folder.teamFolderId,
      teamFolderRole,
      isPublicToOrg: teamFolder?.isPublicToOrg ?? false,
    });
  }

  private toAccessibleResource(folder: {
    orgId: string;
    ownerId: string;
    teamFolderId?: string | null;
  }): AccessibleResource {
    return {
      orgId: folder.orgId,
      ownerId: folder.ownerId,
      teamFolderId: folder.teamFolderId ?? null,
    };
  }
}
