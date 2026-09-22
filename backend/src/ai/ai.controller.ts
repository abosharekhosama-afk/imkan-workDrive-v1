import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('files/:fileId/insights')
  fileInsights(@CurrentUser() user: AccessTokenPayload, @Param('fileId') fileId: string) {
    return this.ai.fileInsights(user, fileId);
  }
}
