import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
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
  revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.keys.revoke(user, id);
  }

  @Delete('admin/integration-keys/:id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.keys.revoke(user, id);
  }

  /** Lets an integration verify its key: organization, scopes and root folder. */
  @Get('integration/self')
  @IntegrationKeyAccess(null)
  self(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.describeSelf(user);
  }

  @Get('integration/keys')
  @IntegrationKeyAccess('keys:manage')
  listChildren(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.listChildren(user);
  }

  @Post('integration/keys')
  @IntegrationKeyAccess('keys:manage', {
    kind: 'bodyFolder',
    fields: ['rootFolderId', 'root_folder_id'],
  })
  mintChild(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.keys.mintChild(user, body);
  }

  @Post('integration/keys/:id/revoke')
  @IntegrationKeyAccess('keys:manage')
  revokeChild(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.keys.revokeChild(user, id);
  }

  @Get('integration/webhooks')
  @IntegrationKeyAccess('keys:manage')
  listWebhooks(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.listWebhooks(user);
  }

  @Post('integration/webhooks')
  @IntegrationKeyAccess('keys:manage')
  registerWebhook(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.keys.registerWebhook(user, body);
  }

  @Get('integration/webhooks/:id/deliveries')
  @IntegrationKeyAccess('keys:manage')
  webhookDeliveries(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.keys.listWebhookDeliveries(user, id);
  }

  @Delete('integration/webhooks/:id')
  @IntegrationKeyAccess('keys:manage')
  revokeWebhook(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.keys.revokeWebhook(user, id);
  }
}
