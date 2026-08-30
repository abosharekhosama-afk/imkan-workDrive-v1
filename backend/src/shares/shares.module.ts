import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [StorageModule],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
