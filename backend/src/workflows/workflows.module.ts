import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { SharesModule } from '../shares/shares.module';
@Module({ imports: [SharesModule], controllers: [WorkflowsController], providers: [WorkflowsService, WorkflowEngineService], exports: [WorkflowEngineService] })
export class WorkflowsModule {}
