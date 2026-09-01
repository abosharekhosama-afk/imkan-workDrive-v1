import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  /**
   * The version reference in `GET /files/:id/versions/:versionRef/download`
   * may be either a numeric `versionNumber` or a UUID `versionId`; dispatch
   * on shape so both addressing schemes share one route.
   */
  private static readonly UUID_REF_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  @Get(':id/preview-url')
  async getPreviewUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const result = await this.files.createPreviewUrl(user, id);
    void this.recent
      .record(user, ResourceType.FILE, id, AccessAction.PREVIEW)
      .catch(() => undefined);

    return result;
  }

  @Get(':id/activities')
  listActivities(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : undefined;
    return this.files.listActivities(user, id, Number.isFinite(parsed) ? parsed : 20);
  }

  @Get(':id/stream')
  async stream(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
    @Headers('range') range?: string,
  ) {
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

  @Get(':id/versions')
  getVersionHistory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.files.getVersionHistory(user, id);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file'))
  uploadNewVersion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: unknown,
  ) {
    return this.files.uploadNewVersion(user, id, file);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersionById(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
  ) {
    return this.files.restoreVersionById(user, id, versionId);
  }

  @Get(':id/versions/:versionRef/download')
  async downloadVersion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('versionRef') versionRef: string,
  ) {
    const isUuid = FilesController.UUID_REF_RE.test(versionRef);
    const versionNumber = Number(versionRef);
    if (!isUuid && (!Number.isInteger(versionNumber) || versionNumber < 1)) {
      throw new BadRequestException('Invalid version reference');
    }
    const result = isUuid
      ? await this.files.createVersionDownloadUrlById(user, id, versionRef)
      : await this.files.createVersionDownloadUrl(user, id, versionNumber);
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
  move(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.files.move(user, id, parseMoveCopy(body));
  }

  @Post(':id/copy')
  copy(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.files.copy(user, id, parseMoveCopy(body));
  }

  @Delete(':id/permanent')
  permanentDelete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
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