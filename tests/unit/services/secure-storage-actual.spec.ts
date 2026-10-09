import { jest } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';

let directory: string;
jest.unstable_mockModule('@clarityokr/main/services/secure-storage/secure-storage-config', () => ({
  ensureConfigDir: () => mkdirSync(directory, { recursive: true, mode: 0o700 }),
  getKeyFilePath: () => join(directory, 'key.enc'),
  getConfigFilePath: () => join(directory, 'config.enc'),
  isSafeStorageAvailable: () => safeStorage.isEncryptionAvailable(),
}));
const { FallbackKeyProvider } =
  await import('@clarityokr/main/services/secure-storage/fallback-key-provider');
const { LlmConfigStore } =
  await import('@clarityokr/main/services/secure-storage/llm-config-store');
const { MasterKeyManager } =
  await import('@clarityokr/main/services/secure-storage/master-key-manager');
const facade = await import('@clarityokr/main/services/secure-storage/secure-storage-facade');
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

  it('fails closed when production OS credential encryption is unavailable', () => {
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    const provider = new FallbackKeyProvider();
    expect(provider.shouldUseFallbackKey()).toBe(false);
    expect(() => new MasterKeyManager(provider).getOrCreateKey()).toThrow('Safe storage');
    expect(() => new LlmConfigStore(provider).store(synthetic)).toThrow('Safe storage');
    expect(new LlmConfigStore(provider).hasConfig()).toBe(false);
  });

  it('uses one reproducible test key for the actual E2E_TEST=1 launch convention', () => {
    process.env.E2E_TEST = '1';
    const provider = new FallbackKeyProvider();
    expect(provider.shouldUseFallbackKey()).toBe(true);
    expect(provider.getFallbackEncryptionKey()).toEqual(provider.getFallbackEncryptionKey());
    const store = new LlmConfigStore(provider);
    store.store(synthetic);
    expect(store.retrieve()).toEqual(synthetic);
    expect(readFileSync(join(directory, 'config.enc'), 'utf8')).not.toContain(synthetic.apiKey);
  });

  it('encrypts synthetic credentials with actual AES, rejects corruption and clears only its own config', () => {
    process.env.CI = 'true';
    process.env.E2E_FALLBACK_KEY_SEED = 'only-test-seed';
    const provider = new FallbackKeyProvider();
    const store = new LlmConfigStore(provider);
    expect(store.retrieve()).toBeNull();
    expect(provider.getFallbackConfig()).toBeNull();
    provider.setFallbackConfig(synthetic);
    expect(provider.getFallbackConfig()).toEqual(synthetic);
    provider.clearFallbackConfig();
    expect(provider.getFallbackConfig()).toBeNull();
    expect(new MasterKeyManager(provider).getOrCreateKey()).toEqual(
      provider.getFallbackEncryptionKey(),
    );
    store.store(synthetic);
    const file = join(directory, 'config.enc');
    expect(store.hasConfig()).toBe(true);
    expect(store.retrieve()).toEqual(synthetic);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    writeFileSync(file, '{corrupt');
    expect(() => store.retrieve()).toThrow('Failed to retrieve');
    store.clear();
    store.clear();
    expect(store.hasConfig()).toBe(false);
  });

  it('uses the OS adapter for master-key creation and detects an invalid stored key', () => {
    const provider = new FallbackKeyProvider();
    const manager = new MasterKeyManager(provider);
    const first = manager.getOrCreateKey();
    expect(first).toHaveLength(32);
    expect(manager.getOrCreateKey()).toEqual(first);
    writeFileSync(join(directory, 'key.enc'), Buffer.from('invalid'));
    expect(() => manager.getOrCreateKey()).toThrow('Invalid encryption key');
    jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);
    expect(() => manager.getOrCreateKey()).toThrow('Safe storage');
  });

  it('keeps legacy facade precedence and reports missing configuration explicitly', () => {
    process.env.CI = 'true';
    expect(() => facade.getActiveLlmConfig()).toThrow('No LLM configuration');
    process.env.LLM_API_KEY = '  only-synthetic-environment  ';
    process.env.LLM_BASE_URL = '  http://127.0.0.1:7777  ';
    process.env.LLM_MODEL = '  test  ';
    expect(facade.getActiveLlmConfig()).toEqual({
      apiKey: 'only-synthetic-environment',
      baseUrl: 'http://127.0.0.1:7777',
      model: 'test',
    });
    facade.setFallbackConfig(synthetic);
    expect(facade.getActiveLlmConfig()).toEqual(synthetic);
    facade.storeLlmConfig({ ...synthetic, model: 'stored-test' });
    expect(facade.hasLlmConfig()).toBe(true);
    expect(facade.retrieveLlmConfig()).toEqual({ ...synthetic, model: 'stored-test' });
    expect(facade.getActiveLlmConfig().model).toBe('stored-test');
    expect(facade.getOrCreateMasterKey()).toHaveLength(32);
    facade.clearLlmConfig();
    expect(facade.hasLlmConfig()).toBe(false);
  });
});
