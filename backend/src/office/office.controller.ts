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

  @Post('files/:fileId/approval')
  requestApproval(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { workflowId: string; participantRules?: unknown; fieldValues?: Record<string, unknown>; comment?: string }) { return this.office.requestApproval(user, fileId, body); }

  @Get('files/:fileId/approval')
  approvalStatus(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.getApprovalStatus(user, fileId); }

  @Get('files/:fileId/workdrive-context')
  workDriveContext(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.getWorkDriveContext(user, fileId); }

  @Get('compliance/audit-policy')
  auditPolicy(@CurrentUser() user: AccessTokenPayload) { return this.office.getAuditPolicy(user); }

  @Patch('compliance/audit-policy')
  updateAuditPolicy(@CurrentUser() user: AccessTokenPayload, @Body() body: { retentionDays?: number; immutableChain?: boolean; exportEnabled?: boolean }) { return this.office.updateAuditPolicy(user, body); }

  @Get('compliance/audit')
  complianceAudit(@CurrentUser() user: AccessTokenPayload, @Query('limit') limit?: string, @Query('action') action?: string, @Query('resourceType') resourceType?: string, @Query('actorId') actorId?: string, @Query('since') since?: string, @Query('until') until?: string) {
    return this.office.listComplianceAudit(user, { limit: limit ? Number(limit) : undefined, action, resourceType, actorId, since, until });
  }

  @Get('compliance/audit/export')
  exportComplianceAudit(@CurrentUser() user: AccessTokenPayload, @Query('resourceType') resourceType?: string, @Query('since') since?: string, @Query('until') until?: string) { return this.office.exportComplianceAudit(user, { resourceType, since, until }); }

  @Get('compliance/audit/verify')
  verifyAudit(@CurrentUser() user: AccessTokenPayload, @Query('resourceType') resourceType?: string, @Query('resourceId') resourceId?: string, @Query('limit') limit?: string) {
    return this.office.verifyAuditIntegrity(user, { resourceType, resourceId, limit: limit ? Number(limit) : undefined });
  }

  @Get('admin-center')
  adminCenter(@CurrentUser() user: AccessTokenPayload) { return this.office.getAdminCenter(user); }

  @Get('security-policy')
  securityPolicy(@CurrentUser() user: AccessTokenPayload) { return this.office.getSecurityPolicy(user); }

  @Patch('security-policy')
  updateSecurityPolicy(@CurrentUser() user: AccessTokenPayload, @Body() body: { forceReadOnly?: boolean; disableExport?: boolean; disableCopy?: boolean; disableOffline?: boolean; requireWatermark?: boolean; watermarkText?: string | null }) { return this.office.updateSecurityPolicy(user, body); }

  @Get('files/:fileId/policy')
  policy(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.getPolicy(user, fileId); }

  @Patch('files/:fileId/policy')
  updatePolicy(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { allowExport?: boolean; allowCopy?: boolean; allowOffline?: boolean; readOnly?: boolean; watermarkEnabled?: boolean; watermarkText?: string | null }) { return this.office.updatePolicy(user, fileId, body); }

  @Get('files/:fileId/audit')
  audit(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Query('limit') limit?: string, @Query('action') action?: string, @Query('since') since?: string, @Query('until') until?: string) {
    return this.office.listAuditEvents(user, fileId, { limit: limit ? Number(limit) : undefined, action, since, until });
  }

  @Get('files/:fileId')
  open(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.open(user, fileId); }

  @Patch('files/:fileId')
  save(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { content: unknown; expectedRevision?: number; sessionId?: string }) {
    return this.office.save(user, fileId, body.content, body.expectedRevision, body.sessionId);
  }

  @Get('files/:fileId/versions')
  listVersions(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) { return this.office.listVersions(user, fileId); }

  @Post('files/:fileId/versions/:versionId/restore')
  restoreVersion(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Param('versionId') versionId: string, @Body() body: { expectedRevision?: number }) { return this.office.restoreVersion(user, fileId, versionId, body?.expectedRevision); }

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

  @Post('files/:fileId/operations')
  officeOperation(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Body() body: { opId: string; baseRevision: number; patches: Array<{ op: 'set' | 'delete'; path: string; value?: unknown }>; sessionId?: string; clientId?: string; sequence?: number }) {
    return this.office.applyOfficeOperation(user, fileId, body);
  }

  @Get('files/:fileId/operations')
  operations(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string, @Query('sinceRevision') sinceRevision?: string, @Query('limit') limit?: string) { return this.office.listOperations(user, fileId, sinceRevision ? Number(sinceRevision) : undefined, limit ? Number(limit) : undefined); }

  @Delete('sessions/:sessionId')
  close(@CurrentUser() user: AccessTokenPayload, @Param('sessionId') sessionId: string) { return this.office.closeSession(user, sessionId); }
}
