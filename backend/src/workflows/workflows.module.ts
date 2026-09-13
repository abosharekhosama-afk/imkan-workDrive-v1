import { Module } from '@nestjs/common';
import { SharesModule } from '../shares/shares.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';

@Module({ imports: [SharesModule], controllers: [WorkflowsController], providers: [WorkflowsService, WorkflowEngineService], exports: [WorkflowEngineService] })
export class WorkflowsModule {}
