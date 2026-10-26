import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AccessTokenPayload, JWT_SECRET_ENV } from './jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { OrgRole } from '@prisma/client';
import { Optional } from '@nestjs/common';
import { IntegrationKeysService } from '../integration-keys/integration-keys.service';
import { INTEGRATION_KEY_ACCESS, IntegrationKeyAccessRule } from '../integration-keys/integration-key-access.decorator';
import { isIntegrationKeyToken } from '../integration-keys/integration-key.crypto';

export type AuthenticatedRequest = Request & {
  user?: AccessTokenPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional() private readonly integrationKeys?: IntegrationKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const bearer = header.slice('Bearer '.length).trim();
    if (isIntegrationKeyToken(bearer)) {
      if (!this.integrationKeys) throw new UnauthorizedException('Integration keys are not enabled');
      const rule = this.reflector.getAllAndOverride<IntegrationKeyAccessRule | undefined>(INTEGRATION_KEY_ACCESS, [
        context.getHandler(),
        context.getClass(),
      ]);
      request.user = await this.integrationKeys.authenticate(bearer, rule, request);
      return true;
    }

    const secret = this.config.get<string>(JWT_SECRET_ENV);
    if (!secret) {
      throw new UnauthorizedException('JWT is not configured');
    }

    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, secret) as AccessTokenPayload;
      if (!payload.sub || !payload.org_id || !payload.jti) {
        throw new UnauthorizedException('Token is missing tenant claims');
      }
      
      // Verify session
      const session = await this.prisma.session.findFirst({ 
        where: { 
          id: payload.jti, 
          userId: payload.sub, 
          orgId: payload.org_id, 
          tokenHash: require('node:crypto').createHash('sha256').update(token).digest('hex'), 
          revokedAt: null, 
          expiresAt: { gt: new Date() } 
        } 
      });
      if (!session) throw new UnauthorizedException('Session is no longer valid');
      
      // Verify membership is active
      const membership = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: payload.sub,
          organizationId: payload.org_id,
          status: 'ACTIVE',
          ...(payload.membershipId ? { id: payload.membershipId } : {}),
        },
        select: { id: true, role: true, status: true, isTemplateAdmin: true },
      });
      if (!membership) throw new UnauthorizedException('Organization membership is no longer active');

      // Organization role is owned by OrganizationMembership. Refresh the
      // derived JWT claim so role changes take effect without stale sessions.
      request.user = {
        ...payload,
        role: membership.role,
        membershipId: membership.id,
        membershipStatus: membership.status,
        templateAdmin: membership.isTemplateAdmin || membership.role === OrgRole.ADMIN || membership.role === OrgRole.SUPER_ADMIN,
      };

      void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
