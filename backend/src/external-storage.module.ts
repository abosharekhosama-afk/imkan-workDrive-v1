import { Module } from '@nestjs/common';
import { ConnectionsModule } from './connections/connections.module';
import { OfficeModule } from './office/office.module';
import { ExternalStorageController } from './external-storage.controller';
import { ExternalStorageService } from './external-storage.service';
import { NotificationsModule } from './notifications/notifications.module';

@Module({ imports: [ConnectionsModule, OfficeModule, NotificationsModule], controllers: [ExternalStorageController], providers: [ExternalStorageService], exports: [ExternalStorageService] })
export class ExternalStorageModule {}
