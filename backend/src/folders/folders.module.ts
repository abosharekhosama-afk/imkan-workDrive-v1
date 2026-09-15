import { Module } from '@nestjs/common';

import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { StorageModule } from '../storage/storage.module';
import { RecentModule } from '../recent/recent.module';

@Module({
  imports: [StorageModule, RecentModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
