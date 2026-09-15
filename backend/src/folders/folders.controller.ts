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
import { AccessAction, ResourceType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseResourceName } from '../common/parse-resource-name';
import { RecentService } from '../recent/recent.service';
import { parseCreateFolder } from './create-folder.schema';
import { FoldersService } from './folders.service';
import { parseBulkFolderOperation, parseFolderMoveCopy } from './operation.schema';

@Controller('folders')
export class FoldersController {
  constructor(
    private readonly folders: FoldersService,
    private readonly recent: RecentService,
  ) {}

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.folders.create(user, parseCreateFolder(body));
  }

  @Get()
  listRoots(@CurrentUser() user: AccessTokenPayload) {
    return this.folders.listContents(user);
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const result = await this.folders.getById(user, id);
    void this.recent
      .record(user, ResourceType.FOLDER, id, AccessAction.VIEW)
      .catch(() => undefined);
    return result;
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.folders.rename(user, id, parseResourceName(body).name);
  }

  @Patch(':id/move')
  move(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.folders.move(user, id, parseFolderMoveCopy(body)); }

  @Post(':id/copy')
  copy(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.folders.copy(user, id, parseFolderMoveCopy(body)); }

  @Delete(':id/permanent')
  permanentDelete(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.folders.permanentDelete(user, id); }

  @Post('bulk/move')
  bulkMove(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.folders.bulkMove(user, parseBulkFolderOperation(body)); }

  @Post('bulk/trash')
  bulkTrash(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.folders.bulkTrash(user, parseBulkFolderOperation(body)); }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.folders.remove(user, id);
  }
}
