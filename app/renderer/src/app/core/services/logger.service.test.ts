import { TestBed } from '@angular/core/testing';
import { Logger, LogLevel } from './logger.service';

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    logger = TestBed.inject(Logger);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should be created', () => {
    expect(logger).toBeTruthy();
  });

  it('should output all levels when level is DEBUG', () => {
    logger.debug('debug-message');
    logger.info('info-message');
    logger.warn('warn-message');
    logger.error('error-message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG]', 'debug-message');
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO]', 'info-message');
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'warn-message');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'error-message');
  });

  it('should filter debug when level is INFO', () => {
    logger.setLevel(LogLevel.INFO);

    logger.debug('debug-message');
    logger.info('info-message');
    logger.warn('warn-message');
    logger.error('error-message');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('should filter debug and info when level is WARN', () => {
    logger.setLevel(LogLevel.WARN);

    logger.debug('debug-message');
    logger.info('info-message');
    logger.warn('warn-message');
    logger.error('error-message');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('should only output error when level is ERROR', () => {
    logger.setLevel(LogLevel.ERROR);

    logger.debug('debug-message');
    logger.info('info-message');
    logger.warn('warn-message');
    logger.error('error-message');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'error-message');
  });

  it('should support multiple arguments', () => {
    logger.info('arg1', 'arg2', { key: 'value' });

    expect(consoleInfoSpy).toHaveBeenCalledWith('[INFO]', 'arg1', 'arg2', { key: 'value' });
  });
});
