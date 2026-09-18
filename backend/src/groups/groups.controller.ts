import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.groups.list(user);
  }

  @Post(':id/members/:userId')
  addMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: { role?: 'ADMIN' | 'MEMBER' },
  ) {
    return this.groups.addMember(user, groupId, userId, body?.role);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.groups.removeMember(user, groupId, userId);
  }
}
