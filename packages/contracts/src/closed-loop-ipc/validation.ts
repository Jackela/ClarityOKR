/**
 * Shared field readers for the closed-loop request validators (split from closed-loop-ipc.ts,
 * #164). Internal to the contracts package: not re-exported from closed-loop-ipc.ts.
 */

import { checkText, isKrStatus, type KrStatus } from '../okr-model.js';
import { ipcFail, type FieldReason, type IpcFailure, type Parsed } from './result.js';

export type Rec = Record<string, unknown>;

export const MAX_ID_LENGTH = 128;
export const MAX_PATH_LENGTH = 4096;

export function invalid(field: string, reason: FieldReason, message?: string): IpcFailure {
  return ipcFail('INVALID_REQUEST', message ?? `Invalid request field "${field}": ${reason}`, {
    field,
    reason,
  });
}

export function asRecord(payload: unknown, allowed: readonly string[]): Rec | IpcFailure {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return invalid('payload', 'wrong_type', 'The request must be an object');
  }
  const record = payload as Rec;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return invalid(key, 'unknown_field');
  }
  return record;
}

export function isFailure(value: unknown): value is IpcFailure {
  return typeof value === 'object' && value !== null && (value as IpcFailure).ok === false;
}

export function readId(record: Rec, field: string): string | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  if (value.length === 0 || value.trim().length === 0) return invalid(field, 'empty');
  if (value.length > MAX_ID_LENGTH) return invalid(field, 'too_long');
  return value;
}

export function readStatus(record: Rec, field: string): KrStatus | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  if (!isKrStatus(value)) return invalid(field, 'invalid_value');
  return value;
}

/** Progress is an integer 0-100 or null (cleared). */
export function readProgressValue(value: unknown, field: string): number | null | IpcFailure {
  if (value === null) return null;
  if (typeof value !== 'number') return invalid(field, 'wrong_type');
  if (!Number.isFinite(value) || !Number.isInteger(value)) return invalid(field, 'not_integer');
  if (value < 0) return invalid(field, 'below_min');
  if (value > 100) return invalid(field, 'above_max');
  return value;
}

export function readText(record: Rec, field: string, limit: number): string | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  const check = checkText(value, limit);
  if (!check.ok) return invalid(field, check.reason);
  return value;
}

export function parseIdOnly<K extends string>(payload: unknown, key: K): Parsed<Record<K, string>> {
  const record = asRecord(payload, [key]);
  if (isFailure(record)) return record;
  const id = readId(record, key);
  if (isFailure(id)) return id;
  return { ok: true, value: { [key]: id } as Record<K, string> };
}
