import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionCryptoService } from './connection-crypto.service';
import { ConnectionProviderRegistry } from './provider-registry.service';

@Module({ controllers: [ConnectionsController], providers: [ConnectionsService, ConnectionCryptoService, ConnectionProviderRegistry], exports: [ConnectionsService] })
export class ConnectionsModule {}
