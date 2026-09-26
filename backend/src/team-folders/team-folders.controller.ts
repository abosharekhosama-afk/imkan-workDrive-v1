import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseResourceName } from '../common/parse-resource-name';
import { parseCreateTeamFolder } from './create-team-folder.schema';
import { parseUpdateTeamFolderSettings } from './settings.schema';
import {
  parseAddTeamFolderMember,
  parseUpdateTeamFolderMember,
} from './membership.schema';
import { TeamFoldersService } from './team-folders.service';
import { TeamFolderRole } from '@prisma/client';

@Controller('team-folders')
export class TeamFoldersController {
  constructor(private readonly teamFolders: TeamFoldersService) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.teamFolders.create(user, parseCreateTeamFolder(body));
  }

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.teamFolders.list(user);
  }

  @Get(':id/activity')
  listActivity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.listActivity(user, id);
  }

  @Get(':id/trash')
  listTrash(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.listTrash(user, id);
  }

  @Get(':id/shared')
  listShared(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.listShared(user, id);
  }

  @Get(':id/members')
  listMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.listMembers(user, id);
  }

  @Post(':id/groups')
  addGroup(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: { groupId: string; role: TeamFolderRole }) {
    return this.teamFolders.addGroup(user, id, body.groupId, body.role);
  }

  @Patch(':id/groups/:groupId')
  updateGroup(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string, @Body() body: { role: TeamFolderRole }) {
    return this.teamFolders.updateGroup(user, id, groupId, body.role);
  }

  @Delete(':id/groups/:groupId')
  removeGroup(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.teamFolders.removeGroup(user, id, groupId);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.teamFolders.addMember(user, id, parseAddTeamFolderMember(body));
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: unknown,
  ) {
    return this.teamFolders.updateMember(
      user,
      id,
      userId,
      parseUpdateTeamFolderMember(body),
    );
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.teamFolders.removeMember(user, id, userId);
  }

  @Post(':id/join')
  join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.join(user, id);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.getById(user, id);
  }

  @Patch(':id/settings')
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.teamFolders.updateSettings(user, id, parseUpdateTeamFolderSettings(body));
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.teamFolders.rename(user, id, parseResourceName(body).name);
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.archive(user, id);
  }

  @Post(':id/restore')
  restore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.restore(user, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.remove(user, id);
  }
}
