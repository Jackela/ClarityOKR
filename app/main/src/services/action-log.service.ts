/**
 * ActionLogService - User action logging service
 *
 * Responsibilities:
 * - Records user actions for analytics and debugging
 * - Persists action logs via ActionLogWriter
 * - Handles error serialization for logging unexpected errors
 */

import type { UserActionLogEntry, UserActionType } from '@clarityokr/contracts';
import { randomUUID } from 'node:crypto';

import { Logger } from '../core/logger.js';

import { Logger } from '../core/logger.js';
import type { ActionLogWriter } from '../persistence/action-log-writer.js';

/**
 * ActionLogService - 动作日志服务
 * 职责：记录用户操作日志
 */
export class ActionLogService {
  constructor(private readonly actionLogWriter: ActionLogWriter) {}

  /**
   * Logs a user action with metadata.
   *
   * @param actionType - Type of action performed (generate, regenerate, edit, copy)
   * @param sessionId - The related clarification session ID
   * @param okrId - The related OKR document ID, or null if not applicable
   * @param payloadSummary - Brief summary of the action payload
   * @returns Promise that resolves when log is persisted
   */
    actionType: UserActionType,
    sessionId: string,
    okrId: string | null,
    payloadSummary: string,
  async logAction(
    const action: UserActionLogEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      actionType,
      sessionId,
      okrId,
      payloadSummary,
    };

    await this.actionLogWriter.append(action);
  }

  /**
   * Logs an unexpected error with proper serialization.
   *
   * @param message - Error message describing the context
   * @param error - The error object or value to log
   */
    if (error instanceof Error) {
      Logger.error(message, error);
      return;
    }

    let serialized: string;

    if (typeof error === 'string') {
      serialized = error;
    } else if (typeof error === 'object' && error !== null) {
      try {
        serialized = JSON.stringify(error, undefined, 2);
      } catch {
        serialized = '[object Object]';
      }
    } else {
      serialized = String(error);
    }

    Logger.error(message, new Error(serialized));
  }
}
