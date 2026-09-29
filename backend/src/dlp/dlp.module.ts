import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { StorageModule } from '../storage/storage.module';
import { DlpService } from './dlp.service';

@Module({ imports: [PermissionsModule, StorageModule], providers: [DlpService], exports: [DlpService] })
export class DlpModule {}
