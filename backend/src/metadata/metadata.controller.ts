import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { MetadataService } from './metadata.service';

@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('templates') listTemplates(@CurrentUser() user: AccessTokenPayload) { return this.metadata.listTemplates(user); }
  @Post('templates') createTemplate(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.metadata.createTemplate(user, body); }
  @Patch('templates/:id') updateTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: any) { return this.metadata.updateTemplate(user, id, body); }
  @Delete('templates/:id') deleteTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.metadata.deleteTemplate(user, id); }

  @Put('folders/:folderId/template') bindFolder(@CurrentUser() user: AccessTokenPayload, @Param('folderId', new ParseUUIDPipe({ version: '4' })) folderId: string, @Body() body: any) {
    return this.metadata.bindFolder(user, folderId, typeof body?.templateId === 'string' ? body.templateId : null);
  }

  @Get('files/:fileId') getFileMetadata(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string) { return this.metadata.getFileMetadata(user, fileId); }
  @Put('files/:fileId') updateFileMetadata(@CurrentUser() user: AccessTokenPayload, @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string, @Body() body: any) { return this.metadata.updateFileMetadata(user, fileId, body); }
}
