import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConnectionHealthWorkerService } from './connections/connection-health-worker.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const worker = app.get(ConnectionHealthWorkerService);
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  await worker.runWorkerCycle();
  const intervalMs = Math.max(Number(process.env.CONNECTION_HEALTH_INTERVAL_MS ?? 300000), 60000);
  setInterval(() => void worker.runWorkerCycle(), intervalMs);
}

void main();
