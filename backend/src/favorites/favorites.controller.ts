import {
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { ResourceType } from '@prisma/client';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.favorites.list(user);
  }

  @Post(':resourceType/:resourceId')
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('resourceType', new ParseEnumPipe(ResourceType)) type: ResourceType,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.favorites.add(user, type, id);
  }

  @Delete(':resourceType/:resourceId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('resourceType', new ParseEnumPipe(ResourceType)) type: ResourceType,
    @Param('resourceId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.favorites.remove(user, type, id);
  }
}
