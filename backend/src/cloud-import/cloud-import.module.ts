import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { CloudImportController } from './cloud-import.controller';
import { CloudImportService } from './cloud-import.service';

@Module({ imports: [StorageModule, WorkflowsModule], controllers: [CloudImportController], providers: [CloudImportService] })
export class CloudImportModule {}
