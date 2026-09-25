import { forwardRef, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ConnectionsModule } from '../connections/connections.module';
import { CloudImportController } from './cloud-import.controller';
import { CloudImportService } from './cloud-import.service';

@Module({ imports: [StorageModule, forwardRef(() => WorkflowsModule), ConnectionsModule], controllers: [CloudImportController], providers: [CloudImportService] })
export class CloudImportModule {}
