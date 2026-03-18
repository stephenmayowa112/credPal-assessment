import { ForbiddenException } from '@nestjs/common';
import { VerifiedUserGuard } from './verified-user.guard';

describe('VerifiedUserGuard', () => {
  let guard: VerifiedUserGuard;

  beforeEach(() => {
    guard = new VerifiedUserGuard();
  });

  it('should allow verified users', () => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', isVerified: true },
        }),
      }),
    };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject unverified users', () => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', isVerified: false },
        }),
      }),
    };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject requests without user', () => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
    };

    expect(guard.canActivate(context)).toBe(false);
  });
});
