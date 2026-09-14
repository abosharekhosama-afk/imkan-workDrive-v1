import { Module } from '@nestjs/common';
import { FolderPermissionsController } from './folder-permissions.controller';
import { FolderPermissionsService } from './folder-permissions.service';
@Module({controllers:[FolderPermissionsController],providers:[FolderPermissionsService]})
export class FolderPermissionsModule {}
