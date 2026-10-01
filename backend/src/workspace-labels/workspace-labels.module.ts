import { Module } from '@nestjs/common';
import { WorkspaceLabelsController } from './workspace-labels.controller';
import { WorkspaceLabelsService } from './workspace-labels.service';
@Module({ controllers: [WorkspaceLabelsController], providers: [WorkspaceLabelsService] })
export class WorkspaceLabelsModule {}
