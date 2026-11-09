import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_WEBHOOK_EVENTS = [
  'file.deleted',
  'file.trashed',
  'file.restored',
  'integration_key.revoked',
  'storage.quota_exceeded',
  'storage.quota_near_limit',
] as const;
export type IntegrationWebhookEvent =
  (typeof INTEGRATION_WEBHOOK_EVENTS)[number];

export function isIntegrationWebhookEvent(
  v: unknown,
): v is IntegrationWebhookEvent {
  return (
    typeof v === 'string' &&
    (INTEGRATION_WEBHOOK_EVENTS as readonly string[]).includes(v)
  );
}

export function normalizeWebhookEvents(events: string[]) {
  return [...new Set(events.filter(isIntegrationWebhookEvent))];
}

export function signWebhookBody(
  secret: string,
  timestamp: string,
  rawBody: string,
) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
) {
  const expected = signWebhookBody(secret, timestamp, rawBody);
  const got = signature.replace(/^sha256=/, '');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(got, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

@Injectable()
export class IntegrationWebhooksService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(IntegrationWebhooksService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const ms = Number(process.env.INTEGRATION_WEBHOOK_TICK_MS ?? 15_000);
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.timer = setInterval(() => {
      this.deliverDue().catch((e) =>
        this.log.warn(`webhook delivery tick failed: ${String(e)}`),
      );
    }, ms);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async register(input: {
    orgId: string;
    keyId: string | null;
    url: string;
    events: string[];
    secret?: string | null;
  }) {
    const events = normalizeWebhookEvents(input.events);
    if (!events.length)
      throw new Error('At least one supported event is required');
    const secret = input.secret || generateWebhookSecret();
    const row = await this.prisma.integrationWebhook.create({
      data: {
        orgId: input.orgId,
        keyId: input.keyId,
        url: input.url,
        secret,
        events,
      },
    });
    return { webhook: this.toView(row), secret };
  }

  async list(orgId: string, keyId?: string | null) {
    const rows = await this.prisma.integrationWebhook.findMany({
      where: { orgId, ...(keyId ? { keyId } : {}), revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async revoke(orgId: string, id: string, keyId?: string | null) {
    const row = await this.prisma.integrationWebhook.findFirst({
      where: { id, orgId, ...(keyId ? { keyId } : {}) },
    });
    if (!row) throw new NotFoundException('Webhook not found');
    const updated = row.revokedAt
      ? row
      : await this.prisma.integrationWebhook.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
    return this.toView(updated);
  }

  async deliveries(orgId: string, webhookId: string, keyId?: string | null) {
    const hook = await this.prisma.integrationWebhook.findFirst({
      where: { id: webhookId, orgId, ...(keyId ? { keyId } : {}) },
    });
    if (!hook) throw new NotFoundException('Webhook not found');
    return this.prisma.integrationWebhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async enqueue(input: {
    orgId: string;
    type: IntegrationWebhookEvent;
    data: Record<string, unknown>;
    keyId?: string | null;
    eventId?: string;
  }) {
    const eventId = input.eventId ?? randomUUID();
    const hooks = await this.prisma.integrationWebhook.findMany({
      where: { orgId: input.orgId, revokedAt: null },
    });
    const now = new Date();
    for (const hook of hooks) {
      const events = Array.isArray(hook.events) ? hook.events : [];
      if (!events.includes(input.type)) continue;
      if (hook.keyId && input.keyId && hook.keyId !== input.keyId) continue;
      await this.prisma.integrationWebhookDelivery
        .create({
          data: {
            webhookId: hook.id,
            eventId,
            eventType: input.type,
            payload: JSON.parse(
              JSON.stringify({
                id: eventId,
                type: input.type,
                created_at: now.toISOString(),
                data: input.data,
              }),
            ),
            status: 'PENDING',
            attempts: 0,
            nextAttemptAt: now,
          },
        })
        .catch(() => undefined);
    }
    return { eventId };
  }

  async deliverDue(now = new Date(), fetchImpl: typeof fetch = fetch) {
    const rows = await this.prisma.integrationWebhookDelivery.findMany({
      where: {
        status: 'PENDING',
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      include: { webhook: true },
      take: 25,
      orderBy: { createdAt: 'asc' },
    });
    let delivered = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.webhook.revokedAt) {
        await this.prisma.integrationWebhookDelivery.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: 'Webhook revoked' },
        });
        failed++;
        continue;
      }
      const rawBody = JSON.stringify(row.payload);
      const timestamp = String(Math.floor(now.getTime() / 1000));
      const signature = signWebhookBody(row.webhook.secret, timestamp, rawBody);
      try {
        const res = await fetchImpl(row.webhook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workdrive-signature': `sha256=${signature}`,
            'x-workdrive-timestamp': timestamp,
            'x-workdrive-event': row.eventType,
            'x-workdrive-delivery': row.id,
          },
          body: rawBody,
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          await this.prisma.integrationWebhookDelivery.update({
            where: { id: row.id },
            data: {
              status: 'SUCCESS',
              attempts: row.attempts + 1,
              deliveredAt: now,
              lastError: null,
            },
          });
          delivered++;
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        const attempts = row.attempts + 1;
        const max = Number(process.env.INTEGRATION_WEBHOOK_MAX_ATTEMPTS ?? 8);
        const backoff = Math.min(
          60 * 60_000,
          30_000 * 2 ** Math.max(0, attempts - 1),
        );
        await this.prisma.integrationWebhookDelivery.update({
          where: { id: row.id },
          data: {
            status: attempts >= max ? 'FAILED' : 'PENDING',
            attempts,
            lastError:
              e instanceof Error
                ? e.message.slice(0, 500)
                : String(e).slice(0, 500),
            nextAttemptAt: new Date(now.getTime() + backoff),
          },
        });
        failed++;
      }
    }
    return { scanned: rows.length, delivered, failed };
  }

  private toView(row: {
    id: string;
    url: string;
    events: unknown;
    keyId: string | null;
    createdAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      id: row.id,
      url: row.url,
      events: Array.isArray(row.events) ? row.events : [],
      keyId: row.keyId,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
      status: row.revokedAt ? 'revoked' : 'active',
    };
  }
}
