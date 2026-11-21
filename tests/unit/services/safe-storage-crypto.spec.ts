import { jest } from '@jest/globals';
import { safeStorage } from 'electron';

const { decryptStringWithSafeStorage, encryptStringWithSafeStorage } =
  await import('@clarityokr/main/services/secure-storage/safe-storage-crypto');

describe('safeStorage async crypto helper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('encrypts with the async API when it is available', async () => {
    const encrypt = jest
      .spyOn(safeStorage, 'encryptStringAsync')
      .mockResolvedValue(Buffer.from('async-cipher'));
    await expect(encryptStringWithSafeStorage('secret')).resolves.toEqual(
      Buffer.from('async-cipher'),
    );
    expect(encrypt).toHaveBeenCalledWith('secret');
  });

  it('refuses to encrypt when async encryption is unavailable', async () => {
    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    const encrypt = jest.spyOn(safeStorage, 'encryptStringAsync');
    await expect(encryptStringWithSafeStorage('secret')).rejects.toThrow('Safe storage');
    expect(encrypt).not.toHaveBeenCalled();
  });

  it('decrypts ciphertext produced by the legacy sync API via decryptStringAsync', async () => {
    const legacy = safeStorage.encryptString('legacy-plaintext');
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(legacy, persist)).resolves.toBe('legacy-plaintext');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns plaintext without writing when shouldReEncrypt is true but no persist callback is given', async () => {
    jest.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValue({
      result: 'rotated',
      shouldReEncrypt: true,
    });
    const encrypt = jest.spyOn(safeStorage, 'encryptStringAsync');
    await expect(decryptStringWithSafeStorage(Buffer.from('old'))).resolves.toBe('rotated');
    expect(encrypt).not.toHaveBeenCalled();
  });

  it('re-encrypts and persists only after a successful encrypt when shouldReEncrypt is true', async () => {
    jest.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValue({
      result: 'rotated',
      shouldReEncrypt: true,
    });
    const encrypt = jest
      .spyOn(safeStorage, 'encryptStringAsync')
      .mockResolvedValue(Buffer.from('new-cipher'));
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('old'), persist)).resolves.toBe(
      'rotated',
    );
    expect(encrypt).toHaveBeenCalledWith('rotated');
    expect(persist).toHaveBeenCalledWith(Buffer.from('new-cipher'));
  });

  it('keeps the original ciphertext when shouldReEncrypt is true but re-encrypt throws', async () => {
    jest.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValue({
      result: 'rotated',
      shouldReEncrypt: true,
    });
    jest.spyOn(safeStorage, 'encryptStringAsync').mockRejectedValue(new Error('encrypt failed'));
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('old'), persist)).resolves.toBe(
      'rotated',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('keeps the original ciphertext when persist throws after a successful re-encrypt', async () => {
    jest.spyOn(safeStorage, 'decryptStringAsync').mockResolvedValue({
      result: 'rotated',
      shouldReEncrypt: true,
    });
    jest.spyOn(safeStorage, 'encryptStringAsync').mockResolvedValue(Buffer.from('new-cipher'));
    const persist = jest.fn(() => {
      throw new Error('write failed');
    });
    await expect(decryptStringWithSafeStorage(Buffer.from('old'), persist)).resolves.toBe(
      'rotated',
    );
    expect(persist).toHaveBeenCalled();
  });

  it('falls back to sync decrypt when async decrypt throws, then migrates after a successful re-encrypt', async () => {
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    const syncDecrypt = jest.spyOn(safeStorage, 'decryptString').mockReturnValue('legacy-secret');
    const encrypt = jest
      .spyOn(safeStorage, 'encryptStringAsync')
      .mockResolvedValue(Buffer.from('migrated'));
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).resolves.toBe(
      'legacy-secret',
    );
    expect(syncDecrypt).toHaveBeenCalled();
    expect(encrypt).toHaveBeenCalledWith('legacy-secret');
    expect(persist).toHaveBeenCalledWith(Buffer.from('migrated'));
  });

  it('returns plaintext and does not persist when fallback re-encrypt throws', async () => {
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    jest.spyOn(safeStorage, 'decryptString').mockReturnValue('legacy-secret');
    jest.spyOn(safeStorage, 'encryptStringAsync').mockRejectedValue(new Error('encrypt failed'));
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).resolves.toBe(
      'legacy-secret',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not re-encrypt when only the legacy sync API is available', async () => {
    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);
    const syncDecrypt = jest.spyOn(safeStorage, 'decryptString').mockReturnValue('legacy-secret');
    const encrypt = jest.spyOn(safeStorage, 'encryptStringAsync');
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).resolves.toBe(
      'legacy-secret',
    );
    expect(syncDecrypt).toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('throws and does not persist when async decrypt fails and sync encryption is unavailable', async () => {
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).rejects.toThrow(
      'Safe storage',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('throws and does not persist when both decrypt paths fail', async () => {
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
      throw new Error('sync decrypt failed');
    });
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).rejects.toThrow(
      'sync decrypt failed',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it('throws when neither async nor sync encryption is available', async () => {
    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    const persist = jest.fn();
    await expect(decryptStringWithSafeStorage(Buffer.from('sync-blob'), persist)).rejects.toThrow(
      'Safe storage',
    );
    expect(persist).not.toHaveBeenCalled();
  });
});
