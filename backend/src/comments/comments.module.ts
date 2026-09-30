import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { FollowsModule } from '../follows/follows.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({ imports: [NotificationsModule, FollowsModule, PermissionsModule], controllers: [CommentsController], providers: [CommentsService] })
export class CommentsModule {}
