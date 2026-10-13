import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { BootstrapService } from './bootstrap.service';

@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  /**
   * Single entry payload for workspace first-paint:
   * user, root folder listing, favorites, storage quota, team folders, workspace policy.
   */
  @Get()
  load(@CurrentUser() user: AccessTokenPayload) {
    return this.bootstrap.load(user);
  }
}
