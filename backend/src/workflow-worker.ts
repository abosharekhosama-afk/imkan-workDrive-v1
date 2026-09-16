import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkflowEngineService } from './workflows/workflow-engine.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const engine = app.get(WorkflowEngineService);
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  await engine.runWorkerCycle();
  setInterval(() => void engine.runWorkerCycle(), 1500);
}

void main();
