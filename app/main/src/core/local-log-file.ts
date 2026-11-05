import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { Logger } from './logger.js';

/** Plain values only: a log entry never carries user text (S3§12.9, 产品经理 2026-11-05). */
export type LocalLogFields = Record<string, string | number | null>;

/**
 * The main process's local log file (`<logs>/main.log`): one line per entry,
 * `<ISO time> <LEVEL> <event> <JSON fields>`. Written synchronously so an entry is on disk even
 * when the app quits right after. A write failure is reported on the console and never thrown.
 */
export class LocalLogFile {
  constructor(private readonly file: string | null) {}

  get path(): string | null {
    return this.file;
  }

  warn(event: string, fields: LocalLogFields): void {
    Logger.warn(event, fields);
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(
        this.file,
        `${new Date().toISOString()} WARN ${event} ${JSON.stringify(fields)}\n`,
        'utf8',
      );
    } catch (error) {
      Logger.error('[local-log] Could not write the log file', error);
    }
  }
}
