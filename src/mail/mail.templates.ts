import type { AuthScope } from '../auth/auth.types.js';

export interface PasswordResetEmailInput {
  name: string;
  url: string;
  scope: AuthScope;
  expiresInMinutes: number;
}

export interface PasswordInviteEmailInput {
  name: string;
  url: string;
  tenantName: string;
  expiresInHours: number;
}

export interface CredentialsEmailInput {
  name: string;
  email: string;
  password: string;
  url: string;
  tenantName: string;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

export function buildCredentialsEmail(
  input: CredentialsEmailInput,
): BuiltEmail {
  const product = 'Paper Generator';
  const school = input.tenantName.replace(/\s+/g, ' ').trim();
  const subject = `Your ${school} account is ready`;

  const text = [
    `Hi ${input.name},`,
    '',
    `An account has been created for you at ${school} on ${product}.`,
    'Sign in with these details:',
    '',
    `Email: ${input.email}`,
    `Temporary password: ${input.password}`,
    '',
    `Sign in here: ${input.url}`,
    '',
    'We recommend changing this password after your first sign-in.',
    "If you weren't expecting this account, you can safely ignore this email.",
    '',
    `- ${product}`,
  ].join('\n');

  const name = escapeHtml(input.name);
  const escapedSchool = escapeHtml(school);
  const email = escapeHtml(input.email);
  const password = escapeHtml(input.password);
  const url = escapeHtml(input.url);
  const gradient = 'linear-gradient(135deg,#8c1d4e,#5c0d2e)';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 28px;background:${gradient};color:#ffffff;font-size:16px;font-weight:bold;">
          ${product}
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
            An account has been created for you at ${escapedSchool} on ${product}.
            Use the details below to sign in.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Email</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:bold;border-bottom:1px solid #e5e7eb;">${email}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Temporary password</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:bold;font-family:monospace;">${password}</td>
            </tr>
          </table>
          <p style="margin:0 0 20px;">
            <a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${gradient};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
              Sign in
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
            We recommend changing this password after your first sign-in. If the button doesn't
            work, copy this link into your browser:
          </p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#6b7280;">${url}</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            If you weren't expecting this account, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function buildPasswordInviteEmail(
  input: PasswordInviteEmailInput,
): BuiltEmail {
  const product = 'Paper Generator';
  const school = input.tenantName.replace(/\s+/g, ' ').trim();
  const expiry = `This link expires in ${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}.`;
  const subject = `You're invited to set up your ${school} admin account`;

  const text = [
    `Hi ${input.name},`,
    '',
    `${school} has been registered on ${product} by the platform team.`,
    'Your school admin account is ready - open the link below to choose your password and sign in:',
    '',
    input.url,
    '',
    expiry,
    "If you weren't expecting this invitation, you can safely ignore this email.",
    '',
    `- ${product}`,
  ].join('\n');

  const name = escapeHtml(input.name);
  const escapedSchool = escapeHtml(school);
  const url = escapeHtml(input.url);
  const gradient = 'linear-gradient(135deg,#8c1d4e,#5c0d2e)';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 28px;background:${gradient};color:#ffffff;font-size:16px;font-weight:bold;">
          ${product}
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
            ${escapedSchool} has been registered on ${product} by the platform team.
            Your school admin account is ready - choose a password to start signing in.
          </p>
          <p style="margin:0 0 20px;">
            <a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${gradient};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
              Set your password
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
            ${expiry} If the button doesn't work, copy this link into your browser:
          </p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#6b7280;">${url}</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export function buildPasswordResetEmail(
  input: PasswordResetEmailInput,
): BuiltEmail {
  const isAdmin = input.scope === 'admin';
  const product = 'Paper Generator';
  const audience = isAdmin ? 'super admin console' : 'workspace';
  const expiry = `This link expires in ${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? '' : 's'}.`;
  const subject = isAdmin
    ? 'Reset your Paper Generator super admin password'
    : 'Reset your Paper Generator password';

  const text = [
    `Hi ${input.name},`,
    '',
    `We received a request to reset the password for your ${product} ${audience} account.`,
    'Open the link below to choose a new password:',
    '',
    input.url,
    '',
    expiry,
    "If you didn't request this, you can safely ignore this email - your password will not change.",
    '',
    `- ${product}`,
  ].join('\n');

  const name = escapeHtml(input.name);
  const url = escapeHtml(input.url);
  const gradient = isAdmin
    ? 'linear-gradient(135deg,#4338ca,#1e1b4b)'
    : 'linear-gradient(135deg,#8c1d4e,#5c0d2e)';

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 28px;background:${gradient};color:#ffffff;font-size:16px;font-weight:bold;">
          ${product}
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:15px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
            We received a request to reset the password for your ${product} ${audience} account.
            Click the button below to choose a new password.
          </p>
          <p style="margin:0 0 20px;">
            <a href="${url}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${gradient};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
              Reset password
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
            ${expiry} If the button doesn't work, copy this link into your browser:
          </p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#6b7280;">${url}</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            If you didn't request this, you can safely ignore this email - your password will not change.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
