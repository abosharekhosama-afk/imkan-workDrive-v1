import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { AuthenticatedRequest } from './jwt-auth.guard';
import type { AccessTokenPayload } from './jwt.types';

/**
 * Localized error returned when a non-Super Admin attempts to create a user
 * account inside the organization. The exact wording is part of the product
 * contract and must not be changed casually.
 */
export const SUPER_ADMIN_ONLY_MESSAGE =
  'تنصل: يُسمح فقط للسوبر أدمن (Super Admin) بإنشاء حسابات جديدة داخل المنظمة.';

export const ACCOUNT_CREATION_ERROR_CODE = 'FORBIDDEN_NOT_SUPER_ADMIN';

/**
 * Strict Role-Based Access Control for account creation routes.
 *
 * Runs after JwtAuthGuard populated `request.user` with the *refreshed*
 * membership role, so the check reflects the live database state rather than
 * a stale JWT claim.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user as AccessTokenPayload | undefined;

    if (!user || user.role !== OrgRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        statusCode: 403,
        code: ACCOUNT_CREATION_ERROR_CODE,
        message: SUPER_ADMIN_ONLY_MESSAGE,
      });
    }

    return true;
  }
}