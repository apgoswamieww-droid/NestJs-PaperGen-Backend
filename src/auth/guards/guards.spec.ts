import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth.types.js';
import type { TokensService } from '../tokens.service.js';
import type { RolePermissionsService } from '../role-permissions.service.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OriginCheckGuard } from './origin-check.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function tokensMock(payload: unknown = null): TokensService {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue(payload),
  } as unknown as TokensService;
}

describe('JwtAuthGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const guard = new JwtAuthGuard(tokensMock());

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token', async () => {
    const guard = new JwtAuthGuard(tokensMock(null));
    const request = { headers: { authorization: 'Bearer broken' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the identity from a valid app token', async () => {
    const tokens = tokensMock({
      sub: 'user-1',
      role: 'school_admin',
      tid: 'tenant-1',
    });
    const guard = new JwtAuthGuard(tokens);
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer good-token' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toEqual({
      id: 'user-1',
      role: 'school_admin',
      tenantId: 'tenant-1',
    });
  });
});

describe('AdminJwtGuard', () => {
  it('verifies tokens with the admin audience', async () => {
    const verifyAccessToken = vi
      .fn()
      .mockResolvedValue({ sub: 'admin-1', role: 'super_admin' });
    const guard = new AdminJwtGuard({
      verifyAccessToken,
    } as unknown as TokensService);
    const request: AuthenticatedRequest = {
      headers: { authorization: 'Bearer good-token' },
    } as AuthenticatedRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth).toEqual({ id: 'admin-1', role: 'super_admin' });
    expect(verifyAccessToken).toHaveBeenCalledWith('good-token', 'admin');
  });
});

describe('RolesGuard', () => {
  it('allows requests when no roles are required', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('allows a matching role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['super_admin']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const request = { auth: { id: 'admin-1', role: 'super_admin' } };

    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('rejects a non-matching role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['super_admin']),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    const request = { auth: { id: 'user-1', role: 'teacher' } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      ForbiddenException,
    );
  });
});

describe('PermissionsGuard', () => {
  function createGuard(
    required: string[] | undefined,
    access: Awaited<ReturnType<RolePermissionsService['resolveAccess']>>,
    request: AuthenticatedRequest = {
      headers: {},
      auth: { id: 'user-1', role: 'teacher', tenantId: 'tenant-1' },
    } as AuthenticatedRequest,
  ): { guard: PermissionsGuard; request: AuthenticatedRequest } {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(required),
    };
    const rolePermissions = {
      resolveAccess: vi.fn().mockResolvedValue(access),
    } as unknown as RolePermissionsService;

    return {
      guard: new PermissionsGuard(
        reflector as unknown as Reflector,
        rolePermissions,
      ),
      request,
    };
  }

  it('allows requests that do not declare permissions', async () => {
    const { guard, request } = createGuard(undefined, null);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('allows access when every required permission is granted', async () => {
    const { guard, request } = createGuard(['masters.view'], {
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['masters.view'],
      passwordExpired: false,
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth?.role).toBe('teacher');
    expect(request.auth?.permissions).toEqual(['masters.view']);
  });

  it('rejects access when a permission is missing', async () => {
    const { guard, request } = createGuard(['masters.manage'], {
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['masters.view'],
      passwordExpired: false,
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects access when the account cannot be resolved', async () => {
    const { guard, request } = createGuard(['masters.view'], null);

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects access while the password is expired', async () => {
    const { guard, request } = createGuard(['masters.view'], {
      tenantId: 'tenant-1',
      role: 'teacher',
      permissions: ['masters.view'],
      passwordExpired: true,
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets the current school admin role through', async () => {
    const { guard, request } = createGuard(['settings.manage'], {
      tenantId: 'tenant-1',
      role: 'school_admin',
      permissions: [],
      passwordExpired: false,
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.auth?.role).toBe('school_admin');
  });
});

describe('OriginCheckGuard', () => {
  function createGuard(allowed: string[]): OriginCheckGuard {
    const configService = { get: () => allowed } as unknown as ConfigService;

    return new OriginCheckGuard(configService);
  }

  it('allows browser requests from an allow-listed origin', () => {
    const guard = createGuard(['http://localhost:4200']);

    expect(
      guard.canActivate(
        contextFor({ headers: { origin: 'http://localhost:4200' } }),
      ),
    ).toBe(true);
  });

  it('rejects browser requests from an unknown origin', () => {
    const guard = createGuard(['http://localhost:4200']);

    expect(() =>
      guard.canActivate(
        contextFor({ headers: { origin: 'http://evil.example' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows non-browser clients without origin or referer headers', () => {
    const guard = createGuard(['http://localhost:4200']);

    expect(guard.canActivate(contextFor({ headers: {} }))).toBe(true);
  });

  it('falls back to the referer origin', () => {
    const guard = createGuard(['http://localhost:4200']);

    expect(
      guard.canActivate(
        contextFor({
          headers: { referer: 'http://localhost:4200/login?next=1' },
        }),
      ),
    ).toBe(true);
  });
});
