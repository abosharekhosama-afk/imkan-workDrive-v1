import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BackupSchedulerService } from './backup/backup-scheduler.service';

/**
 * Dedicated backup scheduler worker.
 *   npx ts-node -r tsconfig-paths/register src/backup-worker.ts
 * or: npm run backup:worker
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const worker = app.get(BackupSchedulerService);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await worker.runWorkerCycle();
  const intervalMs = Math.max(Number(process.env.BACKUP_SCHEDULER_INTERVAL_MS ?? 60_000), 15_000);
  setInterval(() => void worker.runWorkerCycle(), intervalMs);
}

void main();
