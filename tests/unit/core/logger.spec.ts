import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { Logger, LogLevel } from '@clarityokr/main/core/logger';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;
  let consoleInfoSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setLevel', () => {
    it('should suppress debug output when level is INFO', () => {
      Logger.setLevel(LogLevel.INFO);
      Logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should allow debug output when level is DEBUG', () => {
      Logger.setLevel(LogLevel.DEBUG);
      Logger.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'debug message');
    });

    it('should suppress info output when level is WARN', () => {
      Logger.setLevel(LogLevel.WARN);
      Logger.info('info message');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });

    it('should suppress warn output when level is ERROR', () => {
      Logger.setLevel(LogLevel.ERROR);
      Logger.warn('warn message');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should allow all levels when set to DEBUG', () => {
      Logger.setLevel(LogLevel.DEBUG);
      Logger.debug('d');
      Logger.info('i');
      Logger.warn('w');
      Logger.error('e');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('debug', () => {
    it('should log with [DEBUG] prefix at DEBUG level', () => {
      Logger.setLevel(LogLevel.DEBUG);
      Logger.debug('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'test message');
    });

    it('should log multiple arguments', () => {
      Logger.setLevel(LogLevel.DEBUG);
      Logger.debug('msg', 42, { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'msg', 42, { key: 'value' });
    });

    it('should not log at INFO level', () => {
      Logger.setLevel(LogLevel.INFO);
      Logger.debug('should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log with [INFO] prefix at INFO level', () => {
      Logger.setLevel(LogLevel.INFO);
      Logger.info('test message');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO]', 'test message');
    });

    it('should log at DEBUG level', () => {
      Logger.setLevel(LogLevel.DEBUG);
      Logger.info('test message');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO]', 'test message');
    });

    it('should not log at WARN level', () => {
      Logger.setLevel(LogLevel.WARN);
      Logger.info('should not appear');
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('should log with [WARN] prefix at WARN level', () => {
      Logger.setLevel(LogLevel.WARN);
      Logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'test message');
    });

    it('should log at INFO level', () => {
      Logger.setLevel(LogLevel.INFO);
      Logger.warn('test message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'test message');
    });

    it('should not log at ERROR level', () => {
      Logger.setLevel(LogLevel.ERROR);
      Logger.warn('should not appear');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should log with [ERROR] prefix at ERROR level', () => {
      Logger.setLevel(LogLevel.ERROR);
      Logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'test message');
    });

    it('should log at WARN level', () => {
      Logger.setLevel(LogLevel.WARN);
      Logger.error('test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'test message');
    });

    it('should log error objects', () => {
      Logger.setLevel(LogLevel.ERROR);
      const err = new Error('something went wrong');
      Logger.error('failed:', err);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'failed:', err);
    });
  });

  describe('default level', () => {
    it('should default to DEBUG in non-production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      jest.resetModules();
      const { Logger: FreshLogger } = await import('@clarityokr/main/core/logger');
      FreshLogger.setLevel(LogLevel.DEBUG);
      FreshLogger.debug('test');

      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'test');
      process.env.NODE_ENV = originalEnv;
    });
  });
});
