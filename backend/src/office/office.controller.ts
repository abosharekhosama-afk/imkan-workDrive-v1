import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { OfficeService } from './office.service';
import { OfficeConversionService } from './office-conversion.service';
import { OfficeCollaborationService } from './office-collaboration.service';

@Controller('office')
export class OfficeController {
  constructor(private readonly office: OfficeService, private readonly conversion: OfficeConversionService, private readonly collaboration: OfficeCollaborationService) {}

  @Get('capabilities')
  capabilities() { return this.office.getCapabilities(); }

  @Post('conversion/diagnostics')
  async conversionDiagnostics(@Body() body: { type: 'WRITER'|'SHEET'|'SHOW'; content: unknown; format: 'docx'|'xlsx'|'pptx' }) {
    return this.conversion.diagnose(body.type, body.content, body.format);
  }

  @Post('files/:fileId/conversion-roundtrip')
  async fileConversionRoundTrip(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { format: 'docx'|'xlsx'|'pptx' }) {
    const state = await this.office.open(user, fileId);
    return this.conversion.roundTrip(state.type, state.content, body.format);
  }

  @Get('files/:fileId/conversion-diagnostics')
  async fileConversionDiagnostics(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Query('format') format: 'docx'|'xlsx'|'pptx') {
    const state = await this.office.open(user, fileId);
    return this.conversion.diagnose(state.type, state.content, format);
  }

  @Post('documents')
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: { name: string; type: 'WRITER' | 'SHEET' | 'SHOW'; folderId?: string | null }) {
    return this.office.create(user, body);
  }


  @Post('import')
  async importFile(@CurrentUser() user: AccessTokenPayload, @Body() body: { filename: string; dataBase64: string; folderId?: string | null }) {
    const buffer = Buffer.from(String(body.dataBase64 || ''), 'base64');
    if (!buffer.length) throw new Error('Empty Office file');
    const result = await this.conversion.import(buffer, String(body.filename || 'document'));
    return this.office.createImported(user, result, body.folderId ?? null);
  }

  @Post('files/:fileId/export')
  async exportFile(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { format: 'docx' | 'xlsx' | 'pptx' }) {
    return this.office.exportFile(user, fileId, body.format);
  }

  @Get('files/:fileId')
  open(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.open(user, fileId); }

  @Patch('files/:fileId')
  save(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { content: unknown; expectedRevision?: number; sessionId?: string }) {
    return this.office.save(user, fileId, body.content, body.expectedRevision, body.sessionId);
  }

  @Post('files/:fileId/session')
  openSession(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.openSession(user, fileId); }

  @Patch('sessions/:sessionId/touch')
  touch(@CurrentUser() user: AccessTokenPayload, @Param('sessionId') sessionId: string) { return this.office.touchSession(user, sessionId); }

  @Sse('files/:fileId/events')
  async events(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string): Promise<Observable<MessageEvent>> {
    await this.office.listPresence(user, fileId);
    return this.collaboration.stream(fileId).pipe(map((event) => ({ data: event } as MessageEvent)));
  }

  @Get('files/:fileId/presence')
  presence(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.listPresence(user, fileId); }

  @Post('sessions/:sessionId/presence')
  heartbeat(@CurrentUser() user: AccessTokenPayload, @Param('sessionId') sessionId: string, @Body() body: { cursor?: unknown; selection?: unknown; status?: 'ACTIVE'|'IDLE' }) { return this.office.heartbeatPresence(user, sessionId, body); }

  @Get('files/:fileId/operations')
  operations(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Query('sinceRevision') sinceRevision?: string) { return this.office.listOperations(user, fileId, sinceRevision ? Number(sinceRevision) : undefined); }

  @Delete('sessions/:sessionId')
  close(@CurrentUser() user: AccessTokenPayload, @Param('sessionId') sessionId: string) { return this.office.closeSession(user, sessionId); }
}
