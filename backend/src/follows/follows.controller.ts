import {
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ResourceType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { FollowsService } from './follows.service';

@Controller('follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.follows.list(user);
  }

  @Post(':resourceType/:resourceId')
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('resourceType', new ParseEnumPipe(ResourceType)) type: ResourceType,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.follows.add(user, type, id);
  }

  @Delete(':resourceType/:resourceId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('resourceType', new ParseEnumPipe(ResourceType)) type: ResourceType,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.follows.remove(user, type, id);
  }
}
