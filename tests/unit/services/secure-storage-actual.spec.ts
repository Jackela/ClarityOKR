import { jest } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';

let directory: string;
jest.unstable_mockModule('@clarityokr/main/services/secure-storage/secure-storage-config', () => ({
  ensureConfigDir: () => mkdirSync(directory, { recursive: true, mode: 0o700 }),
  getKeyFilePath: () => join(directory, 'key.enc'),
  getConfigFilePath: () => join(directory, 'config.enc'),
  getConfigDir: () => directory,
  isSafeStorageAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
}));
const { FallbackKeyProvider } =
  await import('@clarityokr/main/services/secure-storage/fallback-key-provider');
const { LlmConfigStore } =
  await import('@clarityokr/main/services/secure-storage/llm-config-store');
const { MasterKeyManager } =
  await import('@clarityokr/main/services/secure-storage/master-key-manager');
const facade = await import('@clarityokr/main/services/secure-storage.service');
const originalEnvironment = process.env;
const synthetic = {
  apiKey: 'only-synthetic-fixture',
  baseUrl: 'http://127.0.0.1:7777',
  model: 'test',
};

describe('Actual credential persistence with isolated paths and OS adapter', () => {
  beforeEach(() => {
    const parent = join(process.cwd(), 'tmp');
    mkdirSync(parent, { recursive: true });
    directory = mkdtempSync(join(parent, 'secure-storage-'));
    // Preserve the real environment object and never redirect HOME or read credential files.
    process.env = Object.assign(Object.create(originalEnvironment), {
      CI: 'false',
      E2E_TEST: 'false',
      E2E_FALLBACK_KEY_SEED: '',
      LLM_API_KEY: '',
      LLM_BASE_URL: '',
      LLM_MODEL: '',
    });
  });
  afterEach(() => {
    process.env = originalEnvironment;
    jest.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('fails closed when production OS credential encryption is unavailable', async () => {
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    const provider = new FallbackKeyProvider();
    expect(provider.shouldUseFallbackKey()).toBe(false);
    await expect(new MasterKeyManager(provider).getOrCreateKey()).rejects.toThrow('Safe storage');
    await expect(new LlmConfigStore(provider).store(synthetic)).rejects.toThrow('Safe storage');
    expect(new LlmConfigStore(provider).hasConfig()).toBe(false);
  });

  it('uses one reproducible test key for the actual E2E_TEST=1 launch convention', async () => {
    process.env.E2E_TEST = '1';
    const provider = new FallbackKeyProvider();
    expect(provider.shouldUseFallbackKey()).toBe(true);
    expect(provider.getFallbackEncryptionKey()).toEqual(provider.getFallbackEncryptionKey());
    const store = new LlmConfigStore(provider);
    await store.store(synthetic);
    expect(await store.retrieve()).toEqual(synthetic);
    expect(readFileSync(join(directory, 'config.enc'), 'utf8')).not.toContain(synthetic.apiKey);
  });

  it('encrypts synthetic credentials with actual AES, rejects corruption and clears only its own config', async () => {
    process.env.CI = 'true';
    process.env.E2E_FALLBACK_KEY_SEED = 'only-test-seed';
    const provider = new FallbackKeyProvider();
    const store = new LlmConfigStore(provider);
    expect(await store.retrieve()).toBeNull();
    expect(provider.getFallbackConfig()).toBeNull();
    provider.setFallbackConfig(synthetic);
    expect(provider.getFallbackConfig()).toEqual(synthetic);
    provider.clearFallbackConfig();
    expect(provider.getFallbackConfig()).toBeNull();
    expect(await new MasterKeyManager(provider).getOrCreateKey()).toEqual(
      provider.getFallbackEncryptionKey(),
    );
    await store.store(synthetic);
    const file = join(directory, 'config.enc');
    expect(store.hasConfig()).toBe(true);
    expect(await store.retrieve()).toEqual(synthetic);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    writeFileSync(file, '{corrupt');
    await expect(store.retrieve()).rejects.toThrow('Failed to retrieve');
    store.clear();
    store.clear();
    expect(store.hasConfig()).toBe(false);
  });

  it('uses the OS adapter for master-key creation and detects an invalid stored key', async () => {
    const provider = new FallbackKeyProvider();
    const manager = new MasterKeyManager(provider);
    const first = await manager.getOrCreateKey();
    expect(first).toHaveLength(32);
    expect(await manager.getOrCreateKey()).toEqual(first);
    writeFileSync(join(directory, 'key.enc'), Buffer.from('invalid'));
    await expect(manager.getOrCreateKey()).rejects.toThrow('Invalid encryption key');
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    await expect(manager.getOrCreateKey()).rejects.toThrow('Safe storage');
  });

  it('keeps legacy facade precedence and reports missing configuration explicitly', async () => {
    process.env.CI = 'true';
    await expect(facade.getActiveLlmConfig()).rejects.toThrow('No LLM configuration');
    process.env.LLM_API_KEY = '  only-synthetic-environment  ';
    process.env.LLM_BASE_URL = '  http://127.0.0.1:7777  ';
    process.env.LLM_MODEL = '  test  ';
    expect(await facade.getActiveLlmConfig()).toEqual({
      apiKey: 'only-synthetic-environment',
      baseUrl: 'http://127.0.0.1:7777',
      model: 'test',
    });
    facade.setFallbackConfig(synthetic);
    expect(await facade.getActiveLlmConfig()).toEqual(synthetic);
    await facade.storeLlmConfig({ ...synthetic, model: 'stored-test' });
    expect(facade.hasLlmConfig()).toBe(true);
    expect(await facade.retrieveLlmConfig()).toEqual({ ...synthetic, model: 'stored-test' });
    expect((await facade.getActiveLlmConfig()).model).toBe('stored-test');
    expect(await facade.getOrCreateMasterKey()).toHaveLength(32);
    facade.clearLlmConfig();
    expect(facade.hasLlmConfig()).toBe(false);
  });

  it('decrypts a master key and LLM config that were encrypted with the legacy sync API', async () => {
    const provider = new FallbackKeyProvider();
    const key = (await new MasterKeyManager(provider).getOrCreateKey()).toString('base64');
    const legacyKey = safeStorage.encryptString(key);
    writeFileSync(join(directory, 'key.enc'), legacyKey);
    expect(await new MasterKeyManager(provider).getOrCreateKey()).toEqual(
      Buffer.from(key, 'base64'),
    );

    const legacyConfig = safeStorage.encryptString(JSON.stringify(synthetic));
    writeFileSync(join(directory, 'config.enc'), legacyConfig);
    expect(await new LlmConfigStore(provider).retrieve()).toEqual(synthetic);
  });

  it('preserves the original ciphertext when encryption is unavailable, decrypt throws, or re-encrypt throws', async () => {
    const provider = new FallbackKeyProvider();
    const legacyConfig = safeStorage.encryptString(JSON.stringify(synthetic));
    const file = join(directory, 'config.enc');
    writeFileSync(file, legacyConfig);
    const original = Buffer.from(legacyConfig);

    jest.spyOn(safeStorage, 'isAsyncEncryptionAvailable').mockResolvedValue(false);
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    await expect(new LlmConfigStore(provider).retrieve()).rejects.toThrow('Safe storage');
    expect(readFileSync(file).equals(original)).toBe(true);

    jest.restoreAllMocks();
    writeFileSync(file, legacyConfig);
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
      throw new Error('sync decrypt failed');
    });
    await expect(new LlmConfigStore(provider).retrieve()).rejects.toThrow('Failed to retrieve');
    expect(readFileSync(file).equals(original)).toBe(true);

    jest.restoreAllMocks();
    writeFileSync(file, legacyConfig);
    jest
      .spyOn(safeStorage, 'decryptStringAsync')
      .mockRejectedValue(new Error('Error while decrypting the ciphertext'));
    jest.spyOn(safeStorage, 'encryptStringAsync').mockRejectedValue(new Error('re-encrypt failed'));
    expect(await new LlmConfigStore(provider).retrieve()).toEqual(synthetic);
    expect(readFileSync(file).equals(original)).toBe(true);
  });
});
