import { Injectable } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt.types';
import { PrismaService } from '../prisma/prisma.service';
import { auditListWhere } from './audit-access';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AccessTokenPayload) {
    return this.prisma.auditLog.findMany({
      where: auditListWhere(user),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
