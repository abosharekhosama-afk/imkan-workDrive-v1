import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { EnterpriseService } from './enterprise.service';

@Controller('admin/enterprise')
export class EnterpriseController {
  constructor(private readonly service: EnterpriseService) {}
  @Get('dashboard') dashboard(@CurrentUser() u: AccessTokenPayload) { return this.service.dashboard(u); }
  @Get('groups') groups(@CurrentUser() u: AccessTokenPayload) { return this.service.groups(u); }
  @Post('groups') createGroup(@CurrentUser() u: AccessTokenPayload, @Body() b: { name: string; description?: string }) { return this.service.createGroup(u, b.name, b.description); }
  @Post('groups/:groupId/members/:userId') addGroupMember(@CurrentUser() u: AccessTokenPayload, @Param('groupId') g: string, @Param('userId') m: string) { return this.service.addGroupMember(u, g, m); }
  @Patch('groups/:groupId/members/:userId') removeGroupMember(@CurrentUser() u: AccessTokenPayload, @Param('groupId') g: string, @Param('userId') m: string) { return this.service.removeGroupMember(u, g, m); }
  @Get('security-policy') securityPolicy(@CurrentUser() u: AccessTokenPayload) { return this.service.securityPolicy(u); }
  @Patch('security-policy') updateSecurityPolicy(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.service.updateSecurityPolicy(u, b); }
  @Get('retention-policy') retentionPolicy(@CurrentUser() u: AccessTokenPayload) { return this.service.retentionPolicy(u); }
  @Patch('retention-policy') updateRetentionPolicy(@CurrentUser() u: AccessTokenPayload, @Body() b: any) { return this.service.updateRetentionPolicy(u, b); }
  @Get('audit') audit(@CurrentUser() u: AccessTokenPayload, @Query('limit') limit?: string) { return this.service.audit(u, Number(limit)); }
  @Get('external-shares') externalShares(@CurrentUser() u: AccessTokenPayload) { return this.service.externalShares(u); }
  @Post('users/:userId/suspend') suspendUser(@CurrentUser() u: AccessTokenPayload, @Param('userId') id: string) { return this.service.suspendUser(u, id); }
}
