import { describe, expect, it } from 'vitest';
import { decryptSensitive, encryptSensitive } from '../src/lib/crypto';

describe('crypto', () => {
  const secret = 'test-secret-value-please-change-in-prod';

  it('round-trips a token through AES-GCM', async () => {
    const plaintext = 'oauth-access-token-abc123';
    const ciphertext = await encryptSensitive(plaintext, secret);
    expect(ciphertext.startsWith('gcm:')).toBe(true);
    expect(await decryptSensitive(ciphertext, secret)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const a = await encryptSensitive('same', secret);
    const b = await encryptSensitive('same', secret);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong secret', async () => {
    const ciphertext = await encryptSensitive('secret-data', secret);
    await expect(decryptSensitive(ciphertext, 'wrong-secret')).rejects.toThrow();
  });
});
