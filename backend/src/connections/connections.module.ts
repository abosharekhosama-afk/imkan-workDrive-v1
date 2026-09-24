import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionCryptoService } from './connection-crypto.service';
import { ConnectionProviderRegistry } from './provider-registry.service';
import { ConnectionProviderAdapterService } from './connection-provider-adapter.service';
import { ConnectionHealthWorkerService } from './connection-health-worker.service';

@Module({ imports: [AuthModule], controllers: [ConnectionsController], providers: [ConnectionsService, ConnectionCryptoService, ConnectionProviderRegistry, ConnectionProviderAdapterService, ConnectionHealthWorkerService], exports: [ConnectionsService, ConnectionHealthWorkerService] })
export class ConnectionsModule {}
