import { randomUUID } from 'node:crypto';

import type { UserActionLogEntry, UserActionType } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { IActionLogWriter } from '../persistence/action-log-writer.js';

/**
 * ActionLogService - 动作日志服务
 * 职责：记录用户操作日志
 */
export class ActionLogService {
  constructor(private readonly actionLogWriter: IActionLogWriter) {}

  async logAction(
    actionType: UserActionType,
    sessionId: string,
    okrId: string | null,
    payloadSummary: string,
  ): Promise<void> {
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

  logUnexpectedError(message: string, error: unknown): void {
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
