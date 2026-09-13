import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowEngineService, type WorkflowFileEvent } from './workflow-engine.service';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService, private readonly engine: WorkflowEngineService) {}
  @Get() list(@CurrentUser() user: AccessTokenPayload, @Query('scope') scope?: string) { return this.service.list(user, scope); }
  @Get('runs') runs(@CurrentUser() user: AccessTokenPayload, @Query('workflowId') workflowId?: string, @Query('status') status?: string) { return this.service.runs(user, workflowId, status); }
  @Get('tasks') tasks(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) { return this.service.tasks(user, status); }
  @Get(':id') get(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.get(user, id); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.service.update(user, id, body); }
  @Post(':id/activate') activate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.setStatus(user, id, 'ACTIVE'); }
  @Post(':id/deactivate') deactivate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.setStatus(user, id, 'DRAFT'); }
  @Post(':id/start') start(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: WorkflowFileEvent) { return this.engine.startManual(user, id, { ...body, userId: user.sub }); }
  @Post('/tasks/:id/complete') completeTask(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { transitionId?: string }) { return this.service.completeTask(user, id, String(body.transitionId ?? '')); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.remove(user, id); }
}
