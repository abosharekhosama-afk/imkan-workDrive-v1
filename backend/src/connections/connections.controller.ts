import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { ConnectionsService } from './connections.service';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly service: ConnectionsService) {}
  @Get('providers') providers(@CurrentUser() user: AccessTokenPayload) { return this.service.providers(user); }
  @Get('admin/providers') adminProviderConfigs(@CurrentUser() user: AccessTokenPayload) { return this.service.adminProviderConfigs(user); }
  @Put('admin/providers/:provider') saveAdminProviderConfig(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string, @Body() body: any) { return this.service.saveAdminProviderConfig(user, provider, body); }
  @Post('admin/providers/:provider/test') testAdminProviderConfig(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string) { return this.service.testAdminProviderConfig(user, provider); }
  @Get('templates') templates() { return this.service.templates(); }
  @Get('health/alerts') healthAlerts(@CurrentUser() user: AccessTokenPayload, @Query('status') status?: string) { return this.service.healthAlerts(user, status); }
  @Get('health/summary') healthSummary(@CurrentUser() user: AccessTokenPayload) { return this.service.healthSummary(user); }
  @Post('health/scan') scanHealth(@CurrentUser() user: AccessTokenPayload) { return this.service.scanHealth(user); }
  @Get('custom-services') customServices(@CurrentUser() user: AccessTokenPayload) { return this.service.customServices(user); }
  @Post('custom-services') createCustomService(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.createCustomService(user, body); }
  @Delete('custom-services/:id') deleteCustomService(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.deleteCustomService(user, id); }
  @Get('oauth/:provider/start') startOAuth(@CurrentUser() user: AccessTokenPayload, @Param('provider') provider: string, @Query('folderId') folderId?: string, @Query('connectionId') connectionId?: string, @Query('returnTo') returnTo?: string) { return this.service.beginOAuth(user, provider as any, folderId || null, connectionId || null, returnTo || null); }
  @Public() @Get('oauth/:provider/callback') async oauthCallback(@Param('provider') provider: string, @Res() response: Response, @Query('code') code?: string, @Query('state') state?: string, @Query('error') error?: string, @Query('error_description') errorDescription?: string) {
    if (error || !code || !state) {
      const result = await this.service.handleOAuthCallbackError(provider as any, state, error, errorDescription);
      const returnPath = result.returnPath || '/files/connections';
      const separator = returnPath.includes('?') ? '&' : '?';
      const target = `${returnPath}${separator}oauth=${encodeURIComponent(error || 'cancelled')}&provider=${encodeURIComponent(provider)}${errorDescription ? `&message=${encodeURIComponent(errorDescription)}` : ''}`;
      response.redirect(`${result.frontend}${target}`);
      return;
    }
    try {
      const result = await this.service.completeOAuth(provider as any, code, state);
      const target = result.folderId ? `/files?cloudImport=${encodeURIComponent(provider === "microsoft" ? "onedrive" : provider)}&folderId=${encodeURIComponent(result.folderId)}` : `${result.returnPath || '/files/connections'}${(result.returnPath || '/files/connections').includes('?') ? '&' : '?'}oauth=success&provider=${encodeURIComponent(provider)}&connectionId=${encodeURIComponent(result.connectionId)}`;
      response.redirect(`${result.frontend}${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OAuth authorization failed';
      const result = await this.service.handleOAuthCallbackError(provider as any, state, 'oauth_failed', message);
      const returnPath = result.returnPath || '/files/connections';
      const separator = returnPath.includes('?') ? '&' : '?';
      response.redirect(`${result.frontend}${returnPath}${separator}oauth=oauth_failed&provider=${encodeURIComponent(provider)}&message=${encodeURIComponent(message.slice(0, 300))}`);
    }
  }
  @Get() list(@CurrentUser() user: AccessTokenPayload, @Query('provider') provider?: string, @Query('status') status?: string, @Query('search') search?: string) { return this.service.list(user, { provider, status, search }); }
  @Get(':id/references') references(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.references(user, id); }
  @Get(':id/diagnostics') diagnostics(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.diagnostics(user, id); }
  @Get(':id/governance') governance(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.governance(user, id); }
  @Get(':id/secrets/versions') secretVersions(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.secretVersions(user, id); }
  @Post(':id/secrets/rotate') rotateSecret(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: any) { return this.service.rotateSecret(user, id, body?.secrets ?? body); }
  @Post(':id/secrets/rollback') rollbackSecret(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { version: number }) { return this.service.rollbackSecret(user, id, Number(body?.version)); }
  @Get(':id/health-history') healthHistory(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Query('limit') limit?: string) { return this.service.healthHistory(user, id, Number(limit ?? 20)); }
  @Get(':id/usage') usage(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.usage(user, id); }
  @Get(':id') get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.get(user, id); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: any) { return this.service.update(user, id, body); }
  @Post(':id/reconnect') reconnect(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.reconnect(user, id); }
  @Post(':id/transfer-ownership') transferOwnership(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { targetUserId?: string }) { return this.service.transferOwnership(user, id, String(body?.targetUserId ?? '')); }
  @Post(':id/test') test(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.test(user, id); }
  @Post(':id/disable') disable(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.disable(user, id); }
  @Post(':id/enable') enable(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.enable(user, id); }
  @Post(':id/revoke') revoke(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.revoke(user, id); }
  @Get(':id/shares') shares(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.shares(user, id); }
  @Post(':id/shares') share(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: { userId: string; role?: 'USE'|'MANAGE' }) { return this.service.share(user, id, body.userId, body.role as any); }
  @Delete(':id/shares/:userId') unshare(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Param('userId') userId: string) { return this.service.unshare(user, id, userId); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.remove(user, id); }
}
