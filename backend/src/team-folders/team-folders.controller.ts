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
import {
  parseAddTeamFolderMember,
  parseUpdateTeamFolderMember,
} from './membership.schema';
import { TeamFoldersService } from './team-folders.service';

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

  @Get(':id/members')
  listMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.listMembers(user, id);
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

  @Get(':id')
  getById(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.getById(user, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.teamFolders.rename(user, id, parseResourceName(body).name);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.teamFolders.remove(user, id);
  }
}
