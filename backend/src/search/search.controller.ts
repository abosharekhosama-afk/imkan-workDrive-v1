import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { parseSearchFilter } from './parse-search-filter';
import { parseSearchQuery } from './parse-search-query';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(@CurrentUser() user: AccessTokenPayload, @Query('q') q: unknown, @Query('filter') filter: unknown, @Query('type') type: unknown, @Query('owner') owner: unknown, @Query('dateField') dateField: unknown, @Query('dateFrom') dateFrom: unknown, @Query('dateTo') dateTo: unknown, @Query('page') page: unknown, @Query('limit') limit: unknown, @Query('tag') tag: unknown, @Query('field') field: unknown, @Query('sort') sort: unknown, @Query('dataTemplate') dataTemplate: unknown) {
    const parsedPage = typeof page === 'string' && /^\d+$/.test(page) ? Number(page) : 1;
    const parsedLimit = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : 25;
    const parsedTags = typeof tag === 'string' ? tag.split(',').map((x) => x.trim()).filter(Boolean) : [];
    const normalizedSort = sort === 'updated' || sort === 'created' || sort === 'name' || sort === 'relevance' ? sort : 'relevance';
    return this.search.search(user, parseSearchQuery(q), parseSearchFilter(filter), {
      type: typeof type === 'string' ? type : undefined, owner: typeof owner === 'string' ? owner : undefined,
      dateField: dateField === 'created' ? 'created' : 'modified', dateFrom: typeof dateFrom === 'string' && dateFrom ? dateFrom : undefined, dateTo: typeof dateTo === 'string' && dateTo ? dateTo : undefined,
      page: Math.min(parsedPage, 10000), limit: Math.min(parsedLimit, 100), tags: parsedTags, customField: typeof field === 'string' ? field : undefined, sort: normalizedSort, dataTemplateId: typeof dataTemplate === 'string' ? dataTemplate : undefined,
    });
  }
}
