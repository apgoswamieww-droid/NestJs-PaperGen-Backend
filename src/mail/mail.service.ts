import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { AuthScope } from '../auth/auth.types.js';
import {
  buildCredentialsEmail,
  buildPasswordInviteEmail,
  buildPasswordResetEmail,
  type BuiltEmail,
} from './mail.templates.js';

export interface PasswordResetDetails {
  to: string;
  name: string;
  url: string;
  scope: AuthScope;
  expiresInMinutes: number;
}

export interface PasswordInviteDetails {
  to: string;
  name: string;
  tenantName: string;
  url: string;
  expiresInHours: number;
}

export interface CredentialsDetails {
  to: string;
  name: string;
  tenantName: string;
  email: string;
  password: string;
  url: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: ReturnType<
    typeof nodemailer.createTransport
  > | null;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.get<string>('mail.user');
    const pass = this.configService.get<string>('mail.pass');

    if (user && pass) {
      const host = this.configService.getOrThrow<string>('mail.host');
      const port = this.configService.getOrThrow<number>('mail.port');
      const secure = this.configService.getOrThrow<boolean>('mail.secure');

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.logger.log(
        `Mail transport ready (${host}:${port}, secure=${secure}).`,
      );
    } else {
      this.transporter = null;
      this.logger.warn(
        'SMTP_USER/SMTP_PASS are not set - emails are logged to the console instead of being sent.',
      );
    }
  }

  async sendPasswordReset(details: PasswordResetDetails): Promise<void> {
    const email = buildPasswordResetEmail(details);

    await this.deliver(details.to, details.url, email);
  }

  async sendPasswordInvite(details: PasswordInviteDetails): Promise<void> {
    const email = buildPasswordInviteEmail(details);

    await this.deliver(details.to, details.url, email);
  }

  async sendCredentials(details: CredentialsDetails): Promise<void> {
    const email = buildCredentialsEmail(details);

    await this.deliver(details.to, details.url, email);
  }

  private async deliver(
    to: string,
    url: string,
    email: BuiltEmail,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[console-mail] To: ${to} | Subject: ${email.subject} | Link: ${url}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress(),
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }

  private fromAddress(): string {
    const configured = this.configService.get<string>('mail.from');

    if (configured) {
      return configured;
    }

    const user = this.configService.get<string>('mail.user');

    return user
      ? `Paper Generator <${user}>`
      : 'Paper Generator <no-reply@papergen.local>';
  }
}
