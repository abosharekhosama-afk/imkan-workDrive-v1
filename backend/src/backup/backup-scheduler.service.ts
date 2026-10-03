import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupService } from './backup.service';

/**
 * Optional in-process scheduler.
 * Enable with BACKUP_SCHEDULER_EMBEDDED=true on the API process,
 * or run the dedicated `backup:worker` entrypoint in production.
 */
@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly backup: BackupService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const embedded = String(this.config.get('BACKUP_SCHEDULER_EMBEDDED') ?? '').toLowerCase() === 'true';
    if (!embedded) {
      this.logger.log('Embedded backup scheduler disabled (set BACKUP_SCHEDULER_EMBEDDED=true to enable)');
      return;
    }
    const intervalMs = Math.max(Number(this.config.get('BACKUP_SCHEDULER_INTERVAL_MS') ?? 60_000), 15_000);
    this.logger.log(`Embedded backup scheduler starting (interval=${intervalMs}ms)`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    try {
      const result = await this.backup.processDuePolicies(20);
      if (result.started.length || result.skipped.length) {
        this.logger.log(
          `scheduler tick: started=${result.started.length} skipped=${result.skipped.length}`,
        );
      }
    } catch (e) {
      this.logger.error(`scheduler tick failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Exposed for the standalone worker process. */
  runWorkerCycle() {
    return this.tick();
  }
}
