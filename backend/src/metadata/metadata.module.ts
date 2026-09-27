import { Module, forwardRef } from '@nestjs/common';
import { WorkflowsModule } from '../workflows/workflows.module';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({ imports: [forwardRef(() => WorkflowsModule)], controllers: [MetadataController], providers: [MetadataService], exports: [MetadataService] })
export class MetadataModule {}
