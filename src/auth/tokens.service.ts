import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import { RefreshToken } from '../schemas/refresh-token.schema.js';
import type {
  AccessTokenPayload,
  AuthScope,
  RequestMeta,
} from './auth.types.js';

const ISSUER = 'papergen-api';
const REFRESH_BYTES = 32;

export interface RefreshIssue {
  token: string;
  expiresAt: Date;
}

export type RotateResult =
  | { ok: true; token: string; expiresAt: Date; subjectId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' };

export interface AccessSubject {
  id: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
  ) {}

  async issueAccessToken(
    subject: AccessSubject,
    scope: AuthScope,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { role: subject.role, tid: subject.tenantId },
      {
        subject: subject.id,
        audience: scope,
        issuer: ISSUER,
        secret: this.accessSecret(scope),
        expiresIn: this.configService.getOrThrow<string>(
          'auth.accessTtl',
        ) as JwtSignOptions['expiresIn'],
      },
    );
  }

  async verifyAccessToken(
    token: string,
    scope: AuthScope,
  ): Promise<AccessTokenPayload | null> {
    try {
      return await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        audience: scope,
        issuer: ISSUER,
        secret: this.accessSecret(scope),
      });
    } catch {
      return null;
    }
  }

  async issueRefreshToken(
    subjectId: Types.ObjectId,
    subjectType: AuthScope,
    remember: boolean,
    meta: RequestMeta,
  ): Promise<RefreshIssue> {
    const token = randomBytes(REFRESH_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs(remember));

    await this.refreshTokenModel.create({
      tokenHash: this.hashToken(token),
      subjectId,
      subjectType,
      familyId: randomUUID(),
      remember,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { token, expiresAt };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a replacement
   * is issued in the same family. Presenting an already revoked token is
   * treated as theft and revokes the whole family.
   */
  async rotateRefreshToken(
    rawToken: string,
    subjectType: AuthScope,
    meta: RequestMeta,
  ): Promise<RotateResult> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.refreshTokenModel.findOne({ tokenHash }).exec();

    if (!record || record.subjectType !== subjectType) {
      return { ok: false, reason: 'invalid' };
    }

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      return { ok: false, reason: 'reused' };
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }

    const token = randomBytes(REFRESH_BYTES).toString('base64url');
    const nextHash = this.hashToken(token);

    const claimed = await this.refreshTokenModel
      .findOneAndUpdate(
        { _id: record._id, revokedAt: null },
        { $set: { revokedAt: new Date(), replacedByHash: nextHash } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!claimed) {
      await this.revokeFamily(record.familyId);
      return { ok: false, reason: 'reused' };
    }

    const expiresAt = new Date(Date.now() + this.ttlMs(record.remember));

    await this.refreshTokenModel.create({
      tokenHash: nextHash,
      subjectId: record.subjectId,
      subjectType,
      familyId: record.familyId,
      remember: record.remember,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ok: true,
      token,
      expiresAt,
      subjectId: record.subjectId.toString(),
    };
  }

  async revokeRefreshToken(
    rawToken: string,
    subjectType: AuthScope,
  ): Promise<void> {
    await this.refreshTokenModel
      .updateOne(
        { tokenHash: this.hashToken(rawToken), subjectType, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  async revokeAllForSubject(
    subjectId: Types.ObjectId,
    subjectType: AuthScope,
  ): Promise<void> {
    await this.refreshTokenModel
      .updateMany(
        { subjectId, subjectType, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }

  private accessSecret(scope: AuthScope): string {
    return scope === 'admin'
      ? this.configService.getOrThrow<string>('auth.adminAccessSecret')
      : this.configService.getOrThrow<string>('auth.appAccessSecret');
  }

  private ttlMs(remember: boolean): number {
    const hours = this.configService.getOrThrow<number>('auth.refreshTtlHours');
    const days = this.configService.getOrThrow<number>(
      'auth.refreshTtlRememberDays',
    );

    return (remember ? days * 24 : hours) * 60 * 60 * 1000;
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
