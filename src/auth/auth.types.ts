import type { Request } from 'express';

export const AUTH_SCOPES = ['app', 'admin'] as const;

export type AuthScope = (typeof AUTH_SCOPES)[number];

export interface AccessTokenPayload {
  sub: string;
  aud: AuthScope;
  iss: string;
  role: string;
  tid?: string;
}

export interface AuthIdentity {
  id: string;
  role: string;
  tenantId?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
}

export interface SessionResponse {
  accessToken: string;
  user: SessionUser;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthIdentity;
}

export function requestMeta(request: Request): RequestMeta {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}
