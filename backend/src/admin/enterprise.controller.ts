import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { EnterpriseService } from './enterprise.service';
import { DlpService } from '../dlp/dlp.service';

@Controller('admin/enterprise')
export class EnterpriseController {
  constructor(private readonly service: EnterpriseService, private readonly dlp: DlpService) {}
  @Get('settings') consoleSettings(@CurrentUser() u: AccessTokenPayload) { return this.service.consoleSettings(u); }
  @Patch('settings') updateConsoleSettings(@CurrentUser() u: AccessTokenPayload, @Body() b: Record<string, unknown>) { return this.service.updateConsoleSettings(u, b); }
  @Get('security-center') securityCenter(@CurrentUser() u: AccessTokenPayload) { return this.service.securityCenter(u); }
  @Delete('sessions/:sessionId') revokeUserSession(@CurrentUser() u: AccessTokenPayload, @Param('sessionId') id: string) { return this.service.revokeUserSession(u, id); }

  @Get('dlp/labels') dlpLabels(@CurrentUser() u: AccessTokenPayload) { return this.dlp.listLabels(u); }
  @Post('dlp/labels') createDlpLabel(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.dlp.createLabel(u, b); }
  @Delete('dlp/labels/:id') deleteDlpLabel(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.dlp.deleteLabel(u, id); }
  @Get('dlp/policies') dlpPolicies(@CurrentUser() u: AccessTokenPayload) { return this.dlp.listPolicies(u); }
  @Post('dlp/policies') createDlpPolicy(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.dlp.createPolicy(u, b); }
  @Patch('dlp/policies/:id') updateDlpPolicy(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string, @Body() b: any) { return this.dlp.updatePolicy(u, id, b); }
  @Delete('dlp/policies/:id') deleteDlpPolicy(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.dlp.deletePolicy(u, id); }
  @Get('dashboard') dashboard(@CurrentUser() u: AccessTokenPayload) { return this.service.dashboard(u); }
  @Get('groups') groups(@CurrentUser() u: AccessTokenPayload) { return this.service.groups(u); }
  @Post('groups') createGroup(@CurrentUser() u: AccessTokenPayload, @Body() b: { name: string; description?: string }) { return this.service.createGroup(u, b.name, b.description); }
  @Post('groups/:groupId/members/:userId') addGroupMember(@CurrentUser() u: AccessTokenPayload, @Param('groupId') g: string, @Param('userId') m: string) { return this.service.addGroupMember(u, g, m); }
  @Patch('groups/:groupId/members/:userId') removeGroupMember(@CurrentUser() u: AccessTokenPayload, @Param('groupId') g: string, @Param('userId') m: string) { return this.service.removeGroupMember(u, g, m); }
  @Get('security-policy') securityPolicy(@CurrentUser() u: AccessTokenPayload) { return this.service.securityPolicy(u); }
  @Patch('security-policy') updateSecurityPolicy(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.service.updateSecurityPolicy(u, b); }
  @Get('retention-policy') retentionPolicy(@CurrentUser() u: AccessTokenPayload) { return this.service.retentionPolicy(u); }
  @Patch('retention-policy') updateRetentionPolicy(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.service.updateRetentionPolicy(u, b); }
  @Get('audit/scopes') auditScopes(@CurrentUser() u: AccessTokenPayload) { return this.service.auditScopes(u); }
  @Get('audit') audit(@CurrentUser() u: AccessTokenPayload, @Query('limit') limit?: string) { return this.service.audit(u, Number(limit)); }
  @Post('audit/reports') auditReport(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.service.auditReport(u, b); }
  @Get('external-shares') externalShares(@CurrentUser() u: AccessTokenPayload) { return this.service.externalShares(u); }
  @Post('users/:userId/suspend') suspendUser(@CurrentUser() u: AccessTokenPayload, @Param('userId') id: string) { return this.service.suspendUser(u, id); }
}
