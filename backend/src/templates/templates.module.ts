import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { OfficeModule } from '../office/office.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { PublicTemplateSeedService } from './public-template-seed.service';

@Module({
  imports: [FilesModule, StorageModule, OfficeModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, PublicTemplateSeedService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
