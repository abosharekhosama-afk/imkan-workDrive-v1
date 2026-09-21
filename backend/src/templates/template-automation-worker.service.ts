import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from './templates.service';
import type { AccessTokenPayload } from '../auth/jwt.types';

@Injectable()
export class TemplateAutomationWorkerService {
  private readonly logger = new Logger(TemplateAutomationWorkerService.name);
  private processing = false;
  private readonly workerId = `office-template-worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  constructor(private readonly prisma: PrismaService, private readonly templates: TemplatesService) {}

  async runWorkerCycle() {
    if (this.processing) return { processed: 0 };
    this.processing = true;
    let processed = 0;
    try {
      await this.recoverStaleJobs();
      for (let i = 0; i < 5; i++) {
        const job = await this.claimJob();
        if (!job) break;
        processed++;
        await this.executeJob(job.id);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.processing = false;
    }
    return { processed };
  }

  private async recoverStaleJobs() {
    const now = new Date();
    const stale = new Date(now.getTime() - 2 * 60_000);
    await this.prisma.officeBackgroundJob.updateMany({
      where: { type: 'TEMPLATE_AUTOMATION', status: 'RUNNING', OR: [{ leaseUntil: { lt: now } }, { leaseUntil: null, lockedAt: { lt: stale } }] },
      data: { status: 'QUEUED', lockedAt: null, lockedBy: null, leaseUntil: null, runAt: now },
    });
  }

  private async claimJob() {
    const now = new Date();
    const candidate = await this.prisma.officeBackgroundJob.findFirst({
      where: { type: 'TEMPLATE_AUTOMATION', status: 'QUEUED', runAt: { lte: now } },
      orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;
    const leaseUntil = new Date(now.getTime() + 2 * 60_000);
    const claimed = await this.prisma.officeBackgroundJob.updateMany({
      where: { id: candidate.id, status: 'QUEUED', runAt: { lte: now } },
      data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, leaseUntil, attempts: { increment: 1 } },
    });
    return claimed.count === 1 ? candidate : null;
  }

  private async executeJob(jobId: string) {
    const job = await this.prisma.officeBackgroundJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const payload = job.payload as Record<string, unknown>;
    const user = await this.prisma.user.findUnique({ where: { id: job.createdById }, select: { id: true, email: true, name: true } });
    if (!user) return this.fail(job.id, job.attempts, 'Job creator no longer exists');
    const token = { sub: user.id, org_id: job.orgId, email: user.email, name: user.name } as AccessTokenPayload & { email?: string; name?: string };
    const heartbeat = setInterval(() => void this.prisma.officeBackgroundJob.updateMany({ where: { id: job.id, status: 'RUNNING', lockedBy: this.workerId }, data: { leaseUntil: new Date(Date.now() + 2 * 60_000) } }).catch(() => undefined), 30_000);
    try {
      const result = await this.templates.automateFromTemplate(token, String(payload.templateId), {
        name: String(payload.name ?? 'Generated document'),
        folderId: typeof payload.folderId === 'string' ? payload.folderId : null,
        values: payload.values && typeof payload.values === 'object' && !Array.isArray(payload.values) ? payload.values as Record<string, unknown> : {},
        generatePdf: payload.generatePdf === true,
        pdfFolderId: typeof payload.pdfFolderId === 'string' ? payload.pdfFolderId : null,
      });
      await this.prisma.officeBackgroundJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', result: result as any, completedAt: new Date(), lockedAt: null, lockedBy: null, leaseUntil: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template automation failed';
      if (job.attempts < job.maxAttempts) {
        const retryAt = new Date(Date.now() + Math.min(60_000, 2 ** Math.max(0, job.attempts - 1) * 5_000));
        await this.prisma.officeBackgroundJob.update({ where: { id: job.id }, data: { status: 'QUEUED', error: message, runAt: retryAt, lockedAt: null, lockedBy: null, leaseUntil: null } });
      } else {
        await this.fail(job.id, job.attempts, message);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async fail(id: string, attempts: number, error: string) {
    await this.prisma.officeBackgroundJob.update({ where: { id }, data: { status: 'DEAD_LETTER', attempts, error, completedAt: new Date(), lockedAt: null, lockedBy: null, leaseUntil: null } }).catch(() => undefined);
  }
}
