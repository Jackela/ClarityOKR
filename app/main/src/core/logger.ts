export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level = process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.DEBUG;

  static setLevel(level: LogLevel) {
    Logger.level = level;
  }

  static debug(...args: unknown[]) {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  static info(...args: unknown[]) {
    if (Logger.level <= LogLevel.INFO) {
      console.info('[INFO]', ...args);
    }
  }

  static warn(...args: unknown[]) {
    if (Logger.level <= LogLevel.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  static error(...args: unknown[]) {
    if (Logger.level <= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
}
