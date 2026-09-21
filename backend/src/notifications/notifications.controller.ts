import { Controller, Get, Param, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { NotificationsService } from './notifications.service';
import { map } from 'rxjs';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly s:NotificationsService){}
  @Get() list(@CurrentUser()u:AccessTokenPayload){return this.s.list(u)}
  @Get('unread-count') count(@CurrentUser()u:AccessTokenPayload){return this.s.unreadCount(u)}
  @Get('office-preferences') officePreferences(@CurrentUser()u:AccessTokenPayload){return this.s.getOfficePreferences(u)}
  @Post('office-preferences') updateOfficePreferences(@CurrentUser()u:AccessTokenPayload,@Body()body:Record<string, unknown>){return this.s.updateOfficePreferences(u, body as any)}
  @Sse('stream') stream(@CurrentUser()u:AccessTokenPayload){return this.s.streamForUser(u.sub).pipe(map(event => ({ data: event.notification } as MessageEvent)));}
  @Post('read-all') all(@CurrentUser()u:AccessTokenPayload){return this.s.markAllRead(u)}
  @Post(':id/read') read(@CurrentUser()u:AccessTokenPayload,@Param('id')id:string){return this.s.markRead(u,id)}
}
