import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenPayload } from './jwt.types';
import { AuthService } from '../auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('signup') signup(@Body() body: { name: string; email: string; password: string; inviteToken?: string }) { return this.auth.signup(body); }
  @Public() @Post('login') login(@Body() body: { email: string; password: string; organizationId?: string }, @Req() req: Request) { return this.auth.login(body, { ipAddress: req.ip, userAgent: req.headers['user-agent'] }); }
  @Post('logout') logout(@CurrentUser() user: AccessTokenPayload) { return this.auth.logout(user); }
  @Post('logout-all') logoutAll(@CurrentUser() user: AccessTokenPayload) { return this.auth.logoutAll(user); }
  @Get('sessions') sessions(@CurrentUser() user: AccessTokenPayload) { return this.auth.sessions(user); }
  @Get('security-events') securityEvents(@CurrentUser() user: AccessTokenPayload) { return this.auth.securityEvents(user); }
  @Delete('sessions/:id') revokeSession(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.auth.revokeSession(user, id); }
  @Public() @Post('forgot-password') forgotPassword(@Body() body: { email: string }) { return this.auth.forgotPassword(body.email); }
  @Public() @Post('reset-password') resetPassword(@Body() body: { token: string; password: string }) { return this.auth.resetPassword(body.token, body.password); }
  @Get('me') me(@CurrentUser() user: AccessTokenPayload) { return this.auth.me(user); }
  @Post('profile') updateProfile(@CurrentUser() user: AccessTokenPayload, @Body() body: { name: string }) { return this.auth.updateProfile(user, body.name); }
  @Get('preferences') preferences(@CurrentUser() user: AccessTokenPayload) { return this.auth.preferences(user); }
  @Patch('preferences') updatePreferences(@CurrentUser() user: AccessTokenPayload, @Body() body: { themeMode?: string; themeColor?: string; fontFamily?: string; lighterSidebar?: boolean }) { return this.auth.updatePreferences(user, body); }
  @Post('change-password') changePassword(@CurrentUser() user: AccessTokenPayload, @Body() body: { currentPassword: string; newPassword: string }) { return this.auth.changePassword(user, body.currentPassword, body.newPassword); }
  @Get('memberships') memberships(@CurrentUser() user: AccessTokenPayload) { return this.auth.getUserMemberships(user.sub); }
  @Post('organizations/switch') switchOrganization(@CurrentUser() user: AccessTokenPayload, @Body() body: { organizationId: string }) { return this.auth.switchOrganization(user, body.organizationId); }
  @Public() @Get('google') google() { return this.auth.googleStart(); }
  @Public() @Get('google/callback') async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() response: Response) { const result = await this.auth.googleCallback(code, state); response.redirect(`${this.auth.frontendUrl()}/auth/callback?token=${encodeURIComponent(result.access_token)}`); }
}
