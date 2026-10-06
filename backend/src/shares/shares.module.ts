import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { DlpModule } from '../dlp/dlp.module';
import { FollowsModule } from '../follows/follows.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [StorageModule, DlpModule, FollowsModule, NotificationsModule],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService], // <-- أضف هذا السطر
})
export class SharesModule {}