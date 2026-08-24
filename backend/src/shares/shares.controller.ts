import { Body, Controller, Get, Post } from '@nestjs/common';
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
