import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { WorkflowsService } from './workflows.service';
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}
  @Get() list(@CurrentUser() user: AccessTokenPayload) { return this.service.list(user); }
  @Get('mine') mine(@CurrentUser() user: AccessTokenPayload) { return this.service.listMine(user); }
  @Get('tasks') tasks(@CurrentUser() user: AccessTokenPayload) { return this.service.myTasks(user); }
  @Get('admin') admin(@CurrentUser() user: AccessTokenPayload) { return this.service.adminOverview(user); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: { name: string; description?: string; resourceType?: 'FILE'|'FOLDER'; mode?: 'MANUAL'|'AUTOMATIC'; assigneeId?: string }) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { name?: string; description?: string; assigneeId?: string }) { return this.service.update(user, id, body); }
  @Post(':id/activate') activate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.activate(user, id); }
  @Post(':id/deactivate') deactivate(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.deactivate(user, id); }
  @Post(':id/run') run(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { resourceType: 'FILE'|'FOLDER'; resourceId: string }) { return this.service.run(user, id, body); }
  @Post('tasks/:taskId/:decision') decision(@CurrentUser() user: AccessTokenPayload, @Param('taskId') taskId: string, @Param('decision') decision: 'approve'|'reject') { return this.service.completeTask(user, taskId, decision); }
}
