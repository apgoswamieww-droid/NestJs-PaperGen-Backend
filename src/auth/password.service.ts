import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify, type HashOptions } from 'argon2';
import { randomInt } from 'node:crypto';

const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const GENERATED_LENGTH = 14;
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*+-?';

@Injectable()
export class PasswordService {
  private readonly dummyHash: Promise<string> = hash(
    'pg-dummy-password',
    ARGON2_OPTIONS,
  );

  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  generate(): string {
    const alphabet = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;
    const required = [
      pick(UPPERCASE),
      pick(LOWERCASE),
      pick(DIGITS),
      pick(SYMBOLS),
    ];

    while (required.length < GENERATED_LENGTH) {
      required.push(pick(alphabet));
    }

    for (let index = required.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      const value = required[index] as string;

      required[index] = required[swap] as string;
      required[swap] = value;
    }

    return required.join('');
  }

  /**
   * Verifies a password against a stored hash. When the hash is missing (no
   * account for the submitted email) a dummy verification is still performed so
   * the response time does not reveal whether the account exists.
   */
  async verify(
    passwordHash: string | null | undefined,
    plain: string,
  ): Promise<boolean> {
    if (!passwordHash) {
      await verify(await this.dummyHash, plain).catch(() => false);
      return false;
    }

    try {
      return await verify(passwordHash, plain);
    } catch {
      return false;
    }
  }
}

function pick(from: string): string {
  return from[randomInt(from.length)] as string;
}
