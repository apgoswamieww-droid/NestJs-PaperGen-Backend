import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import { PasswordResetToken } from '../schemas/password-reset-token.schema.js';
import type { AuthScope, RequestMeta } from './auth.types.js';

const RESET_BYTES = 32;

export interface ResetIssue {
  token: string;
  expiresInMinutes: number;
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(PasswordResetToken.name)
    private readonly resetTokenModel: Model<PasswordResetToken>,
  ) {}

  /** Issues a single reset link, invalidating any previous unused ones. */
  async create(
    scope: AuthScope,
    subjectId: Types.ObjectId,
    email: string,
    meta: RequestMeta,
    ttlMinutes?: number,
  ): Promise<ResetIssue> {
    const minutes =
      ttlMinutes ??
      this.configService.getOrThrow<number>('mail.resetTtlMinutes');
    const token = randomBytes(RESET_BYTES).toString('base64url');

    await this.resetTokenModel
      .updateMany(
        { subjectId, subjectType: scope, usedAt: null },
        { $set: { usedAt: new Date() } },
      )
      .exec();

    await this.resetTokenModel.create({
      tokenHash: this.hash(token),
      subjectId,
      subjectType: scope,
      email,
      expiresAt: new Date(Date.now() + minutes * 60_000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return { token, expiresInMinutes: minutes };
  }

  /** Atomically claims a reset token; returns the subject id or null. */
  async redeem(
    rawToken: string,
    scope: AuthScope,
  ): Promise<Types.ObjectId | null> {
    const record = await this.resetTokenModel
      .findOne({ tokenHash: this.hash(rawToken) })
      .exec();

    if (
      !record ||
      record.subjectType !== scope ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    const claimed = await this.resetTokenModel
      .findOneAndUpdate(
        { _id: record._id, usedAt: null },
        { $set: { usedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();

    return claimed ? claimed.subjectId : null;
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
