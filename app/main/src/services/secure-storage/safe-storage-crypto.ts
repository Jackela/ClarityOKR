import { safeStorage } from 'electron';

import { SecureStorageError } from './secure-storage-error.js';

/**
 * Writes replacement ciphertext after a successful re-encrypt.
 * Implementations must not be called unless encryptStringAsync already succeeded.
 */
export type PersistReEncryptedCiphertext = (ciphertext: Buffer) => void;

/**
 * Encrypts plaintext with the Electron 44+ async safeStorage API.
 *
 * @see https://www.electronjs.org/docs/latest/api/safe-storage
 */
export async function encryptStringWithSafeStorage(plainText: string): Promise<Buffer> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new SecureStorageError('Safe storage is not available.');
  }
  return safeStorage.encryptStringAsync(plainText);
}

/**
 * Decrypts ciphertext produced by either the async or the legacy sync API.
 *
 * Official Electron 44 docs and specs state that data encrypted with
 * `encryptString` can be decrypted with `decryptStringAsync`
 * (https://www.electronjs.org/docs/latest/api/safe-storage and
 * https://www.electronjs.org/docs/latest/breaking-changes). There is a
 * known KDE/KWallet incompatibility (electron/electron#55760) where the
 * async provider uses a different wallet entry, so this helper falls back
 * to the still-available sync `decryptString` when async decrypt fails.
 *
 * If fallback (or `shouldReEncrypt`) requires writing a new blob, the new
 * ciphertext is persisted only after `encryptStringAsync` succeeds. A
 * failed re-encrypt or persist leaves the original ciphertext untouched
 * and still returns the plaintext.
 */
export async function decryptStringWithSafeStorage(
  encrypted: Buffer,
  persistReEncrypted?: PersistReEncryptedCiphertext,
): Promise<string> {
  const asyncAvailable = await safeStorage.isAsyncEncryptionAvailable();

  if (asyncAvailable) {
    try {
      const outcome = await safeStorage.decryptStringAsync(encrypted);
      if (outcome.shouldReEncrypt) {
        await tryPersistReEncrypt(outcome.result, persistReEncrypted);
      }
      return outcome.result;
    } catch {
      // Fall through to the legacy sync decrypt still present in Electron 44/45.
    }
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new SecureStorageError('Safe storage is not available.');
  }

  const plaintext = safeStorage.decryptString(encrypted);
  if (asyncAvailable) {
    await tryPersistReEncrypt(plaintext, persistReEncrypted);
  }
  return plaintext;
}

async function tryPersistReEncrypt(
  plaintext: string,
  persistReEncrypted?: PersistReEncryptedCiphertext,
): Promise<void> {
  if (!persistReEncrypted) {
    return;
  }
  try {
    const next = await safeStorage.encryptStringAsync(plaintext);
    persistReEncrypted(next);
  } catch {
    // Keep the original ciphertext: do not replace it on encrypt or write failure.
  }
}
