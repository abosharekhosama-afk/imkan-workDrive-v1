import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { runWithTenant } from './tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = request.user?.org_id;
    const userId = request.user?.sub;
    if (!orgId || !userId) {
      return next.handle();
    }
    return new Observable((observer) => {
      runWithTenant({ orgId, userId }, () => {
        next.handle().subscribe(observer);
      });
    });
  }
}
