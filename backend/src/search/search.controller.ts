import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseSearchQuery } from './parse-search-query';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(@CurrentUser() user: AccessTokenPayload, @Query('q') q: unknown) {
    return this.search.search(user, parseSearchQuery(q));
  }
}
