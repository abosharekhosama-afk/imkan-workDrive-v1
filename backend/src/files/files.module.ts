import { Module, forwardRef } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { QuotaModule } from '../quota/quota.module';
import { RecentModule } from '../recent/recent.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { DlpModule } from '../dlp/dlp.module';

@Module({
  imports: [StorageModule, QuotaModule, RecentModule, forwardRef(() => WorkflowsModule), DlpModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

