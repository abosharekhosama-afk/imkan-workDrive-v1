import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowEngineService, type WorkflowFileEvent } from './workflow-engine.service';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService, private readonly engine: WorkflowEngineService) {}
  @Get('capabilities') capabilities(@CurrentUser() user: AccessTokenPayload) { return this.service.capabilities(user); }
  @Get('templates') templates(@CurrentUser() user: AccessTokenPayload) { return this.service.templates(user); }
  @Post('templates') createTemplate(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.createTemplate(user, body); }
  @Get('templates/:id') template(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.template(user, id); }
  @Patch('templates/:id') updateTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: any) { return this.service.updateTemplate(user, id, body); }
  @Post('templates/:id/preview') previewTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: any) { return this.service.previewTemplate(user, id, body); }
  @Get('templates/:id/versions') templateVersions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.templateVersions(user, id); }
  @Post('templates/:id/versions/:versionId/rollback') rollbackTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string) { return this.service.rollbackTemplateVersion(user, id, versionId); }
  @Delete('templates/:id') deleteTemplate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.deleteTemplate(user, id); }
  @Get('functions/:id/versions') functionVersions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.functionVersions(user, id); }
  @Post('functions/:id/versions/:versionId/publish') publishFunctionVersion(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string) { return this.service.publishFunctionVersion(user, id, versionId); }
  @Post('functions/:id/test') testFunction(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: any) { return this.service.testFunction(user, id, body); }
  @Get('functions') functions(@CurrentUser() user: AccessTokenPayload) { return this.service.functions(user); }
  @Post('functions') createFunction(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.createFunction(user, body); }
  @Post('defaults/ensure') ensureDefaults(@CurrentUser() user: AccessTokenPayload) { return this.service.ensureDefaults(user); }
  @Get('participants') participants(@CurrentUser() user: AccessTokenPayload) { return this.service.participants(user); }
  @Get('participant-options') participantOptions(@CurrentUser() user: AccessTokenPayload) { return this.service.participantOptions(user); }
  @Get('diagnostics') diagnostics(@CurrentUser() user: AccessTokenPayload) { return this.service.diagnostics(user); }
  @Get('queue') queue(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) { return this.service.queue(user, status); }
  @Get('queue/:id') queueJob(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.queueJob(user, id); }
  @Post('queue/:id/:action') queueAction(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('action') action: string) { return this.service.queueAction(user, id, action); }
  @Get('audit') audit(@CurrentUser() user: AccessTokenPayload, @Query('action') action?: string, @Query('resourceType') resourceType?: string) { return this.service.audit(user, action, resourceType); }
  @Get('dynamic-values') dynamicValues(@CurrentUser() user: AccessTokenPayload, @Query('workflowId') workflowId?: string) { return this.service.dynamicValues(user, workflowId); }
  @Get() list(@CurrentUser() user: AccessTokenPayload, @Query('scope') scope?: string) { return this.service.list(user, scope); }
  @Get('runs') runs(@CurrentUser() user: AccessTokenPayload, @Query('workflowId') workflowId?: string, @Query('status') status?: string, @Query('date') date?: string) { return this.service.runs(user, workflowId, status, date); }
  @Get('resource-status') resourceStatus(@CurrentUser() user: AccessTokenPayload, @Query('resourceType') resourceType: string, @Query('resourceIds') resourceIds: string) { return this.service.resourceStatus(user, resourceType, resourceIds); }
  @Get('tasks') tasks(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) { return this.service.tasks(user, status); }
  @Get('runs/:id/logs')
  logs(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.logs(user, id); }
  @Post('runs/:id/retry')
  retry(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.retry(user, id); }
  @Get(':id') get(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.get(user, id); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.service.update(user, id, body); }
  @Post(':id/activate') activate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.setStatus(user, id, 'ACTIVE'); }
  @Get(':id/versions') versions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.versions(user, id); }
  @Get(':id/versions/:versionId') versionDetail(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string) { return this.service.versionDetail(user, id, versionId); }
  @Post(':id/versions/:versionId/rollback') rollback(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string) { return this.service.rollback(user, id, versionId); }
  @Post(':id/duplicate') duplicate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.duplicate(user, id); }
  @Post(':id/deactivate') deactivate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.setStatus(user, id, 'DRAFT'); }
  @Post(':id/start') start(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: WorkflowFileEvent) { return this.engine.startManual(user, id, { ...body, userId: user.sub }); }
  @Post('/tasks/:id/complete') completeTask(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { transitionId?: string; fieldValues?: Record<string, unknown>; comment?: string }) { return this.service.completeTask(user, id, String(body.transitionId ?? ''), body.fieldValues ?? {}, body.comment); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.service.remove(user, id); }
}
