import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { MetadataService } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('templates') listTemplates(@CurrentUser() user: AccessTokenPayload, @Query('includeDisabled') includeDisabled?: string) { return this.metadata.listTemplates(user, includeDisabled === 'true'); }
  @Get('templates/:id') getTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.metadata.getTemplate(user, id); }
  @Post('templates') createTemplate(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.metadata.createTemplate(user, body); }
  @Patch('templates/:id') updateTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: any) { return this.metadata.updateTemplate(user, id, body); }
  @Delete('templates/:id') deleteTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.metadata.deleteTemplate(user, id); }

  @Put('folders/:folderId/template') bindFolder(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string, @Body() body: any) {
    return this.metadata.bindFolder(user, folderId, typeof body?.templateId === 'string' ? body.templateId : null);
  }
  @Get('folders/:folderId/associations') listFolderBindings(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string) { return this.metadata.listFolderBindings(user, folderId); }
  @Post('folders/:folderId/associations') associateFolder(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string, @Body() body: any) { return this.metadata.associateFolder(user, folderId, body?.templateId, body?.customFields ?? {}); }
  @Patch('folders/:folderId/associations/:templateId') updateFolderBinding(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string, @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string, @Body() body: any) { return this.metadata.updateFolderBinding(user, folderId, templateId, body?.customFields ?? {}); }
  @Delete('folders/:folderId/associations/:templateId') disassociateFolder(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string, @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string) { return this.metadata.disassociateFolder(user, folderId, templateId); }

  @Get('files/:fileId') getFileMetadata(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string) { return this.metadata.getFileMetadata(user, fileId); }
  @Put('files/:fileId') updateFileMetadata(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string, @Body() body: any) { return this.metadata.updateFileMetadata(user, fileId, body); }
  @Get('files/:fileId/associations') listFileBindings(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string) { return this.metadata.listFileBindings(user, fileId); }
  @Post('files/:fileId/associations') associateFile(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string, @Body() body: any) { return this.metadata.associateFile(user, fileId, body?.templateId, body?.customFields ?? {}); }
  @Patch('files/:fileId/associations/:templateId') updateFileBinding(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string, @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string, @Body() body: any) { return this.metadata.updateFileBinding(user, fileId, templateId, body?.customFields ?? {}); }
  @Delete('files/:fileId/associations/:templateId') disassociateFile(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string, @Param('templateId', new ParseUUIDPipe({ version: '4' })) templateId: string) { return this.metadata.disassociateFile(user, fileId, templateId); }

  @Get('team-folders/:teamFolderId/mandate') getTeamFolderMandate(@CurrentUser() user: AccessTokenPayload, @Param('teamFolderId', new ParseUUIDPipe({ version: '4' })) teamFolderId: string) { return this.metadata.getTeamFolderMandate(user, teamFolderId); }
  @Put('team-folders/:teamFolderId/mandate') setTeamFolderMandate(@CurrentUser() user: AccessTokenPayload, @Param('teamFolderId', new ParseUUIDPipe({ version: '4' })) teamFolderId: string, @Body() body: any) { return this.metadata.setTeamFolderMandate(user, teamFolderId, { templateId: typeof body?.templateId === 'string' ? body.templateId : null, target: body?.target }); }
}
