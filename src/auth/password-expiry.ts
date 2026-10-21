const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A password is expired once it is older than the configured maximum age.
 * Accounts that have never changed their password (invitations awaiting
 * setup) are not treated as expired; they go through the invite flow instead.
 */
export function isPasswordExpired(
  passwordChangedAt: Date | null | undefined,
  maxAgeDays: number,
): boolean {
  if (!passwordChangedAt) {
    return false;
  }

  return Date.now() - passwordChangedAt.getTime() > maxAgeDays * MS_PER_DAY;
}
