import { Module } from '@nestjs/common';
import './common/bigint-serialization';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { FoldersModule } from './folders/folders.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { SearchModule } from './search/search.module';
import { MetadataModule } from './metadata/metadata.module';
import { SharesModule } from './shares/shares.module';
import { StorageModule } from './storage/storage.module';
import { TeamFoldersModule } from './team-folders/team-folders.module';
import { FavoritesModule } from './favorites/favorites.module';
import { RecentModule } from './recent/recent.module';
import { AdminModule } from './admin/admin.module';
import { QuotaModule } from './quota/quota.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationModule } from './organization/organization.module';
import { FolderPermissionsModule } from './folder-permissions/folder-permissions.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { CloudImportModule } from './cloud-import/cloud-import.module';
import { ExternalStorageModule } from './external-storage.module';
import { GroupsModule } from './groups/groups.module';
import { ConnectionsModule } from './connections/connections.module';
import { TemplatesModule } from './templates/templates.module';
import { OfficeModule } from './office/office.module';
import { OfficeEmailModule } from './office-email/office-email.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    AuthModule,
    FoldersModule,
    StorageModule,
    FilesModule,
    SharesModule,
    SearchModule,
    MetadataModule,
    AuditModule,
    TeamFoldersModule,
    FavoritesModule,
    RecentModule,
    NotificationsModule,
    CommentsModule,
    QuotaModule,
    AdminModule,
    OrganizationModule,
    FolderPermissionsModule,
    WorkflowsModule,
    CloudImportModule,
    ExternalStorageModule,
    GroupsModule,
    ConnectionsModule,
    TemplatesModule,
    OfficeModule,
    OfficeEmailModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
