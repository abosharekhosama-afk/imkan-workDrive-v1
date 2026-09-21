import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TemplateAutomationWorkerService } from './templates/template-automation-worker.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const worker = app.get(TemplateAutomationWorkerService);
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  await worker.runWorkerCycle();
  setInterval(() => void worker.runWorkerCycle(), 1500);
}

void main();
