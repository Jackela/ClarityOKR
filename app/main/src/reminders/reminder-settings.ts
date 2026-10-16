import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { isPeriod, type Period } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

export const REMINDER_SETTINGS_FILE_NAME = 'reminder-settings.json';

/**
 * #54: which quarters' review banner the user closed. A small local settings file next to the
 * database — not part of any OKR, so export / backup never carry it and import, restore or
 * deleting an OKR never reset it. In in-memory database mode nothing is written: a dismissal
 * lasts for this run only (B9).
 */
export class ReminderSettings {
  private readonly filePath: string | null;
  private dismissed: Set<Period>;

  constructor(
    dir: string | null,
    private readonly writeFile: (path: string, content: string) => void = writeFileSync,
  ) {
    this.filePath = dir === null ? null : join(dir, REMINDER_SETTINGS_FILE_NAME);
    this.dismissed = new Set(this.read());
  }

  dismissedQuarters(): Period[] {
    return [...this.dismissed].sort();
  }

  /** Returns false when the choice could not be saved (it still holds for this run). */
  dismiss(period: Period): boolean {
    this.dismissed.add(period);
    if (this.filePath === null) return true;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.writeFile(
        this.filePath,
        JSON.stringify({ dismissedQuarters: this.dismissedQuarters() }),
      );
      return true;
    } catch (error) {
      Logger.warn('[reminders] Could not save the dismissed quarter', error);
      return false;
    }
  }

  private read(): Period[] {
    if (this.filePath === null || !existsSync(this.filePath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as {
        dismissedQuarters?: unknown;
      };
      return Array.isArray(parsed.dismissedQuarters)
        ? parsed.dismissedQuarters.filter(isPeriod)
        : [];
    } catch (error) {
      Logger.warn('[reminders] Unreadable settings, starting with none dismissed', error);
      return [];
    }
  }
}
