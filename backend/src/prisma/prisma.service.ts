import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getTenantStore } from '../auth/tenant-context';
import { applyOrgScopeForOperation } from './apply-org-scope';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super();
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const orgId = getTenantStore()?.orgId;
            if (!orgId) {
              return query(args);
            }
            const scoped = applyOrgScopeForOperation(
              model,
              operation,
              args,
              orgId,
            );
            return query(scoped);
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
