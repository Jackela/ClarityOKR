/** Key-result regeneration request / reply contract (split from closed-loop-ipc.ts, #164). */

import type { Parsed } from './result.js';
import type { OkrDetail } from './types.js';
import { MAX_ID_LENGTH, asRecord, invalid, isFailure, readId } from './validation.js';

/** §3.7: regenerate every key result (`krIds` omitted) or only the selected ones. */
export interface RegenerateKrsRequest {
  okrId: string;
  krIds?: string[];
}

/**
 * Which result-banner case applies (spec §3.7 table):
 * - `updated`: all ids came back, same order and count;
 * - `reordered`: all ids came back in another order;
 * - `changed`: some kept, some new and/or some removed (`missingIds` > 0 = some came back
 *   without a usable id, the 「id 缺失」 wording);
 * - `partial_updated` / `partial_removed`: a partial regeneration.
 */
export type RegenerateOutcome =
  'updated' | 'reordered' | 'changed' | 'partial_updated' | 'partial_removed';

export interface RegenerateSummary {
  outcome: RegenerateOutcome;
  /** Key results asked to be regenerated (all active ones, or the selection). */
  requested: number;
  kept: number;
  added: number;
  removed: number;
  /** New key results that came back without a usable id (counted in `added`). */
  missingIds: number;
  /** Ids of the new key results (shown with the 「新增」 tag). */
  addedIds: string[];
  /** Ids of the key results the regeneration rewrote or added (the rows that were regenerated). */
  touchedIds: string[];
}

export interface RegenerateKrsReply {
  detail: OkrDetail;
  summary: RegenerateSummary;
}

export const MAX_REGENERATE_SELECTION = 10;

export function parseRegenerateKrsRequest(payload: unknown): Parsed<RegenerateKrsRequest> {
  const record = asRecord(payload, ['okrId', 'krIds']);
  if (isFailure(record)) return record;
  const okrId = readId(record, 'okrId');
  if (isFailure(okrId)) return okrId;
  const krIds = record.krIds;
  if (krIds === undefined) return { ok: true, value: { okrId } };
  if (!Array.isArray(krIds)) return invalid('krIds', 'wrong_type');
  if (krIds.length === 0) return invalid('krIds', 'empty');
  if (krIds.length > MAX_REGENERATE_SELECTION) return invalid('krIds', 'above_max');
  const ids: string[] = [];
  for (const id of krIds) {
    if (typeof id !== 'string') return invalid('krIds', 'wrong_type');
    if (id.trim() === '') return invalid('krIds', 'empty');
    if (id.length > MAX_ID_LENGTH) return invalid('krIds', 'too_long');
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, value: { okrId, krIds: ids } };
}
