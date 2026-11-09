import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationKeysController } from './integration-keys.controller';
import { IntegrationKeysService } from './integration-keys.service';
import { IntegrationWebhooksService } from './integration-webhooks';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [IntegrationKeysController],
  providers: [IntegrationKeysService, IntegrationWebhooksService],
  exports: [IntegrationKeysService, IntegrationWebhooksService],
})
export class IntegrationKeysModule {}
