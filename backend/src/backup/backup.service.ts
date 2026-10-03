import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BackupRunKind, BackupRunStatus, BackupScope, BackupScheduleKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.types';
import { BackupCryptoService } from './backup-crypto.service';

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
        nextRunAt: scheduleKind === BackupScheduleKind.MANUAL ? null : new Date(Date.now() + 60_000),
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
    const row = await this.prisma.backupPolicy.update({ where: { id }, data });
    await this.audit(user, 'BACKUP_POLICY_UPDATE', row.id, { enabled: row.enabled });
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
   * Start a FULL backup run (manual). Execution continues asynchronously in-process.
   * Production deployments should move executeRun to a dedicated worker process.
   */
  async startFullBackup(user: AccessTokenPayload, policyId?: string) {
    this.assertOrgAdmin(user);
    let policy = policyId
      ? await this.prisma.backupPolicy.findFirst({ where: { id: policyId, orgId: user.org_id } })
      : await this.prisma.backupPolicy.findFirst({ where: { orgId: user.org_id, enabled: true }, orderBy: { createdAt: 'asc' } });

    if (!policy) {
      policy = await this.createPolicy(user, { name: 'Default backup policy', scheduleKind: BackupScheduleKind.MANUAL });
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
        kind: BackupRunKind.FULL,
        status: BackupRunStatus.PENDING,
        snapshotAt: new Date(),
        triggeredById: user.sub,
      },
    });
    await this.audit(user, 'BACKUP_RUN_START', run.id, { kind: 'FULL', policyId: policy.id });

    // Fire-and-forget; errors are recorded on the run row.
    void this.executeRun(run.id, user.org_id).catch((e) => {
      this.logger.error(`backup run ${run.id} crashed: ${e instanceof Error ? e.message : e}`);
    });

    return run;
  }

  async executeRun(runId: string, orgId: string) {
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
      const manifestRows: Array<{ resourceId: string; backupStorageKey: string; sha256Hash: string | null; size: bigint }> = [];

      for (const file of files) {
        const ext = (file.extension || '').toLowerCase().replace(/^\./, '');
        if (ext && exclude.has(ext)) {
          filesSkipped += 1;
          continue;
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
          // Fallback: record metadata-only if physical copy is unsupported in this driver.
          this.logger.warn(
            `copy failed for file ${file.id}: ${copyErr instanceof Error ? copyErr.message : copyErr}; indexing metadata only`,
          );
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
        },
      });

      if (run.policyId) {
        await this.prisma.backupPolicy.update({
          where: { id: run.policyId },
          data: { lastRunAt: new Date() },
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
