import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { RecentService } from './recent.service';

@Controller('workspace/recent')
export class RecentController {
  constructor(private readonly recent: RecentService) { }
  @Get()
  list(@CurrentUser() user: AccessTokenPayload) { return this.recent.list(user); }
}
