import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseResourceName } from '../common/parse-resource-name';
import { FilesService } from './files.service';
import { parseUploadComplete } from './upload-complete.schema';
import { parseUploadRequest } from './upload-request.schema';
import { parseRestoreVersion } from './restore-version.schema';
import { parseBulkFileOperation, parseMoveCopy } from './operation.schema';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

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

  @Get(':id/download')
  download(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.files.createDownloadUrl(user, id);
  }

  @Get(':id/versions/:versionNumber/download')
  downloadVersion(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('versionNumber', new ParseIntPipe()) versionNumber: number,
  ) {
    return this.files.createVersionDownloadUrl(user, id, versionNumber);
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
