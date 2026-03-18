import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { User } from '../../entities/user.entity';

@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      return false;
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Email verification required');
    }

    return true;
  }
}
