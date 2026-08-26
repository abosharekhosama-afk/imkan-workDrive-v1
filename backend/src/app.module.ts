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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
