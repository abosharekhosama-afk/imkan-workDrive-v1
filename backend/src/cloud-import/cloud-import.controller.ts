import { Controller, Get, Param, Post, Body, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { Public } from '../auth/public.decorator';
import { CloudImportService } from './cloud-import.service';
import { parseProvider } from './cloud-import.schemas';
import { appendOAuthResumeFragment } from '../connections/oauth-flow';

@Controller('cloud-import')
export class CloudImportController {
  constructor(private readonly cloud: CloudImportService) {}
  @Get('providers') providers(@CurrentUser() user: AccessTokenPayload) { return this.cloud.listProviders(user); }
  @Get('oauth/:provider/start') start(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string, @Query('folderId') folderId?: string, @Query('connectionId') connectionId?: string) { return this.cloud.beginOAuth(user, parseProvider(provider), folderId || null, connectionId || null); }
  @Public() @Get('oauth/:provider/callback') async callback(@Param('provider') provider: string, @Query('code') code: string, @Query('state') state: string, @Res() response: Response) { const result = await this.cloud.oauthCallback(parseProvider(provider), code, state); response.redirect(appendOAuthResumeFragment(`${result.frontend}/files?cloudImport=${encodeURIComponent(provider)}&folderId=${encodeURIComponent(result.folderId ?? '')}&oauth=success&connectionId=${encodeURIComponent(result.connectionId ?? '')}`, result.resumeToken)); }
  @Get(':provider/files') files(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string, @Query('connectionId') connectionId?: string) { return this.cloud.listFiles(user, parseProvider(provider), connectionId || null); }
  @Post(':provider/import') import(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string, @Body() body: unknown) { return this.cloud.createJobs(user, parseProvider(provider), body); }
  @Get('jobs/list') jobs(@CurrentUser() user: AccessTokenPayload, @Query('ids') ids?: string) { return this.cloud.listJobs(user, ids ? ids.split(',').filter(Boolean).slice(0, 50) : undefined); }
  @Post('jobs/:id/retry') retry(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.cloud.retryJob(user, id); }
}
