import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { IntegrationKeyAccess } from './integration-key-access.decorator';
import { IntegrationKeysService } from './integration-keys.service';

@Controller()
export class IntegrationKeysController {
  constructor(private readonly keys: IntegrationKeysService) {}

  @Get('admin/integration-keys')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.list(user);
  }

  /** Returns the full secret exactly once. */
  @Post('admin/integration-keys')
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.keys.create(user, body);
  }

  @Post('admin/integration-keys/:id/revoke')
  revoke(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.keys.revoke(user, id);
  }

  @Delete('admin/integration-keys/:id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.keys.revoke(user, id);
  }

  /** Lets an integration verify its key: organization, scopes and root folder. */
  @Get('integration/self')
  @IntegrationKeyAccess(null)
  self(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.describeSelf(user);
  }
}
