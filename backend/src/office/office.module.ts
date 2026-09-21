import { Module, forwardRef } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { StorageModule } from '../storage/storage.module';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';
import { OfficeCollaborationService } from './office-collaboration.service';
import { OfficeConversionService } from './office-conversion.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [forwardRef(() => FilesModule), PermissionsModule, StorageModule, NotificationsModule, forwardRef(() => WorkflowsModule)],
  controllers: [OfficeController],
  providers: [OfficeService, OfficeConversionService, OfficeCollaborationService],
  exports: [OfficeService],
})
export class OfficeModule {}
