import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { BackupService } from './backup.service';

/**
 * Backup & Recovery API — organization-scoped data protection.
 * Intentionally separate from Admin Console routes (`/admin/*`).
 */
@Controller('backup')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Get('overview')
  overview(@CurrentUser() user: AccessTokenPayload) {
    return this.service.overview(user);
  }

  @Get('policies')
  listPolicies(@CurrentUser() user: AccessTokenPayload) {
    return this.service.listPolicies(user);
  }

  @Post('policies')
  createPolicy(@CurrentUser() user: AccessTokenPayload, @Body() body: any) {
    return this.service.createPolicy(user, body ?? {});
  }

  @Patch('policies/:id')
  updatePolicy(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: any) {
    return this.service.updatePolicy(user, id, body ?? {});
  }

  @Delete('policies/:id')
  deletePolicy(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.deletePolicy(user, id);
  }

  @Get('runs')
  listRuns(@CurrentUser() user: AccessTokenPayload, @Query('take') take?: string) {
    return this.service.listRuns(user, take ? Number(take) : 30);
  }

  @Get('runs/:id')
  getRun(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getRun(user, id);
  }

  @Get('runs/:id/objects')
  listObjects(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listRunObjects(user, id, q, take ? Number(take) : 100, cursor);
  }

  @Post('runs/full')
  startFull(@CurrentUser() user: AccessTokenPayload, @Body() body?: { policyId?: string }) {
    return this.service.startFullBackup(user, body?.policyId);
  }

  @Post('runs/incremental')
  startIncremental(@CurrentUser() user: AccessTokenPayload, @Body() body?: { policyId?: string }) {
    return this.service.startIncrementalBackup(user, body?.policyId);
  }

  @Post('scheduler/tick')
  async tick(@CurrentUser() user: AccessTokenPayload) {
    if (String(user.role) !== 'SUPER_ADMIN') {
      return {
        ok: false,
        message: 'Scheduler tick requires SUPER_ADMIN; use Run full/incremental for this organization',
      };
    }
    return this.service.processDuePolicies(50);
  }

  @Get('restore-jobs')
  listRestoreJobs(@CurrentUser() user: AccessTokenPayload, @Query('take') take?: string) {
    return this.service.listRestoreJobs(user, take ? Number(take) : 20);
  }

  @Get('restore-jobs/:id')
  getRestoreJob(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.getRestoreJob(user, id);
  }

  @Post('restore')
  startRestore(
    @CurrentUser() user: AccessTokenPayload,
    @Body()
    body: {
      runId: string;
      mode?: 'ORIGINAL' | 'NEW_LOCATION' | 'DOWNLOAD';
      objectIds?: string[];
      targetFolderId?: string | null;
    },
  ) {
    return this.service.startRestore(user, body);
  }

  @Get('purge-requests')
  listPurgeRequests(@CurrentUser() user: AccessTokenPayload, @Query('take') take?: string) {
    return this.service.listPurgeRequests(user, take ? Number(take) : 30);
  }

  @Post('purge-requests')
  requestPurge(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { runId: string; reason: string },
  ) {
    return this.service.requestPurge(user, body.runId, body.reason);
  }

  @Post('purge-requests/:id/approve')
  approvePurge(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body?: { decisionNote?: string },
  ) {
    return this.service.approvePurge(user, id, body?.decisionNote);
  }

  @Post('purge-requests/:id/reject')
  rejectPurge(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body?: { decisionNote?: string },
  ) {
    return this.service.rejectPurge(user, id, body?.decisionNote);
  }

  @Post('purge-requests/:id/execute')
  executePurge(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.service.executePurge(user, id);
  }
}
