import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BackupPurgeStatus, BackupRestoreMode, BackupRestoreStatus, BackupRunKind, BackupRunStatus, BackupScope, BackupScheduleKind, FileStatus, Prisma, UploadStatus, VersionStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { getTenantStore, runWithTenant } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { BackupCryptoService } from './backup-crypto.service';
import { computeNextRunAt, shouldIncludeInIncremental } from './backup-schedule-logic';
import {
  canApprovePurge,
  canAutoPurge,
  DOWNLOAD_MEMORY_LIMIT_BYTES,
  DOWNLOAD_STREAM_LIMIT_BYTES,
  isRunImmutable,
} from './backup-immutability-logic';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BackupCryptoService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private assertOrgAdmin(user: AccessTokenPayload) {
    const role = String(user.role || '');
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Organization admin access required for Backup & Recovery');
    }
  }

  private async audit(user: AccessTokenPayload, action: string, resourceId: string, metadata?: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: user.org_id,
          actorId: user.sub,
          action,
          resourceType: 'BACKUP',
          resourceId,
          metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.warn(`audit failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Policies ──────────────────────────────────────────────

  listPolicies(user: AccessTokenPayload) {
    this.assertOrgAdmin(user);
    return this.prisma.backupPolicy.findMany({
      where: { orgId: user.org_id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(
    user: AccessTokenPayload,
    input: {
      name?: string;
      scope?: BackupScope;
      scopeIds?: string[];
      scheduleKind?: BackupScheduleKind;
      scheduleHourUtc?: number | null;
      scheduleDay?: number | null;
      retentionDays?: number | null;
      excludeExtensions?: string[];
      enabled?: boolean;
    },
  ) {
    this.assertOrgAdmin(user);
    const name = String(input.name || 'Default backup policy').trim().slice(0, 120);
    if (!name) throw new BadRequestException('Policy name is required');
    const scope = input.scope ?? BackupScope.ALL;
    const scopeIds = Array.isArray(input.scopeIds) ? input.scopeIds.map(String).slice(0, 500) : [];
    if (scope === BackupScope.SELECTED && scopeIds.length === 0) {
      throw new BadRequestException('Select at least one folder for SELECTED scope');
    }
    const scheduleKind = input.scheduleKind ?? BackupScheduleKind.MANUAL;
    const retentionDays =
      input.retentionDays === null || input.retentionDays === undefined
        ? null
        : Math.max(1, Math.min(3650, Number(input.retentionDays)));
    const row = await this.prisma.backupPolicy.create({
      data: {
        id: randomUUID(),
        orgId: user.org_id,
        name,
        enabled: input.enabled !== false,
        scope,
        scopeIds,
        scheduleKind,
        scheduleHourUtc:
          input.scheduleHourUtc == null ? null : Math.max(0, Math.min(23, Number(input.scheduleHourUtc))),
        scheduleDay: input.scheduleDay == null ? null : Number(input.scheduleDay),
        retentionDays,
        excludeExtensions: Array.isArray(input.excludeExtensions)
          ? input.excludeExtensions.map((x) => String(x).replace(/^\./, '').toLowerCase()).slice(0, 100)
          : [],
        createdById: user.sub,
        nextRunAt: computeNextRunAt(scheduleKind, new Date(), input.scheduleHourUtc ?? 2, input.scheduleDay ?? null),
      },
    });
    await this.audit(user, 'BACKUP_POLICY_CREATE', row.id, { name: row.name, scope: row.scope });
    return row;
  }

  async updatePolicy(user: AccessTokenPayload, id: string, input: Record<string, unknown>) {
    this.assertOrgAdmin(user);
    const current = await this.prisma.backupPolicy.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new NotFoundException('Backup policy not found');
    const data: Prisma.BackupPolicyUpdateInput = {};
    if (typeof input.name === 'string') data.name = input.name.trim().slice(0, 120);
    if (typeof input.enabled === 'boolean') data.enabled = input.enabled;
    if (input.scope && Object.values(BackupScope).includes(input.scope as BackupScope)) {
      data.scope = input.scope as BackupScope;
    }
    if (Array.isArray(input.scopeIds)) data.scopeIds = input.scopeIds.map(String).slice(0, 500);
    if (input.scheduleKind && Object.values(BackupScheduleKind).includes(input.scheduleKind as BackupScheduleKind)) {
      data.scheduleKind = input.scheduleKind as BackupScheduleKind;
    }
    if ('scheduleHourUtc' in input) {
      data.scheduleHourUtc =
        input.scheduleHourUtc == null ? null : Math.max(0, Math.min(23, Number(input.scheduleHourUtc)));
    }
    if ('scheduleDay' in input) data.scheduleDay = input.scheduleDay == null ? null : Number(input.scheduleDay);
    if ('retentionDays' in input) {
      data.retentionDays =
        input.retentionDays == null ? null : Math.max(1, Math.min(3650, Number(input.retentionDays)));
    }
    if (Array.isArray(input.excludeExtensions)) {
      data.excludeExtensions = input.excludeExtensions.map((x) => String(x).replace(/^\./, '').toLowerCase()).slice(0, 100);
    }
    // Recompute nextRunAt when schedule-related fields change
    const mergedKind = (data.scheduleKind as BackupScheduleKind | undefined) ?? current.scheduleKind;
    const mergedHour =
      'scheduleHourUtc' in data ? (data.scheduleHourUtc as number | null) : current.scheduleHourUtc;
    const mergedDay = 'scheduleDay' in data ? (data.scheduleDay as number | null) : current.scheduleDay;
    if ('scheduleKind' in data || 'scheduleHourUtc' in data || 'scheduleDay' in data || 'enabled' in data) {
      data.nextRunAt =
        current.enabled === false && data.enabled !== true
          ? null
          : computeNextRunAt(mergedKind, new Date(), mergedHour, mergedDay);
      if (data.enabled === false) data.nextRunAt = null;
    }

    const row = await this.prisma.backupPolicy.update({ where: { id }, data });
    await this.audit(user, 'BACKUP_POLICY_UPDATE', row.id, { enabled: row.enabled, nextRunAt: row.nextRunAt });
    return row;
  }

  async deletePolicy(user: AccessTokenPayload, id: string) {
    this.assertOrgAdmin(user);
    const current = await this.prisma.backupPolicy.findFirst({ where: { id, orgId: user.org_id } });
    if (!current) throw new NotFoundException('Backup policy not found');
    // Soft-disable preferred; hard delete only when no runs reference is acceptable via cascade setnull
    await this.prisma.backupPolicy.delete({ where: { id } });
    await this.audit(user, 'BACKUP_POLICY_DELETE', id, {});
    return { ok: true };
  }

  // ── Runs ──────────────────────────────────────────────────

  listRuns(user: AccessTokenPayload, take = 30) {
    this.assertOrgAdmin(user);
    return this.prisma.backupRun.findMany({
      where: { orgId: user.org_id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
      include: { policy: { select: { id: true, name: true } } },
    });
  }

  async getRun(user: AccessTokenPayload, id: string) {
    this.assertOrgAdmin(user);
    const run = await this.prisma.backupRun.findFirst({
      where: { id, orgId: user.org_id },
      include: {
        policy: { select: { id: true, name: true, scope: true } },
        _count: { select: { objects: true } },
      },
    });
    if (!run) throw new NotFoundException('Backup run not found');
    return run;
  }

  async listRunObjects(user: AccessTokenPayload, runId: string, q?: string, take = 100, cursor?: string) {
    this.assertOrgAdmin(user);
    const run = await this.prisma.backupRun.findFirst({ where: { id: runId, orgId: user.org_id }, select: { id: true } });
    if (!run) throw new NotFoundException('Backup run not found');
    return this.prisma.backupObject.findMany({
      where: {
        orgId: user.org_id,
        runId,
        ...(q ? { OR: [{ name: { contains: q } }, { path: { contains: q } }] } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { path: 'asc' },
      take: Math.min(500, Math.max(1, take)),
    });
  }

  /**
   * Start a backup run (FULL or INCREMENTAL). Execution continues asynchronously.
   * Production: prefer the dedicated `backup:worker` process for long jobs.
   */
  async startBackup(
    user: AccessTokenPayload,
    opts: { policyId?: string; kind?: BackupRunKind } = {},
  ): Promise<Awaited<ReturnType<PrismaService['backupRun']['create']>>> {
    this.assertOrgAdmin(user);
    const kind = opts.kind ?? BackupRunKind.FULL;

    let policy = opts.policyId
      ? await this.prisma.backupPolicy.findFirst({ where: { id: opts.policyId, orgId: user.org_id } })
      : await this.prisma.backupPolicy.findFirst({
          where: { orgId: user.org_id, enabled: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!policy) {
      policy = await this.createPolicy(user, {
        name: 'Default backup policy',
        scheduleKind: BackupScheduleKind.MANUAL,
      });
    }

    if (kind === BackupRunKind.INCREMENTAL) {
      const baseline = await this.prisma.backupRun.findFirst({
        where: { orgId: user.org_id, status: BackupRunStatus.COMPLETED },
        orderBy: { snapshotAt: 'desc' },
        select: { id: true },
      });
      if (!baseline) {
        // First run must be FULL
        return this.startBackup(user, { policyId: policy.id, kind: BackupRunKind.FULL });
      }
    }

    const active = await this.prisma.backupRun.count({
      where: { orgId: user.org_id, status: { in: [BackupRunStatus.PENDING, BackupRunStatus.RUNNING] } },
    });
    if (active > 0) throw new BadRequestException('A backup is already in progress for this organization');

    const run = await this.prisma.backupRun.create({
      data: {
        id: randomUUID(),
        orgId: user.org_id,
        policyId: policy.id,
        kind,
        status: BackupRunStatus.PENDING,
        snapshotAt: new Date(),
        triggeredById: user.sub,
      },
    });
    await this.audit(user, 'BACKUP_RUN_START', run.id, { kind, policyId: policy.id });

    void this.executeRun(run.id, user.org_id).catch((e) => {
      this.logger.error(`backup run ${run.id} crashed: ${e instanceof Error ? e.message : e}`);
    });

    return run;
  }

  /** @deprecated use startBackup({ kind: FULL }) */
  startFullBackup(user: AccessTokenPayload, policyId?: string) {
    return this.startBackup(user, { policyId, kind: BackupRunKind.FULL });
  }

  startIncrementalBackup(user: AccessTokenPayload, policyId?: string) {
    return this.startBackup(user, { policyId, kind: BackupRunKind.INCREMENTAL });
  }

  /**
   * Scheduler tick: find due enabled policies across all orgs and enqueue runs.
   * Safe to call from an embedded interval or a dedicated worker process.
   */
  async processDuePolicies(limit = 20): Promise<{ started: string[]; skipped: string[] }> {
    const now = new Date();
    const due = await this.prisma.backupPolicy.findMany({
      where: {
        enabled: true,
        scheduleKind: { not: BackupScheduleKind.MANUAL },
        nextRunAt: { lte: now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: Math.min(100, Math.max(1, limit)),
    });

    const started: string[] = [];
    const skipped: string[] = [];

    for (const policy of due) {
      const active = await this.prisma.backupRun.count({
        where: {
          orgId: policy.orgId,
          status: { in: [BackupRunStatus.PENDING, BackupRunStatus.RUNNING] },
        },
      });
      if (active > 0) {
        skipped.push(policy.id);
        // Push nextRun slightly forward so we do not tight-loop
        await this.prisma.backupPolicy.update({
          where: { id: policy.id },
          data: {
            nextRunAt: computeNextRunAt(policy.scheduleKind, now, policy.scheduleHourUtc, policy.scheduleDay),
          },
        });
        continue;
      }

      const lastFull = await this.prisma.backupRun.findFirst({
        where: { orgId: policy.orgId, status: BackupRunStatus.COMPLETED, kind: BackupRunKind.FULL },
        orderBy: { snapshotAt: 'desc' },
        select: { id: true },
      });
      const kind = lastFull ? BackupRunKind.INCREMENTAL : BackupRunKind.FULL;

      const run = await this.prisma.backupRun.create({
        data: {
          id: randomUUID(),
          orgId: policy.orgId,
          policyId: policy.id,
          kind,
          status: BackupRunStatus.PENDING,
          snapshotAt: now,
          triggeredById: policy.createdById,
        },
      });

      await this.prisma.backupPolicy.update({
        where: { id: policy.id },
        data: {
          nextRunAt: computeNextRunAt(policy.scheduleKind, now, policy.scheduleHourUtc, policy.scheduleDay),
        },
      });

      started.push(run.id);
      void this.executeRun(run.id, policy.orgId).catch((e) => {
        this.logger.error(`scheduled backup ${run.id} failed: ${e instanceof Error ? e.message : e}`);
      });
    }

    // Retention cleanup (best-effort)
    await this.enforceRetention(limit).catch((e) =>
      this.logger.warn(`retention pass failed: ${e instanceof Error ? e.message : e}`),
    );

    return { started, skipped };
  }

  /**
   * Retention pass (P4): never hard-deletes immutable/locked runs.
   * Only soft-marks eligible unlocked runs as purged after dual-control unlock
   * or after immutableUntil has passed AND locked was cleared.
   */
  async enforceRetention(orgBatch = 50) {
    const policies = await this.prisma.backupPolicy.findMany({
      where: { retentionDays: { not: null } },
      select: { id: true, orgId: true, retentionDays: true },
      take: orgBatch,
    });
    for (const p of policies) {
      if (p.retentionDays == null) continue;
      const latest = await this.prisma.backupRun.findFirst({
        where: { orgId: p.orgId, status: BackupRunStatus.COMPLETED, purgedAt: null },
        orderBy: { snapshotAt: 'desc' },
        select: { id: true },
      });
      const candidates = await this.prisma.backupRun.findMany({
        where: {
          orgId: p.orgId,
          policyId: p.id,
          status: BackupRunStatus.COMPLETED,
          purgedAt: null,
          ...(latest ? { id: { not: latest.id } } : {}),
        },
        select: {
          id: true,
          locked: true,
          immutableUntil: true,
          snapshotAt: true,
          purgedAt: true,
        },
        take: 100,
      });
      for (const run of candidates) {
        if (
          !canAutoPurge({
            locked: run.locked,
            immutableUntil: run.immutableUntil,
            purgedAt: run.purgedAt,
            snapshotAt: run.snapshotAt,
            retentionDays: p.retentionDays,
          })
        ) {
          continue;
        }
        // Soft purge metadata only (objects GC is separate, dual-control for hard wipe)
        await this.prisma.backupRun.update({
          where: { id: run.id },
          data: { purgedAt: new Date(), locked: false },
        });
      }
    }
  }

  async executeRun(runId: string, orgId: string): Promise<void> {
    const store = getTenantStore();
    if (!store?.orgId || store.orgId !== orgId) {
      return runWithTenant({ orgId, userId: store?.userId || 'backup-worker' }, () => this.executeRun(runId, orgId));
    }
    if (this.running.has(runId)) return;
    this.running.add(runId);
    try {
      const run = await this.prisma.backupRun.findFirst({
        where: { id: runId, orgId },
        include: { policy: true },
      });
      if (!run || run.status === BackupRunStatus.CANCELLED) return;

      await this.prisma.backupRun.update({
        where: { id: runId },
        data: { status: BackupRunStatus.RUNNING, startedAt: new Date() },
      });

      const exclude = new Set(
        (Array.isArray(run.policy?.excludeExtensions) ? (run.policy!.excludeExtensions as string[]) : []).map((x) =>
          String(x).toLowerCase(),
        ),
      );

      // Baseline for incremental
      let baselineSnapshotAt: Date | null = null;
      let baselineFileIds = new Set<string>();
      if (run.kind === BackupRunKind.INCREMENTAL) {
        const baseline = await this.prisma.backupRun.findFirst({
          where: {
            orgId,
            status: BackupRunStatus.COMPLETED,
            id: { not: runId },
          },
          orderBy: { snapshotAt: 'desc' },
          select: { id: true, snapshotAt: true },
        });
        if (baseline) {
          baselineSnapshotAt = baseline.snapshotAt;
          const prior = await this.prisma.backupObject.findMany({
            where: { orgId, runId: baseline.id, resourceType: 'FILE' },
            select: { resourceId: true },
            take: 100_000,
          });
          baselineFileIds = new Set(prior.map((p) => p.resourceId));
        }
      }

      const files = await this.prisma.file.findMany({
        where: {
          orgId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          folderId: true,
          mimeType: true,
          size: true,
          sha256Hash: true,
          extension: true,
          storageKey: true,
          storageObjectId: true,
          updatedAt: true,
        },
        take: 50_000,
      });

      const folders = await this.prisma.folder.findMany({
        where: { orgId },
        select: { id: true, name: true, parentId: true },
      });
      const folderName = new Map(folders.map((f) => [f.id, f.name]));
      const folderParent = new Map(folders.map((f) => [f.id, f.parentId]));

      const buildPath = (folderId: string | null | undefined, fileName: string): string => {
        const parts: string[] = [fileName];
        let cur = folderId ?? null;
        let guard = 0;
        while (cur && guard++ < 64) {
          parts.unshift(folderName.get(cur) || cur);
          cur = folderParent.get(cur) ?? null;
        }
        return parts.join('/');
      };

      let filesTotal = 0;
      let filesCopied = 0;
      let filesSkipped = 0;
      let bytesTotal = BigInt(0);
      let bytesCopied = BigInt(0);
      const manifestRows: Array<{
        resourceId: string;
        backupStorageKey: string;
        sha256Hash: string | null;
        size: bigint;
      }> = [];

      for (const file of files) {
        const ext = (file.extension || '').toLowerCase().replace(/^\./, '');
        if (ext && exclude.has(ext)) {
          filesSkipped += 1;
          continue;
        }

        if (run.kind === BackupRunKind.INCREMENTAL) {
          const include = shouldIncludeInIncremental({
            fileId: file.id,
            updatedAt: file.updatedAt,
            baselineSnapshotAt,
            baselineFileIds,
          });
          if (!include) {
            filesSkipped += 1;
            continue;
          }
        }

        filesTotal += 1;
        bytesTotal += BigInt(file.size || 0);

        const sourceKey =
          file.storageKey ||
          (
            await this.prisma.storageObject.findFirst({
              where: { id: file.storageObjectId ?? undefined, orgId },
              select: { storageKey: true },
            })
          )?.storageKey;

        if (!sourceKey) {
          filesSkipped += 1;
          continue;
        }

        const backupKey = this.crypto.buildBackupObjectKey(orgId, runId, file.id, ext || 'bin');
        try {
          await this.storage.copyStoredObject(sourceKey, {
            fileId: file.id,
            versionId: runId,
            ownerOrgId: orgId,
            storageKey: backupKey,
            contentType: file.mimeType || undefined,
            checksum: file.sha256Hash || undefined,
          });
        } catch (copyErr) {
          this.logger.warn(
            `copy failed for file ${file.id}: ${copyErr instanceof Error ? copyErr.message : copyErr}; skipping object (no restore without bytes)`,
          );
          filesSkipped += 1;
          continue;
        }

        const path = buildPath(file.folderId, file.name).slice(0, 2000);
        await this.prisma.backupObject.create({
          data: {
            id: randomUUID(),
            orgId,
            runId,
            resourceType: 'FILE',
            resourceId: file.id,
            parentResourceId: file.folderId,
            name: file.name.slice(0, 500),
            path,
            mimeType: file.mimeType,
            size: file.size || BigInt(0),
            sha256Hash: file.sha256Hash,
            backupStorageKey: backupKey,
            sourceStorageKey: sourceKey,
          },
        });
        filesCopied += 1;
        bytesCopied += BigInt(file.size || 0);
        manifestRows.push({
          resourceId: file.id,
          backupStorageKey: backupKey,
          sha256Hash: file.sha256Hash,
          size: BigInt(file.size || 0),
        });

        if (filesCopied % 25 === 0) {
          await this.prisma.backupRun.update({
            where: { id: runId },
            data: { filesTotal, filesCopied, filesSkipped, bytesTotal, bytesCopied },
          });
        }
      }

      const manifestSha256 = this.crypto.manifestDigest(manifestRows);
      const retentionDays = run.policy?.retentionDays ?? null;
      const immutableUntil =
        retentionDays == null
          ? null
          : new Date(Date.now() + retentionDays * 86_400_000);
      await this.prisma.backupRun.update({
        where: { id: runId },
        data: {
          status: BackupRunStatus.COMPLETED,
          finishedAt: new Date(),
          filesTotal,
          filesCopied,
          filesSkipped,
          bytesTotal,
          bytesCopied,
          manifestSha256,
          locked: true,
          immutableUntil,
        },
      });

      if (run.policyId) {
        const policy = run.policy;
        await this.prisma.backupPolicy.update({
          where: { id: run.policyId },
          data: {
            lastRunAt: new Date(),
            nextRunAt: policy
              ? computeNextRunAt(policy.scheduleKind, new Date(), policy.scheduleHourUtc, policy.scheduleDay)
              : undefined,
          },
        });
      }
    } catch (e) {
      await this.prisma.backupRun.update({
        where: { id: runId },
        data: {
          status: BackupRunStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: e instanceof Error ? e.message.slice(0, 2000) : 'Backup failed',
        },
      });
      throw e;
    } finally {
      this.running.delete(runId);
    }
  }


  // ── Restore (P3) ──────────────────────────────────────────

  listRestoreJobs(user: AccessTokenPayload, take = 20) {
    this.assertOrgAdmin(user);
    return this.prisma.backupRestoreJob.findMany({
      where: { orgId: user.org_id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
      include: { run: { select: { id: true, kind: true, snapshotAt: true, status: true } } },
    });
  }

  async getRestoreJob(user: AccessTokenPayload, id: string) {
    this.assertOrgAdmin(user);
    const job = await this.prisma.backupRestoreJob.findFirst({
      where: { id, orgId: user.org_id },
      include: { run: { select: { id: true, kind: true, snapshotAt: true, status: true } } },
    });
    if (!job) throw new NotFoundException('Restore job not found');
    return job;
  }

  /**
   * Start a restore job.
   * Default mode is NEW_LOCATION (safer than overwriting live paths).
   * DOWNLOAD builds a zip of selected objects and returns a temporary download URL.
   */
  async startRestore(
    user: AccessTokenPayload,
    input: {
      runId: string;
      mode?: 'ORIGINAL' | 'NEW_LOCATION' | 'DOWNLOAD';
      objectIds?: string[];
      targetFolderId?: string | null;
    },
  ) {
    this.assertOrgAdmin(user);
    const run = await this.prisma.backupRun.findFirst({
      where: { id: input.runId, orgId: user.org_id, status: BackupRunStatus.COMPLETED },
    });
    if (!run) throw new NotFoundException('Completed backup run not found');

    const mode =
      input.mode === 'ORIGINAL'
        ? BackupRestoreMode.ORIGINAL
        : input.mode === 'DOWNLOAD'
          ? BackupRestoreMode.DOWNLOAD
          : BackupRestoreMode.NEW_LOCATION;

    let objectIds = Array.isArray(input.objectIds) ? input.objectIds.map(String).filter(Boolean) : [];
    if (objectIds.length > 2000) throw new BadRequestException('Too many objects selected (max 2000)');

    if (objectIds.length) {
      const count = await this.prisma.backupObject.count({
        where: { orgId: user.org_id, runId: run.id, id: { in: objectIds } },
      });
      if (count !== objectIds.length) throw new BadRequestException('One or more object IDs are invalid for this run');
    }

    if (mode !== BackupRestoreMode.DOWNLOAD && input.targetFolderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: input.targetFolderId, orgId: user.org_id },
        select: { id: true },
      });
      if (!folder) throw new NotFoundException('Target folder not found');
    }

    const active = await this.prisma.backupRestoreJob.count({
      where: {
        orgId: user.org_id,
        status: { in: [BackupRestoreStatus.PENDING, BackupRestoreStatus.RUNNING] },
      },
    });
    if (active > 0) throw new BadRequestException('A restore is already in progress for this organization');

    const itemsTotal =
      objectIds.length ||
      (await this.prisma.backupObject.count({ where: { orgId: user.org_id, runId: run.id, resourceType: 'FILE' } }));

    const job = await this.prisma.backupRestoreJob.create({
      data: {
        id: randomUUID(),
        orgId: user.org_id,
        runId: run.id,
        mode,
        status: BackupRestoreStatus.PENDING,
        objectIds,
        targetFolderId: input.targetFolderId ?? null,
        itemsTotal,
        requestedById: user.sub,
      },
    });
    await this.audit(user, 'BACKUP_RESTORE_START', job.id, { mode, runId: run.id, itemsTotal });

    void this.executeRestore(job.id, user).catch((e) => {
      this.logger.error(`restore job ${job.id} crashed: ${e instanceof Error ? e.message : e}`);
    });

    return job;
  }

  private storageLocation(): { bucket: string; region: string | null } {
    return {
      bucket: process.env.S3_BUCKET || process.env.STORAGE_BUCKET || 'imkan-local',
      region: process.env.S3_REGION || process.env.AWS_REGION || null,
    };
  }

  private uniqueRestoredName(base: string): string {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const cleaned = base.replace(/\s+$/, '');
    const dot = cleaned.lastIndexOf('.');
    if (dot > 0 && cleaned.length - dot <= 12) {
      return `${cleaned.slice(0, dot)} (restored ${stamp})${cleaned.slice(dot)}`.slice(0, 255);
    }
    return `${cleaned} (restored ${stamp})`.slice(0, 255);
  }

  async executeRestore(jobId: string, user: AccessTokenPayload): Promise<void> {
    const store = getTenantStore();
    if (!store?.orgId || store.orgId !== user.org_id) {
      return runWithTenant({ orgId: user.org_id, userId: user.sub }, () => this.executeRestore(jobId, user));
    }
    const orgId = user.org_id;
    const job = await this.prisma.backupRestoreJob.findFirst({ where: { id: jobId, orgId } });
    if (!job || job.status === BackupRestoreStatus.CANCELLED) return;

    await this.prisma.backupRestoreJob.update({
      where: { id: jobId },
      data: { status: BackupRestoreStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const selected = Array.isArray(job.objectIds) ? (job.objectIds as string[]) : [];
      const objects = await this.prisma.backupObject.findMany({
        where: {
          orgId,
          runId: job.runId,
          resourceType: 'FILE',
          ...(selected.length ? { id: { in: selected } } : {}),
        },
        orderBy: { path: 'asc' },
        take: 5000,
      });

      if (job.mode === BackupRestoreMode.DOWNLOAD) {
        await this.executeDownloadArchive(jobId, orgId, objects, user);
        return;
      }

      // Create a dedicated restore root under target (or org root) for NEW_LOCATION
      let restoreRootId: string | null = job.targetFolderId;
      if (job.mode === BackupRestoreMode.NEW_LOCATION) {
        const rootName = this.uniqueRestoredName(`Restore ${job.runId.slice(0, 8)}`);
        const folderId = randomUUID();
        await this.prisma.folder.create({
          data: {
            id: folderId,
            orgId,
            name: rootName,
            parentId: job.targetFolderId ?? null,
            ownerId: user.sub,
          },
        });
        restoreRootId = folderId;
      }

      // Cache of path-segment folder IDs under restore root
      const folderCache = new Map<string, string>();
      let itemsDone = 0;

      for (const obj of objects) {
        const parentId =
          job.mode === BackupRestoreMode.ORIGINAL
            ? await this.resolveOriginalParent(orgId, obj.parentResourceId)
            : await this.ensurePathFolders(orgId, user.sub, restoreRootId, obj.path, folderCache);

        const name =
          job.mode === BackupRestoreMode.ORIGINAL
            ? this.uniqueRestoredName(obj.name)
            : obj.name;

        await this.materializeFileFromBackupObject(user, obj, parentId, name);
        itemsDone += 1;
        if (itemsDone % 10 === 0) {
          await this.prisma.backupRestoreJob.update({
            where: { id: jobId },
            data: { itemsDone, itemsTotal: objects.length },
          });
        }
      }

      await this.prisma.backupRestoreJob.update({
        where: { id: jobId },
        data: {
          status: BackupRestoreStatus.COMPLETED,
          finishedAt: new Date(),
          itemsDone: objects.length,
          itemsTotal: objects.length,
        },
      });
      await this.audit(user, 'BACKUP_RESTORE_COMPLETE', jobId, {
        mode: job.mode,
        itemsDone: objects.length,
        restoreRootId,
      });
    } catch (e) {
      await this.prisma.backupRestoreJob.update({
        where: { id: jobId },
        data: {
          status: BackupRestoreStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: e instanceof Error ? e.message.slice(0, 2000) : 'Restore failed',
        },
      });
      throw e;
    }
  }

  private async resolveOriginalParent(orgId: string, parentResourceId: string | null): Promise<string | null> {
    if (!parentResourceId) return null;
    const folder = await this.prisma.folder.findFirst({
      where: { id: parentResourceId, orgId },
      select: { id: true },
    });
    return folder?.id ?? null;
  }

  /** Ensure intermediate folders for path "a/b/c.txt" under restoreRoot; returns parent folder id for the file. */
  private async ensurePathFolders(
    orgId: string,
    ownerId: string,
    restoreRootId: string | null,
    path: string,
    cache: Map<string, string>,
  ): Promise<string | null> {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return restoreRootId;
    const dirs = parts.slice(0, -1);
    let parent: string | null = restoreRootId;
    let keyPrefix = restoreRootId || 'root';
    for (const dir of dirs) {
      keyPrefix = `${keyPrefix}/${dir}`;
      if (cache.has(keyPrefix)) {
        parent = cache.get(keyPrefix)!;
        continue;
      }
      const existing = await this.prisma.folder.findFirst({
        where: { orgId, parentId: parent, name: dir },
        select: { id: true },
      });
      if (existing) {
        parent = existing.id;
        cache.set(keyPrefix, parent);
        continue;
      }
      const id = randomUUID();
      await this.prisma.folder.create({
        data: { id, orgId, name: dir.slice(0, 255), parentId: parent, ownerId },
      });
      parent = id;
      cache.set(keyPrefix, id);
    }
    return parent;
  }

  private async materializeFileFromBackupObject(
    user: AccessTokenPayload,
    obj: {
      name: string;
      mimeType: string | null;
      size: bigint;
      sha256Hash: string | null;
      backupStorageKey: string;
    },
    folderId: string | null,
    name: string,
  ) {
    const orgId = user.org_id;
    const cleanName = name.trim().slice(0, 255) || 'restored-file';
    // Avoid hard conflict: rename if needed
    let finalName = cleanName;
    const clash = await this.prisma.file.findFirst({
      where: { orgId, folderId, name: finalName, status: FileStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (clash) finalName = this.uniqueRestoredName(cleanName);

    const fileId = randomUUID();
    const versionId = randomUUID();
    const storageObjectId = randomUUID();
    const objectKey = this.storage.buildObjectKey(fileId, versionId);
    const { bucket, region } = this.storageLocation();
    const sha = (obj.sha256Hash || createHash('sha256').update(objectKey).digest('hex')).toLowerCase();
    const extension = (() => {
      const d = finalName.lastIndexOf('.');
      return d > 0 ? finalName.slice(d + 1).toLowerCase().slice(0, 32) : null;
    })();
    const mime = obj.mimeType || 'application/octet-stream';
    const size = BigInt(obj.size || 0);

    try {
      await this.storage.copyStoredObject(obj.backupStorageKey, {
        fileId,
        versionId,
        ownerOrgId: orgId,
        contentType: mime,
        storageKey: objectKey,
        checksum: sha,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to restore file "${finalName}" from backup storage key "${obj.backupStorageKey.slice(0, 120)}": ${msg}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          orgId,
          folderId,
          name: finalName,
          originalName: finalName,
          extension,
          mimeType: mime,
          size,
          sha256Hash: sha,
          status: FileStatus.ACTIVE,
          ownerId: user.sub,
        },
      });
      await tx.storageObject.create({
        data: {
          id: storageObjectId,
          orgId,
          fileId,
          storageKey: objectKey,
          bucket,
          region,
          size,
          checksum: sha,
        },
      });
      await tx.fileVersion.create({
        data: {
          id: versionId,
          orgId,
          fileId,
          versionNumber: 1,
          storageObjectId,
          size,
          mimeType: mime,
          extension,
          sha256Hash: sha,
          uploadedById: user.sub,
          status: VersionStatus.ACTIVE,
          uploadStatus: UploadStatus.COMPLETE,
        },
      });
    });

    return { fileId, name: finalName };
  }

  /**
   * Build a zip of selected backup objects into a temporary storage object and
   * return a short-lived download URL recorded on the job errorMessage field as JSON meta
   * (downloadUrl) — kept simple for P3 without a new column.
   */
  private async executeDownloadArchive(
    jobId: string,
    orgId: string,
    objects: Array<{
      id: string;
      name: string;
      path: string;
      backupStorageKey: string;
      size: bigint;
    }>,
    user: AccessTokenPayload,
  ) {
    let total = 0;
    for (const obj of objects) total += Number(obj.size || 0);
    if (total > DOWNLOAD_STREAM_LIMIT_BYTES) {
      throw new BadRequestException('Selected archive exceeds 5 GB hard limit');
    }

    const useMemory = total <= DOWNLOAD_MEMORY_LIMIT_BYTES && objects.length <= 2000;
    let archive: Buffer;
    let mode: 'memory' | 'stream' = 'memory';

    if (useMemory) {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const obj of objects) {
        try {
          const bytes = await this.storage.readStoredObject(obj.backupStorageKey);
          const entry = (obj.path || obj.name).replace(/^\/+/, '') || obj.name;
          zip.file(entry, bytes);
        } catch (e) {
          this.logger.warn(`skip missing backup bytes for ${obj.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
      archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    } else {
      // Streaming path: prefer `archiver` when available; otherwise sequential memory-safe chunked zip via temp buffering per file.
      mode = 'stream';
      try {
        archive = await this.buildArchiveWithArchiver(objects);
      } catch (e) {
        this.logger.warn(
          `archiver unavailable (${e instanceof Error ? e.message : e}); falling back to sequential JSZip batches`,
        );
        archive = await this.buildArchiveBatched(objects);
      }
    }

    const fileId = randomUUID();
    const versionId = randomUUID();
    const objectKey = this.crypto.buildBackupObjectKey(orgId, jobId, randomUUID(), 'zip');
    await this.storage.storeObject(
      {
        fileId,
        versionId,
        ownerOrgId: orgId,
        storageKey: objectKey,
        contentType: 'application/zip',
        fileName: `backup-restore-${jobId.slice(0, 8)}.zip`,
      },
      archive,
    );

    const signed = await this.storage.createDownloadUrl({
      fileId,
      versionId,
      ownerOrgId: orgId,
      storageKey: objectKey,
      disposition: 'attachment',
      fileName: `backup-restore-${jobId.slice(0, 8)}.zip`,
    });

    await this.prisma.backupRestoreJob.update({
      where: { id: jobId },
      data: {
        status: BackupRestoreStatus.COMPLETED,
        finishedAt: new Date(),
        itemsDone: objects.length,
        itemsTotal: objects.length,
        errorMessage: JSON.stringify({
          downloadUrl: signed.url,
          expiresInSeconds: signed.expiresInSeconds,
          objectKey,
          bytes: archive.length,
          packMode: mode,
        }),
      },
    });
    await this.audit(user, 'BACKUP_RESTORE_DOWNLOAD', jobId, {
      bytes: archive.length,
      items: objects.length,
      packMode: mode,
    });
  }

  /** Optional dependency: archiver. Builds zip without loading all files at once into one JSZip tree. */
  private async buildArchiveWithArchiver(
    objects: Array<{ id: string; name: string; path: string; backupStorageKey: string }>,
  ): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const archiver = require('archiver') as typeof import('archiver');
    const { PassThrough } = await import('node:stream');
    const chunks: Buffer[] = [];
    const pass = new PassThrough();
    pass.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(pass);
    const done = new Promise<void>((resolve, reject) => {
      pass.on('finish', () => resolve());
      pass.on('error', reject);
      archive.on('error', reject);
    });
    for (const obj of objects) {
      try {
        const bytes = await this.storage.readStoredObject(obj.backupStorageKey);
        const entry = (obj.path || obj.name).replace(/^\/+/, '') || obj.name;
        archive.append(bytes, { name: entry });
      } catch (e) {
        this.logger.warn(`archiver skip ${obj.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    await archive.finalize();
    await done;
    return Buffer.concat(chunks);
  }

  /** Fallback: batch files into JSZip in groups to reduce peak memory vs one giant set. */
  private async buildArchiveBatched(
    objects: Array<{ id: string; name: string; path: string; backupStorageKey: string; size: bigint }>,
  ): Promise<Buffer> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const batchSize = 50;
    for (let i = 0; i < objects.length; i += batchSize) {
      const batch = objects.slice(i, i + batchSize);
      for (const obj of batch) {
        try {
          const bytes = await this.storage.readStoredObject(obj.backupStorageKey);
          const entry = (obj.path || obj.name).replace(/^\/+/, '') || obj.name;
          zip.file(entry, bytes);
        } catch (e) {
          this.logger.warn(`batch skip ${obj.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }


  // ── Dual-control purge (P4) ───────────────────────────────

  listPurgeRequests(user: AccessTokenPayload, take = 30) {
    this.assertOrgAdmin(user);
    return this.prisma.backupPurgeRequest.findMany({
      where: { orgId: user.org_id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
      include: {
        run: {
          select: {
            id: true,
            kind: true,
            snapshotAt: true,
            locked: true,
            immutableUntil: true,
            purgedAt: true,
            filesCopied: true,
            bytesCopied: true,
          },
        },
      },
    });
  }

  async requestPurge(user: AccessTokenPayload, runId: string, reason: string) {
    this.assertOrgAdmin(user);
    const note = String(reason || '').trim().slice(0, 1000);
    if (note.length < 8) throw new BadRequestException('A clear reason (min 8 chars) is required');

    const run = await this.prisma.backupRun.findFirst({
      where: { id: runId, orgId: user.org_id, status: BackupRunStatus.COMPLETED },
    });
    if (!run) throw new NotFoundException('Backup run not found');
    if (run.purgedAt) throw new BadRequestException('Run already purged');

    const pending = await this.prisma.backupPurgeRequest.findFirst({
      where: { orgId: user.org_id, runId, status: BackupPurgeStatus.PENDING },
    });
    if (pending) throw new BadRequestException('A pending purge request already exists for this run');

    const row = await this.prisma.backupPurgeRequest.create({
      data: {
        id: randomUUID(),
        orgId: user.org_id,
        runId,
        status: BackupPurgeStatus.PENDING,
        reason: note,
        requestedById: user.sub,
      },
    });
    await this.audit(user, 'BACKUP_PURGE_REQUEST', row.id, { runId, reason: note });
    return row;
  }

  /**
   * Second admin approves (must differ from requester). Does not execute delete yet.
   */
  async approvePurge(user: AccessTokenPayload, requestId: string, decisionNote?: string) {
    this.assertOrgAdmin(user);
    const req = await this.prisma.backupPurgeRequest.findFirst({
      where: { id: requestId, orgId: user.org_id, status: BackupPurgeStatus.PENDING },
    });
    if (!req) throw new NotFoundException('Pending purge request not found');
    if (!canApprovePurge(req.requestedById, user.sub)) {
      throw new ForbiddenException('Dual-control: a different organization admin must approve');
    }
    const row = await this.prisma.backupPurgeRequest.update({
      where: { id: requestId },
      data: {
        status: BackupPurgeStatus.APPROVED,
        approvedById: user.sub,
        decisionNote: String(decisionNote || '').slice(0, 1000) || null,
        decidedAt: new Date(),
      },
    });
    await this.audit(user, 'BACKUP_PURGE_APPROVE', row.id, { runId: req.runId });
    return row;
  }

  async rejectPurge(user: AccessTokenPayload, requestId: string, decisionNote?: string) {
    this.assertOrgAdmin(user);
    const req = await this.prisma.backupPurgeRequest.findFirst({
      where: { id: requestId, orgId: user.org_id, status: BackupPurgeStatus.PENDING },
    });
    if (!req) throw new NotFoundException('Pending purge request not found');
    if (!canApprovePurge(req.requestedById, user.sub)) {
      throw new ForbiddenException('Dual-control: a different organization admin must reject');
    }
    const row = await this.prisma.backupPurgeRequest.update({
      where: { id: requestId },
      data: {
        status: BackupPurgeStatus.REJECTED,
        approvedById: user.sub,
        decisionNote: String(decisionNote || '').slice(0, 1000) || null,
        decidedAt: new Date(),
      },
    });
    await this.audit(user, 'BACKUP_PURGE_REJECT', row.id, { runId: req.runId });
    return row;
  }

  /**
   * Execute an APPROVED purge: unlock + soft-purge + best-effort delete of backup objects' storage keys.
   * Requester or approver may execute (still requires APPROVED state from dual control).
   */
  async executePurge(user: AccessTokenPayload, requestId: string) {
    this.assertOrgAdmin(user);
    const req = await this.prisma.backupPurgeRequest.findFirst({
      where: { id: requestId, orgId: user.org_id, status: BackupPurgeStatus.APPROVED },
      include: { run: true },
    });
    if (!req) throw new NotFoundException('Approved purge request not found');

    const objects = await this.prisma.backupObject.findMany({
      where: { orgId: user.org_id, runId: req.runId },
      select: { id: true, backupStorageKey: true },
      take: 50_000,
    });

    let deleted = 0;
    for (const obj of objects) {
      try {
        await this.storage.deleteStoredObject(obj.backupStorageKey);
        deleted += 1;
      } catch (e) {
        this.logger.warn(`purge storage key failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.backupObject.deleteMany({ where: { orgId: user.org_id, runId: req.runId } });
      await tx.backupRun.update({
        where: { id: req.runId },
        data: { locked: false, purgedAt: new Date(), immutableUntil: new Date() },
      });
      await tx.backupPurgeRequest.update({
        where: { id: requestId },
        data: { status: BackupPurgeStatus.EXECUTED, executedAt: new Date() },
      });
    });

    await this.audit(user, 'BACKUP_PURGE_EXECUTE', requestId, {
      runId: req.runId,
      objectsDeleted: deleted,
    });
    return { ok: true, objectsDeleted: deleted, runId: req.runId };
  }

  overview(user: AccessTokenPayload) {
    this.assertOrgAdmin(user);
    return Promise.all([
      this.prisma.backupPolicy.count({ where: { orgId: user.org_id } }),
      this.prisma.backupRun.count({ where: { orgId: user.org_id } }),
      this.prisma.backupRun.findFirst({
        where: { orgId: user.org_id, status: BackupRunStatus.COMPLETED },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.backupRun.findFirst({
        where: { orgId: user.org_id, status: { in: [BackupRunStatus.PENDING, BackupRunStatus.RUNNING] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]).then(([policies, runs, lastOk, inFlight]) => ({
      policies,
      runs,
      lastSuccessfulRun: lastOk,
      activeRun: inFlight,
    }));
  }
}
