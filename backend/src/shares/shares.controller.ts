import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { Public } from '../auth/public.decorator';
import { parseCreateShare } from './create-share.schema';
import { SharesService } from './shares.service';
import { parseVerifyShare } from './verify-share.schema';

@Controller()
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Get('shares/with-me')
  withMe(@CurrentUser() user: AccessTokenPayload) { return this.shares.listSharedWithMe(user); }

  @Get('shares/by-me')
  byMe(@CurrentUser() user: AccessTokenPayload) { return this.shares.listSharedByMe(user); }

  @Patch('shares/:id/recipients/:userId')
  updateRecipient(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Param('userId') userId: string, @Body() body: { permission?: string }) { return this.shares.updateRecipient(user, id, userId, body.permission ?? 'VIEW'); }

  @Delete('shares/:id/recipients/:userId')
  removeRecipient(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Param('userId') userId: string) { return this.shares.removeRecipient(user, id, userId); }

  @Delete('shares/:id')
  revokeShare(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.shares.revokeShare(user, id); }

  @Post('shares')
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.shares.createShare(user, parseCreateShare(body));
  }

  @Public()
  @Post('share/public')
  verify(@Body() body: unknown) {
    const input = parseVerifyShare(body);
    return this.shares.verifyPublicShare(input.token, input.password);
  }
}
