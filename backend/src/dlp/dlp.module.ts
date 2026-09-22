import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { DlpService } from './dlp.service';

@Module({ imports: [PermissionsModule], providers: [DlpService], exports: [DlpService] })
export class DlpModule {}
