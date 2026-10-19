import { Test, type TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get(PasswordService);
  });

  it('hashes a password into an argon2id digest and verifies it', async () => {
    const digest = await service.hash('CorrectHorse1');

    expect(digest.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(digest, 'CorrectHorse1')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await service.hash('CorrectHorse1');

    await expect(service.verify(digest, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false for missing hashes without throwing', async () => {
    await expect(service.verify(null, 'whatever')).resolves.toBe(false);
    await expect(service.verify(undefined, 'whatever')).resolves.toBe(false);
    await expect(service.verify('', 'whatever')).resolves.toBe(false);
  });

  it('returns false for a malformed hash', async () => {
    await expect(service.verify('not-a-real-hash', 'whatever')).resolves.toBe(
      false,
    );
  });
});
