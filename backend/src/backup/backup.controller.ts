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

  /** Trigger a full backup now (async). */
  @Post('runs/full')
  startFull(@CurrentUser() user: AccessTokenPayload, @Body() body?: { policyId?: string }) {
    return this.service.startFullBackup(user, body?.policyId);
  }
}
