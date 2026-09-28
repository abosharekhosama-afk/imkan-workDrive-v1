import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OfficeEmailModule } from '../office-email/office-email.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

@Module({
  imports: [NotificationsModule, OfficeEmailModule],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
