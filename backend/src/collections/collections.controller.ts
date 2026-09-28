import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { Public } from '../auth/public.decorator';
import { CollectionsService } from './collections.service';
@Controller('collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}
  @Get() list(@CurrentUser() user: AccessTokenPayload) { return this.service.list(user); }
  @Post() create(@CurrentUser() user: AccessTokenPayload, @Body() body: any) { return this.service.create(user, body); }
  @Patch(':id') update(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: any) { return this.service.update(user, id, body); }
  @Delete(':id') remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.remove(user, id); }
  @Get('public/:token') @Public() publicInfo(@Param('token') token: string) { return this.service.publicInfo(token); }
  @Post('public/:token/upload-request') @Public() uploadRequest(@Param('token') token: string, @Body() body: any) { return this.service.publicUploadRequest(token, body); }
  @Post('public/:token/complete') @Public() completePublicUpload(@Param('token') token: string, @Body() body: any) { return this.service.completePublicUpload(token, body); }
  @Get(':id/submissions') submissions(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) { return this.service.submissions(user, id); }
}
