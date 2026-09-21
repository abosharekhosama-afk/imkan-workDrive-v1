import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Body } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { TemplateLibraryType } from '@prisma/client';
import { TemplatesService } from './templates.service';
import { parseCategory, parseTemplateCreate, parseTemplateFromFile, parseTemplateUpdate, parseTemplateUse, parseTemplateVariable, parseTemplateBuilder } from './templates.schemas';

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

  @Get(':id/variables')
  variables(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.templates.listVariables(user, id);
  }

  @Post(':id/variables')
  createVariable(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    return this.templates.createVariable(user, id, parseTemplateVariable(body));
  }

  @Patch(':id/variables/:variableId')
  updateVariable(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('variableId', new ParseUUIDPipe({ version: '4' })) variableId: string, @Body() body: unknown) {
    return this.templates.updateVariable(user, id, variableId, parseTemplateVariable(body));
  }

  @Delete(':id/variables/:variableId')
  deleteVariable(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('variableId', new ParseUUIDPipe({ version: '4' })) variableId: string) {
    return this.templates.deleteVariable(user, id, variableId);
  }

  @Get(':id/builder')
  builder(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.getBuilder(user, id); }

  @Put(':id/builder')
  saveBuilder(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.saveBuilder(user, id, parseTemplateBuilder(body)); }

  @Post(':id/builder/publish')
  publishBuilder(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.publishBuilder(user, id); }

  @Post(':id/builder/unpublish')
  unpublishBuilder(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.unpublishBuilder(user, id); }

  @Get(':id/versions')
  versions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.versions(user, id); }

  @Get(':id/activity')
  activity(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.templates.activity(user, id, Number.isFinite(parsed) ? parsed : 50);
  }

  @Get(':id/versions/compare')
  compareVersions(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query('left') left: string, @Query('right') right: string) {
    return this.templates.compareVersions(user, id, left, right);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string) {
    return this.templates.restoreVersion(user, id, versionId);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.templates.get(user, id); }

  @Post('from-blank')
  createFromBlank(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.templates.createFromBlank(user, parseTemplateCreate(body)); }

  @Post('from-file')
  saveFromFile(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) { return this.templates.saveFromFile(user, parseTemplateFromFile(body)); }

  @Patch(':id')
  update(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.update(user, id, parseTemplateUpdate(body)); }

  @Post(':id/from-file')
  updateFromFile(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) { return this.templates.updateFromFile(user, id, parseTemplateFromFile(body)); }

  @Post(':id/publish-content')
  publishContent(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    return this.templates.publishContentFromOffice(user, id, {
      fileId: typeof b.fileId === 'string' ? b.fileId : '',
      versionNote: typeof b.versionNote === 'string' ? b.versionNote : null,
    });
  }

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

  @Post(':id/automation/validate')
  validateAutomation(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values as Record<string, unknown> : {};
    return this.templates.validateAutomation(user, id, values);
  }

  @Post(':id/certify')
  certify(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.templates.certifyTemplate(user, id);
  }

  @Get('automation/jobs/:jobId')
  automationJob(@CurrentUser() user: AccessTokenPayload, @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string) {
    return this.templates.getAutomationJob(user, jobId);
  }

  @Post(':id/automation/queue')
  queueAutomation(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Generated document';
    const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values as Record<string, unknown> : {};
    return this.templates.enqueueAutomation(user, id, { name, folderId: typeof b.folderId === 'string' ? b.folderId : null, values, generatePdf: b.generatePdf === true, pdfFolderId: typeof b.pdfFolderId === 'string' ? b.pdfFolderId : null });
  }

  @Get(':id/automation/runs')
  automationRuns(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.templates.listAutomationRuns(user, id, Number.isFinite(parsed) ? parsed : 20);
  }

  @Post(':id/automation/run')
  automate(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Generated document';
    const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? b.values as Record<string, unknown> : {};
    return this.templates.automateFromTemplate(user, id, { name, folderId: typeof b.folderId === 'string' ? b.folderId : null, values, generatePdf: b.generatePdf === true, pdfFolderId: typeof b.pdfFolderId === 'string' ? b.pdfFolderId : null });
  }

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
