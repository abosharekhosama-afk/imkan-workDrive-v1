import { Module } from '@nestjs/common';

import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}