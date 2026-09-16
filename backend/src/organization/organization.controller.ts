import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { OrgRole } from '@prisma/client';
import { AuthService } from '../auth.service';
import { OrganizationService } from './organization.service';
import { parseCreateAccount, parseInvite, parseUpdateOrganization, parseUpdateMemberRole, parseRemoveMember, parseTransferOwnership } from './organization.schemas';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService, private readonly auth: AuthService) {}
  @Get() get(@CurrentUser() u: AccessTokenPayload) { return this.service.get(u); }
  @Patch() update(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { return this.service.update(u, parseUpdateOrganization(b)); }
  @Get('members') members(@CurrentUser() u: AccessTokenPayload, @Query('status') status?: string) { return this.service.members(u, status); }
  @Post('accounts') @UseGuards(SuperAdminGuard) createAccount(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { return this.auth.createUserAccount(u, parseCreateAccount(b)); }
  @Get('members/all') allMembers(@CurrentUser() u: AccessTokenPayload) { return this.service.allMembersWithPending(u); }
  @Patch('members/:id') updateMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string, @Body() b: unknown) { return this.service.updateMemberRole(u, id, parseUpdateMemberRole(b).role); }
  @Post('members/:id/suspend') suspendMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.service.suspendMember(u, id); }
  @Post('members/:id/activate') activateMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.service.activateMember(u, id); }
  @Delete('members/:id') removeMember(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string, @Body() b: unknown) { return this.service.removeMember(u, id, parseRemoveMember(b).successorId); }
  @Post('ownership/transfer') transferOwnership(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { return this.service.transferOwnership(u, parseTransferOwnership(b).targetMembershipId); }
  @Get('invitations') invitations(@CurrentUser() u: AccessTokenPayload) { return this.service.invitations(u); }
  @Post('invitations') invite(@CurrentUser() u: AccessTokenPayload, @Body() b: unknown) { const i = parseInvite(b); return this.service.invite(u, i.email, i.role); }
  @Delete('invitations/:id') revoke(@CurrentUser() u: AccessTokenPayload, @Param('id') id: string) { return this.service.revokeInvitation(u, id); }
  @Post('invitations/accept') accept(@CurrentUser() u: AccessTokenPayload, @Body() b: { token?: string }) { if (!b.token) throw new BadRequestException('Invitation token is required'); return this.service.accept(u, b.token); }
  @Get('data-transfers') dataTransfers(@CurrentUser() u: AccessTokenPayload) { return this.service.getDataTransfers(u); }
  @Public()
  @Get('invitations/validate') validate(@Query('token') token: string) { return this.service.validateInvitation(token); }
}
