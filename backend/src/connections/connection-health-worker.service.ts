import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

@Injectable()
export class ConnectionHealthWorkerService {
  private readonly logger = new Logger(ConnectionHealthWorkerService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly connections: ConnectionsService) {}

  async runWorkerCycle() {
    if (this.running) return { skipped: true, reason: 'ALREADY_RUNNING' };
    this.running = true;
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true }, take: 2000 });
      const results = [];
      for (const org of orgs) {
        try { results.push(await this.connections.automatedHealthScan(org.id)); }
        catch (error) { this.logger.warn(`Connection health scan failed for org ${org.id}: ${error instanceof Error ? error.message : 'unknown error'}`); }
      }
      return { organizations: orgs.length, results };
    } finally { this.running = false; }
  }
}
