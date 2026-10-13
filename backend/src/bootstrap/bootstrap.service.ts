import { Injectable } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { AuthService } from '../auth.service';
import { FoldersService } from '../folders/folders.service';
import { FavoritesService } from '../favorites/favorites.service';
import { QuotaService } from '../quota/quota.service';
import { TeamFoldersService } from '../team-folders/team-folders.service';
import { OrganizationService } from '../organization/organization.service';

/**
 * Aggregates the data the workspace needs on first paint into a single round-trip.
 * Individual failures are isolated so a slow/optional subsystem cannot blank the UI.
 */
@Injectable()
export class BootstrapService {
  constructor(
    private readonly auth: AuthService,
    private readonly folders: FoldersService,
    private readonly favorites: FavoritesService,
    private readonly quota: QuotaService,
    private readonly teamFolders: TeamFoldersService,
    private readonly organization: OrganizationService,
  ) {}

  async load(user: AccessTokenPayload) {
    const settled = await Promise.allSettled([
      this.auth.me(user),
      this.folders.listContents(user, undefined, {}),
      this.favorites.list(user),
      this.quota.get(user),
      this.teamFolders.list(user),
      this.organization.workspacePolicy(user),
    ]);

    const value = <T>(index: number, fallback: T): T => {
      const result = settled[index];
      if (result && result.status === 'fulfilled') return result.value as T;
      return fallback;
    };

    const userProfile = value(0, null);
    // User is required — if me() failed, rethrow the original rejection.
    if (!userProfile) {
      const first = settled[0];
      if (first && first.status === 'rejected') throw first.reason;
      throw new Error('Unable to load user profile');
    }

    return {
      user: userProfile,
      root: value(1, { folders: [], files: [], folderSizes: {}, folderUpdatedAt: {} }),
      favorites: value(2, []),
      quota: value(3, null),
      teamFolders: value(4, { teamFolders: [] }),
      workspacePolicy: value(5, null),
      generatedAt: new Date().toISOString(),
    };
  }
}
