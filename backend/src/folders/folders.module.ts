import { Module, forwardRef } from '@nestjs/common';

import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { StorageModule } from '../storage/storage.module';
import { RecentModule } from '../recent/recent.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [StorageModule, RecentModule, WorkflowsModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
