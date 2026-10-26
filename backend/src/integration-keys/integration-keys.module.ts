import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntegrationKeysController } from './integration-keys.controller';
import { IntegrationKeysService } from './integration-keys.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [IntegrationKeysController],
  providers: [IntegrationKeysService],
  exports: [IntegrationKeysService],
})
export class IntegrationKeysModule {}
