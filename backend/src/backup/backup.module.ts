import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { BackupController } from './backup.controller';
import { BackupCryptoService } from './backup-crypto.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

@Module({
  imports: [PrismaModule, StorageModule, ConfigModule],
  controllers: [BackupController],
  providers: [BackupService, BackupCryptoService, BackupSchedulerService],
  exports: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
