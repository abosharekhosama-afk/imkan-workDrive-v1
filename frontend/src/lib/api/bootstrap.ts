import { apiRequest } from "./client";
import type { FavoriteRecord } from "./favorites";
import type { FolderRecord, FileRecord } from "./types";
import type { QuotaOverview } from "./quota";
import { normalizeQuota } from "./quota";
import type { TeamFolderListItem } from "./team-folders";
import type { WorkspacePolicy } from "./organization";

/** User profile returned by /auth/me and /bootstrap. */
export type BootstrapUser = {
  id: string;
  name: string | null;
  email: string;
  status?: string;
  avatarUrl?: string | null;
  currentOrganizationId?: string | null;
  org_id: string;
  role: string;
  membershipId?: string;
  membershipStatus?: string;
};

export type BootstrapRootContents = {
  folders: FolderRecord[];
  files: FileRecord[];
  folderSizes?: Record<string, number> | null;
  folderUpdatedAt?: Record<string, string | null> | null;
};

export type WorkspaceBootstrap = {
  user: BootstrapUser;
  root: BootstrapRootContents;
  favorites: FavoriteRecord[];
  quota: QuotaOverview | null;
  teamFolders: TeamFolderListItem[];
  workspacePolicy: WorkspacePolicy | null;
  generatedAt: string;
};

type RawBootstrap = {
  user: BootstrapUser;
  root?: BootstrapRootContents;
  favorites?: FavoriteRecord[];
  quota?: unknown;
  teamFolders?: { teamFolders?: TeamFolderListItem[] } | TeamFolderListItem[];
  workspacePolicy?: WorkspacePolicy | null;
  generatedAt?: string;
};

const CACHE_TTL_MS = 15_000;
let cache: { payload: WorkspaceBootstrap; expiresAt: number } | null = null;
let inflight: Promise<WorkspaceBootstrap> | null = null;

function normalize(raw: RawBootstrap): WorkspaceBootstrap {
  const tf = raw.teamFolders;
  const teamFolders = Array.isArray(tf)
    ? tf
    : Array.isArray(tf?.teamFolders)
      ? tf.teamFolders
      : [];

  let quota: QuotaOverview | null = null;
  if (raw.quota && typeof raw.quota === "object") {
    try {
      quota = normalizeQuota(raw.quota as Parameters<typeof normalizeQuota>[0]);
    } catch {
      quota = null;
    }
  }

  return {
    user: raw.user,
    root: raw.root ?? { folders: [], files: [] },
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    quota,
    teamFolders,
    workspacePolicy: raw.workspacePolicy ?? null,
    generatedAt: raw.generatedAt ?? new Date().toISOString(),
  };
}

/** Fetch (or reuse in-flight) the workspace bootstrap payload. */
export function getWorkspaceBootstrap(options?: { force?: boolean }): Promise<WorkspaceBootstrap> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) {
    return Promise.resolve(cache.payload);
  }
  if (!force && inflight) return inflight;

  inflight = apiRequest<RawBootstrap>("/bootstrap")
    .then((raw) => {
      const payload = normalize(raw);
      cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
      return payload;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Invalidate cache after mutations that change root listing / favorites / etc. */
export function invalidateWorkspaceBootstrap(): void {
  cache = null;
}

/** Snapshot of the current cache without a network call (may be stale/null). */
export function peekWorkspaceBootstrap(): WorkspaceBootstrap | null {
  if (!cache) return null;
  if (cache.expiresAt <= Date.now()) return null;
  return cache.payload;
}
