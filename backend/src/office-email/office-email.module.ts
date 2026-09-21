import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { StorageModule } from '../storage/storage.module';
import { OfficeEmailController } from './office-email.controller';
import { OfficeEmailService } from './office-email.service';

@Module({ imports: [ConnectionsModule, StorageModule], controllers: [OfficeEmailController], providers: [OfficeEmailService], exports: [OfficeEmailService] })
export class OfficeEmailModule {}
