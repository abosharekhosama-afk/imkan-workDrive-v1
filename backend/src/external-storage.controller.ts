import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from './auth/current-user.decorator';
import type { AccessTokenPayload } from './auth/jwt.types';
import { ExternalStorageService } from './external-storage.service';

@Controller('external-storage')
export class ExternalStorageController {
  constructor(private readonly service: ExternalStorageService) {}
  @Get() list(@CurrentUser() user: AccessTokenPayload) { return this.service.list(user); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: any) { return this.service.update(user, id, body); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.remove(user, id); }
  @Post(':id/test') test(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.test(user, id); }
  @Get(':id/browse') browse(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Query('path') path?: string) { return this.service.browse(user, id, path); }
  @Post(':id/export') exportOffice(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { fileId: string; format: 'docx'|'xlsx'|'pptx'; remoteName?: string; remoteParentId?: string }) { return this.service.exportOffice(user, id, body.fileId, body.format, body.remoteName, body.remoteParentId); }
}
