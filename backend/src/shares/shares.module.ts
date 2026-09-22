import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { OfficeEmailModule } from '../office-email/office-email.module';
import { DlpModule } from '../dlp/dlp.module';

@Module({
  imports: [StorageModule, OfficeEmailModule, DlpModule],
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService], // <-- أضف هذا السطر
})
export class SharesModule {}