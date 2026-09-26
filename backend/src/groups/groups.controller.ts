import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) { return this.groups.list(user); }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: { name: string; description?: string }) {
    return this.groups.create(user, body?.name, body?.description);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.groups.get(user, groupId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string, @Body() body: { name?: string; description?: string | null }) {
    return this.groups.update(user, groupId, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.groups.remove(user, groupId);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.groups.listMembers(user, groupId);
  }

  @Post(':id/members/:userId')
  addMember(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string, @Body() body: { role?: 'ADMIN' | 'MEMBER' }) {
    return this.groups.addMember(user, groupId, userId, body?.role);
  }

  @Patch(':id/members/:userId')
  updateMember(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string, @Body() body: { role: 'ADMIN' | 'MEMBER' }) {
    return this.groups.updateMemberRole(user, groupId, userId, body?.role);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string, @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.groups.removeMember(user, groupId, userId);
  }
}
