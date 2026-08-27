import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccessAction, ResourceType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseResourceName } from '../common/parse-resource-name';
import { RecentService } from '../recent/recent.service';
import { FilesService } from './files.service';
import { parseUploadComplete } from './upload-complete.schema';
import { parseUploadRequest } from './upload-request.schema';
import { parseRestoreVersion } from './restore-version.schema';
import { parseBulkFileOperation, parseMoveCopy } from './operation.schema';

@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly recent: RecentService,
  ) {}

  @Post('upload-request')
  requestUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.files.requestUpload(user, parseUploadRequest(body));
  }

  @Post('upload-complete')
  completeUpload(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.files.completeUpload(user, parseUploadComplete(body).uploadId);
  }

  @Get('trash')
  listTrash(@CurrentUser() user: AccessTokenPayload) {
    return this.files.listTrash(user);
  }

  @Get(':id/stream')
  async stream(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
    @Headers('range') range?: string,
  ) {
    // Inline media streaming endpoint (PVW-02/03): correct Content-Type,
    // RFC 6266 inline disposition, ETag validation and HTTP Range support so
    // previews render instead of downloading raw binaries.
    await this.files.streamFile(user, id, response, range);
    void this.recent
      .record(user, ResourceType.FILE, id, AccessAction.PREVIEW)
      .catch(() => undefined);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const result = await this.files.createDownloadUrl(user, id);
    void this.recent
      .record(user, ResourceType.FILE, id, AccessAction.DOWNLOAD)
      .catch(() => undefined);
    return result;
  }

  @Get(':id/versions/:versionNumber/download')
  async downloadVersion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('versionNumber', new ParseIntPipe()) versionNumber: number,
  ) {
    const result = await this.files.createVersionDownloadUrl(user, id, versionNumber);
    void this.recent
      .record(user, ResourceType.FILE, id, AccessAction.DOWNLOAD)
      .catch(() => undefined);
    return result;
  }

  @Post(':id/restore-version')
  restoreVersion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.files.restoreVersion(user, id, parseRestoreVersion(body).versionNumber);
  }

  @Patch(':id/move')
  move(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    return this.files.move(user, id, parseMoveCopy(body));
  }

  @Post(':id/copy')
  copy(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    return this.files.copy(user, id, parseMoveCopy(body));
  }

  @Delete(':id/permanent')
  permanentDelete(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.files.permanentDelete(user, id);
  }

  @Post('bulk/move')
  bulkMove(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.files.bulkMove(user, parseBulkFileOperation(body));
  }

  @Post('bulk/trash')
  bulkTrash(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.files.bulkTrash(user, parseBulkFileOperation(body));
  }

  @Post('bulk/permanent-delete')
  bulkPermanentDelete(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.files.bulkPermanentDelete(user, parseBulkFileOperation(body));
  }

  @Post('trash/empty')
  emptyTrash(@CurrentUser() user: AccessTokenPayload) {
    return this.files.emptyTrash(user);
  }

  @Post(':id/restore')
  restore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.files.restore(user, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.files.rename(user, id, parseResourceName(body).name);
  }

  @Delete(':id')
  trash(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.files.trash(user, id);
  }
}
