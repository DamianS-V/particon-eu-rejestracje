import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function decodeKey(encoded) {
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error('DASHBOARD_ENCRYPTION_KEY musi zawierać 32 bajty zakodowane base64url (43 znaki)');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encoded) throw new Error('Nieprawidłowy klucz szyfrowania');
  return key;
}

export function seal(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { version: 1, algorithm: 'AES-256-GCM', iv: iv.toString('base64url'), ciphertext: encrypted.toString('base64url') };
}

// Local tests only; browser uses WebCrypto independently.
export function unseal(envelope, key) {
  const data = Buffer.from(envelope.ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(data.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString('utf8'));
}
