import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    TenantContextInterceptor,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [JwtAuthGuard, AuthService],
})
export class AuthModule {}
