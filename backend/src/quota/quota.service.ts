import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { IntegrationWebhooksService } from '../integration-keys/integration-webhooks';

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly webhooks?: IntegrationWebhooksService,
  ) {}

  async get(u: AccessTokenPayload) {
    let q = await this.prisma.storageQuota.findUnique({
      where: { orgId: u.org_id },
    });
    if (!q)
      q = await this.prisma.storageQuota.create({
        data: { orgId: u.org_id, quotaBytes: 10737418240n },
      });
    return {
      ...q,
      quotaBytes: q.quotaBytes.toString(),
      usedBytes: q.usedBytes.toString(),
    };
  }

  async keyUsedBytes(key: {
    id: string;
    rootFolderId: string | null;
    orgId: string;
  }) {
    if (!key.rootFolderId) {
      const q = await this.prisma.storageQuota.findUnique({
        where: { orgId: key.orgId },
      });
      return q?.usedBytes ?? 0n;
    }
    const ids: string[] = [];
    const walk = async (id: string) => {
      ids.push(id);
      const children = await this.prisma.folder.findMany({
        where: { parentId: id },
        select: { id: true },
      });
      for (const c of children) await walk(c.id);
    };
    await walk(key.rootFolderId);
    const agg = await this.prisma.file.aggregate({
      where: { orgId: key.orgId, folderId: { in: ids }, deletedAt: null },
      _sum: { size: true },
    });
    return agg._sum.size ?? 0n;
  }

  private async emitQuota(
    orgId: string,
    type: 'storage.quota_exceeded' | 'storage.quota_near_limit',
    data: Record<string, unknown>,
    keyId?: string | null,
  ) {
    await this.webhooks
      ?.enqueue({ orgId, type, data, keyId })
      .catch(() => undefined);
  }

  async assertAvailable(u: AccessTokenPayload, size: bigint) {
    const q = await this.get(u);
    const used = BigInt(q.usedBytes);
    const limit = BigInt(q.quotaBytes);
    if (used + size > limit) {
      await this.emitQuota(
        u.org_id,
        'storage.quota_exceeded',
        {
          usedBytes: used.toString(),
          quotaBytes: limit.toString(),
          adding: size.toString(),
        },
        u.integrationKey?.id,
      );
      throw new ForbiddenException('Storage quota exceeded');
    }
    if (used * 100n < limit * 90n && (used + size) * 100n >= limit * 90n) {
      await this.emitQuota(
        u.org_id,
        'storage.quota_near_limit',
        { usedBytes: (used + size).toString(), quotaBytes: limit.toString() },
        u.integrationKey?.id,
      );
    }
    if (u.integrationKey?.id) {
      const key = await this.prisma.integrationApiKey.findUnique({
        where: { id: u.integrationKey.id },
      });
      if (key?.quotaBytes != null) {
        const keyUsed = await this.keyUsedBytes(key);
        if (keyUsed + size > key.quotaBytes) {
          await this.emitQuota(
            u.org_id,
            'storage.quota_exceeded',
            {
              usedBytes: keyUsed.toString(),
              quotaBytes: key.quotaBytes.toString(),
              adding: size.toString(),
              keyId: key.id,
            },
            key.id,
          );
          throw new ForbiddenException('Storage quota exceeded');
        }
        if (
          keyUsed * 100n < key.quotaBytes * 90n &&
          (keyUsed + size) * 100n >= key.quotaBytes * 90n
        ) {
          await this.emitQuota(
            u.org_id,
            'storage.quota_near_limit',
            {
              usedBytes: (keyUsed + size).toString(),
              quotaBytes: key.quotaBytes.toString(),
              keyId: key.id,
            },
            key.id,
          );
        }
      }
    }
  }
}
