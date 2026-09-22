import { Global, Module } from '@nestjs/common';
import { EffectivePermissionService } from './effective-permission.service';
import { PermissionService } from './permission.service';

@Global()
@Module({
  providers: [PermissionService, EffectivePermissionService],
  exports: [PermissionService, EffectivePermissionService],
})
export class PermissionsModule {}
