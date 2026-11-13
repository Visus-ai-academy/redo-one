import { describe, expect, it } from 'vitest';

import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('gera hash Argon2id no formato PHC, sem guardar a senha', async () => {
    const hash = await hasher.hash('cafe2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('cafe2026');
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hasher.hash('cafe2026');

    await expect(hasher.verify(hash, 'cafe2026')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'cafe2027')).resolves.toBe(false);
  });

  it('recusa hash malformado sem lançar erro', async () => {
    await expect(hasher.verify('nao-e-um-hash', 'cafe2026')).resolves.toBe(false);
  });
});
