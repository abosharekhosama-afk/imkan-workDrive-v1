import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { OrgRole } from '@prisma/client';
import { OrganizationService } from './organization.service';
import { parseInvite, parseUpdateOrganization } from './organization.schemas';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}
  @Get() get(@CurrentUser() u: AccessTokenPayload) { return this.service.get(u); }
  @Patch() update(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { return this.service.update(u, parseUpdateOrganization(b)); }
  @Get('members') members(@CurrentUser() u: AccessTokenPayload) { return this.service.members(u); }
  @Patch('members/:id') updateMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string, @Body() b: { role?: OrgRole }) { return this.service.updateMemberRole(u, id, b.role as OrgRole); }
  @Delete('members/:id') removeMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.service.removeMember(u, id); }
  @Get('invitations') invitations(@CurrentUser() u: AccessTokenPayload) { return this.service.invitations(u); }
  @Post('invitations') invite(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { const i = parseInvite(b); return this.service.invite(u, i.email, i.role); }
  @Delete('invitations/:id') revoke(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.service.revokeInvitation(u, id); }
  @Post('invitations/accept') accept(@CurrentUser() u: AccessTokenPayload, @Body() b: { token?: string }) { if (!b.token) throw new BadRequestException('Invitation token is required'); return this.service.accept(u, b.token); }
  @Public()
  @Get('invitations/validate') validate(@Query('token') token: string) { return this.service.validateInvitation(token); }
}
