import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { CollaborationService } from './collaboration.service';
@Controller('collaboration')
export class CollaborationController { constructor(private readonly service: CollaborationService) {} @Get('overview') overview(@CurrentUser() user: AccessTokenPayload, @Query('limit') limit?: string) { const parsed=Number(limit??50); return this.service.overview(user,Number.isFinite(parsed)?parsed:50); } }
