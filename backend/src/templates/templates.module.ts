import { Module, forwardRef } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { OfficeModule } from '../office/office.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { PublicTemplateSeedService } from './public-template-seed.service';
import { TemplateAutomationWorkerService } from './template-automation-worker.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => FilesModule), StorageModule, forwardRef(() => OfficeModule), NotificationsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, PublicTemplateSeedService, TemplateAutomationWorkerService],
  exports: [TemplatesService, TemplateAutomationWorkerService],
})
export class TemplatesModule {}
