import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { SharesModule } from '../shares/shares.module';
import { CustomFunctionExecutor } from './custom-function.executor';
import { ConnectionsModule } from '../connections/connections.module';
import { TemplatesModule } from '../templates/templates.module';
@Module({ imports: [SharesModule, ConnectionsModule, TemplatesModule], controllers: [WorkflowsController], providers: [WorkflowsService, WorkflowEngineService, CustomFunctionExecutor], exports: [WorkflowEngineService] })
export class WorkflowsModule {}
