import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Body } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { TemplateLibraryType } from '@prisma/client';
import { TemplatesService } from './templates.service';
import { parseCategory, parseTemplateFromFile, parseTemplateUpdate, parseTemplateUse } from './templates.schemas';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: { library?: string; categoryId?: string; type?: string; q?: string; sort?: string }) {
    return this.templates.list(user, query);
  }

  @Get('categories')
  categories(@CurrentUser() user: AccessTokenPayload, @Query('library') library?: string) {
    const type = Object.values(TemplateLibraryType).includes(library as TemplateLibraryType) ? library as TemplateLibraryType : TemplateLibraryType.PERSONAL;
    return this.templates.listCategories(user, type);
  }

  @Get('capabilities')
  capabilities(@CurrentUser() user: AccessTokenPayload, @Query('library') library?: string) {
    const type = Object.values(TemplateLibraryType).includes(library as TemplateLibraryType) ? library as TemplateLibraryType : TemplateLibraryType.PERSONAL;
    return this.templates.capabilities(user, type);
  }

  @Get('trash')
  trash(@CurrentUser() user: AccessTokenPayload) { return this.templates.trash(user); }

  @Get(':id/versions')
  versions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.versions(user, id); }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.get(user, id); }

  @Post('from-file')
  saveFromFile(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.templates.saveFromFile(user, parseTemplateFromFile(body)); }

  @Patch(':id')
  update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.update(user, id, parseTemplateUpdate(body)); }

  @Post(':id/from-file')
  updateFromFile(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.updateFromFile(user, id, parseTemplateFromFile(body)); }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.duplicate(user, id, body); }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.remove(user, id); }

  @Post(':id/versions/:versionId/use')
  useVersion(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string, @Body() body: unknown) { return this.templates.useVersion(user, id, versionId, parseTemplateUse(body)); }

  @Post(':id/restore')
  restore(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.restore(user, id); }

  @Delete(':id/permanent')
  purge(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.purge(user, id); }

  @Post(':id/use')
  use(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.use(user, id, parseTemplateUse(body)); }

  @Post('categories')
  createCategory(@CurrentUser() user: AccessTokenPayload, @Query('library') library: string | undefined, @Body() body: unknown) {
    const type = Object.values(TemplateLibraryType).includes(library as TemplateLibraryType) ? library as TemplateLibraryType : TemplateLibraryType.PERSONAL;
    return this.templates.createCategory(user, type, parseCategory(body).name);
  }

  @Patch('categories/:id')
  renameCategory(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.renameCategory(user, id, parseCategory(body).name); }

  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.deleteCategory(user, id); }
}
