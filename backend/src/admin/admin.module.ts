import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';
import { DlpModule } from '../dlp/dlp.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { DataAdministrationService } from './data-administration.service';

@Module({
  imports: [DlpModule, GroupsModule, NotificationsModule, StorageModule],
  controllers: [AdminController, EnterpriseController],
  providers: [AdminService, EnterpriseService, DataAdministrationService],
})
export class AdminModule {}
