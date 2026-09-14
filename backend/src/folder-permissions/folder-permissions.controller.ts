import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { FolderPermissionsService } from './folder-permissions.service';

@Controller('folder-permissions')
export class FolderPermissionsController {
  constructor(private readonly service: FolderPermissionsService) {}
  @Get(':folderId') list(@CurrentUser() u: AccessTokenPayload,@Param('folderId') id:string){return this.service.list(u,id);}
  @Post(':folderId') upsert(@CurrentUser() u: AccessTokenPayload,@Param('folderId') id:string,@Body() b:any){return this.service.upsert(u,id,b);}
  @Delete(':permissionId') remove(@CurrentUser() u: AccessTokenPayload,@Param('permissionId') id:string){return this.service.remove(u,id);}
}
