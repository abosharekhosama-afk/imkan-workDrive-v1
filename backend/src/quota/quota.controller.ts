import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { IntegrationKeyAccess } from '../integration-keys/integration-key-access.decorator';
import { QuotaService } from './quota.service';

@Controller('storage/quota')
export class QuotaController {
  constructor(private readonly s: QuotaService) {}

  /** Human JWT or an integration key with files:read (so OMA can monitor org usage). */
  @IntegrationKeyAccess('files:read', { kind: 'none' })
  @Get()
  get(@CurrentUser() u: AccessTokenPayload) {
    return this.s.get(u);
  }
}
