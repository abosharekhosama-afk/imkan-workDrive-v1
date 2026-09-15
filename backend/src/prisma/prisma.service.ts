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

            // استثناء الموديلات التي لا تحتوي على orgId
            const excludedModels = ['User', 'Organization'];

            if (!orgId || excludedModels.includes(model)) {
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