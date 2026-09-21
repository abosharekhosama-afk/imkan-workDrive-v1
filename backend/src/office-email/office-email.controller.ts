import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { OfficeEmailService } from './office-email.service';

@Controller('office/email')
export class OfficeEmailController {
  constructor(private readonly email: OfficeEmailService) {}

  @Get('settings') get(@CurrentUser() user: AccessTokenPayload) { return this.email.getSettings(user); }
  @Patch('settings') update(@CurrentUser() user: AccessTokenPayload, @Body() body: Record<string, unknown>) { return this.email.updateSettings(user, body); }
  @Post('test') test(@CurrentUser() user: AccessTokenPayload, @Body() body: { to?: string }) { return this.email.testSettings(user, body?.to); }
}
