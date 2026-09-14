import { Module, forwardRef } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { QuotaModule } from '../quota/quota.module';
import { RecentModule } from '../recent/recent.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [StorageModule, QuotaModule, RecentModule, forwardRef(() => WorkflowsModule)],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}

