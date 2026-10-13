import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FoldersModule } from '../folders/folders.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { QuotaModule } from '../quota/quota.module';
import { TeamFoldersModule } from '../team-folders/team-folders.module';
import { OrganizationModule } from '../organization/organization.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [
    AuthModule,
    FoldersModule,
    FavoritesModule,
    QuotaModule,
    TeamFoldersModule,
    OrganizationModule,
  ],
  controllers: [BootstrapController],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
