import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Derives backup storage keys and integrity digests.
 * Encryption of object bytes is delegated to the storage layer / bucket SSE;
 * this service never exposes raw master secrets to the API surface.
 */
@Injectable()
export class BackupCryptoService {
  constructor(private readonly config: ConfigService) {}

  private master(): string {
    const key =
      this.config.get<string>('BACKUP_ENCRYPTION_KEY')?.trim() ||
      this.config.get<string>('CONNECTION_ENCRYPTION_KEY')?.trim() ||
      this.config.get<string>('JWT_SECRET')?.trim();
    if (!key || key.length < 16) {
      throw new Error('BACKUP_ENCRYPTION_KEY (or CONNECTION_ENCRYPTION_KEY) must be configured (≥16 chars)');
    }
    return key;
  }

  /** Deterministic, non-reversible path segment for an org (prevents cross-tenant path guessing). */
  orgPrefix(orgId: string): string {
    return createHmac('sha256', this.master()).update(`backup-org:${orgId}`).digest('hex').slice(0, 32);
  }

  /** Unique backup object key under the backup namespace. */
  buildBackupObjectKey(orgId: string, runId: string, fileId: string, versionHint?: string): string {
    const nonce = randomBytes(8).toString('hex');
    const hint = (versionHint || 'v').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40);
    return `backups/${this.orgPrefix(orgId)}/${runId}/${fileId}/${hint}-${nonce}`;
  }

  sha256Hex(payload: string | Buffer): string {
    return createHash('sha256').update(payload).digest('hex');
  }

  /** Manifest digest over sorted object records for run integrity checks. */
  manifestDigest(rows: Array<{ resourceId: string; backupStorageKey: string; sha256Hash: string | null; size: string | number | bigint }>): string {
    const lines = rows
      .map((r) => `${r.resourceId}|${r.backupStorageKey}|${r.sha256Hash ?? ''}|${String(r.size)}`)
      .sort();
    return this.sha256Hex(lines.join('\n'));
  }
}
