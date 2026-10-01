import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkspaceLabelsService } from './workspace-labels.service';
@Controller('workspace-labels')
export class WorkspaceLabelsController {
  constructor(private readonly labels: WorkspaceLabelsService) {}
  @Get() list(@CurrentUser() user: AccessTokenPayload) { return this.labels.list(user); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: { name: string; color?: string }) { return this.labels.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { name?: string; color?: string; position?: number }) { return this.labels.update(user, id, body); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.labels.remove(user, id); }
  @Get(':id/resources') resources(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.labels.resources(user, id); }
  @Post(':id/resources/:type/:resourceId') attach(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('type', new ParseEnumPipe(ResourceType)) type: ResourceType, @Param('resourceId', new ParseUUIDPipe({ version: '4' })) resourceId: string) { return this.labels.attach(user, id, type, resourceId); }
  @Delete(':id/resources/:type/:resourceId') detach(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('type', new ParseEnumPipe(ResourceType)) type: ResourceType, @Param('resourceId', new ParseUUIDPipe({ version: '4' })) resourceId: string) { return this.labels.detach(user, id, type, resourceId); }
}
