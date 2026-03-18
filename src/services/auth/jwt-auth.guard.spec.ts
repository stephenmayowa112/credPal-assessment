import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new JwtAuthGuard(reflector);
  });

  it('should allow public routes without calling passport', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return user when present', () => {
    const user = { id: 'user-1' };

    const result = guard.handleRequest(null, user, null, {} as ExecutionContext);

    expect(result).toEqual(user);
  });

  it('should throw unauthorized when user is missing', () => {
    expect(() => guard.handleRequest(null, null, null, {} as ExecutionContext)).toThrow(
      UnauthorizedException,
    );
  });
});
