import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { QuotaModule } from '../quota/quota.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [StorageModule, QuotaModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
