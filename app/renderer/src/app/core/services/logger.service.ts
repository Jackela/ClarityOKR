import { Injectable } from '@angular/core';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

@Injectable({ providedIn: 'root' })
export class Logger {
  private level = LogLevel.DEBUG;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info('[INFO]', ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
}
