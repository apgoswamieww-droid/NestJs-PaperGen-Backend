import { isPasswordExpired } from './password-expiry.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('isPasswordExpired', () => {
  it('is false when the password is younger than the maximum age', () => {
    expect(isPasswordExpired(new Date(Date.now() - 89 * MS_PER_DAY), 90)).toBe(
      false,
    );
  });

  it('is true when the password is older than the maximum age', () => {
    expect(isPasswordExpired(new Date(Date.now() - 91 * MS_PER_DAY), 90)).toBe(
      true,
    );
  });

  it('is false when the account never set a password (pending invite)', () => {
    expect(isPasswordExpired(null, 90)).toBe(false);
    expect(isPasswordExpired(undefined, 90)).toBe(false);
  });
});
