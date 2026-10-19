import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type {
  PasswordInviteDetails,
  PasswordResetDetails,
} from './mail.service.js';
import {
  buildPasswordInviteEmail,
  buildPasswordResetEmail,
} from './mail.templates.js';
import { MailService } from './mail.service.js';

const mocks = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-message' });
  const createTransport = vi.fn(() => ({ sendMail }));

  return { createTransport, sendMail };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));

function configService(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) {
        throw new Error(`Missing config value: ${key}`);
      }

      return values[key];
    },
  } as unknown as ConfigService;
}

const DETAILS: PasswordResetDetails = {
  to: 'teacher@school.edu',
  name: 'Teacher One',
  url: 'http://localhost:4200/reset-password?token=abc123',
  scope: 'app',
  expiresInMinutes: 30,
};

const INVITE_DETAILS: PasswordInviteDetails = {
  to: 'principal@school.edu',
  name: 'Principal One',
  tenantName: 'Sunrise Public School',
  url: 'http://localhost:4200/reset-password?token=invite123',
  expiresInHours: 72,
};

describe('MailService', () => {
  beforeEach(() => {
    mocks.createTransport.mockClear();
    mocks.sendMail.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the reset link instead of sending when SMTP is not configured', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new MailService(configService({}));

    await service.sendPasswordReset(DETAILS);

    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(DETAILS.url));
  });

  it('sends the email over SMTP when credentials are configured', async () => {
    const service = new MailService(
      configService({
        'mail.user': 'sender@gmail.com',
        'mail.pass': 'app-password',
        'mail.host': 'smtp.gmail.com',
        'mail.port': 465,
        'mail.secure': true,
      }),
    );

    await service.sendPasswordReset(DETAILS);

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'sender@gmail.com', pass: 'app-password' },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Paper Generator <sender@gmail.com>',
        to: DETAILS.to,
        subject: 'Reset your Paper Generator password',
        text: expect.stringContaining(DETAILS.url) as unknown,
        html: expect.stringContaining(DETAILS.url) as unknown,
      }),
    );
  });

  it('prefers MAIL_FROM over the account default', async () => {
    const service = new MailService(
      configService({
        'mail.user': 'sender@gmail.com',
        'mail.pass': 'app-password',
        'mail.host': 'smtp.gmail.com',
        'mail.port': 465,
        'mail.secure': true,
        'mail.from': 'School Desk <desk@school.edu>',
      }),
    );

    await service.sendPasswordReset(DETAILS);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'School Desk <desk@school.edu>' }),
    );
  });

  it('logs the invite link instead of sending when SMTP is not configured', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new MailService(configService({}));

    await service.sendPasswordInvite(INVITE_DETAILS);

    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(INVITE_DETAILS.url),
    );
  });

  it('sends the invitation email over SMTP when credentials are configured', async () => {
    const service = new MailService(
      configService({
        'mail.user': 'sender@gmail.com',
        'mail.pass': 'app-password',
        'mail.host': 'smtp.gmail.com',
        'mail.port': 465,
        'mail.secure': true,
      }),
    );

    await service.sendPasswordInvite(INVITE_DETAILS);

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: INVITE_DETAILS.to,
        subject:
          "You're invited to set up your Sunrise Public School admin account",
        text: expect.stringContaining(INVITE_DETAILS.url) as unknown,
        html: expect.stringContaining(INVITE_DETAILS.url) as unknown,
      }),
    );
  });
});

describe('buildPasswordResetEmail', () => {
  it('builds the school subject, expiry copy and links', () => {
    const email = buildPasswordResetEmail({
      name: 'Teacher One',
      url: DETAILS.url,
      scope: 'app',
      expiresInMinutes: 30,
    });

    expect(email.subject).toBe('Reset your Paper Generator password');
    expect(email.text).toContain(DETAILS.url);
    expect(email.text).toContain('30 minutes');
    expect(email.html).toContain(DETAILS.url);
  });

  it('builds the admin subject for the admin scope', () => {
    const email = buildPasswordResetEmail({
      name: 'Platform Owner',
      url: 'http://localhost:4200/admin/reset-password?token=xyz',
      scope: 'admin',
      expiresInMinutes: 15,
    });

    expect(email.subject).toBe(
      'Reset your Paper Generator super admin password',
    );
    expect(email.text).toContain('15 minutes');
  });

  it('escapes HTML in the recipient name', () => {
    const email = buildPasswordResetEmail({
      name: '<script>alert(1)</script>',
      url: DETAILS.url,
      scope: 'app',
      expiresInMinutes: 30,
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('buildPasswordInviteEmail', () => {
  it('builds the invite subject and copy with the school name', () => {
    const email = buildPasswordInviteEmail({
      name: 'Principal One',
      tenantName: 'Sunrise Public School',
      url: INVITE_DETAILS.url,
      expiresInHours: 72,
    });

    expect(email.subject).toBe(
      "You're invited to set up your Sunrise Public School admin account",
    );
    expect(email.text).toContain('Sunrise Public School');
    expect(email.text).toContain(INVITE_DETAILS.url);
    expect(email.text).toContain('72 hours');
    expect(email.html).toContain(INVITE_DETAILS.url);
  });

  it('escapes HTML in the school name and recipient name', () => {
    const email = buildPasswordInviteEmail({
      name: '<b>Evil</b>',
      tenantName: '<i>Fake</i> School',
      url: INVITE_DETAILS.url,
      expiresInHours: 72,
    });

    expect(email.html).not.toContain('<b>Evil</b>');
    expect(email.html).not.toContain('<i>Fake</i>');
    expect(email.html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    expect(email.html).toContain('&lt;i&gt;Fake&lt;/i&gt;');
  });
});
