import {
  TEXT_LIMITS,
  checkText,
  isKrStatus,
  isPeriod,
  type ImportProblem,
} from '@clarityokr/contracts';

import { EXPORT_SCHEMA_VERSION, type ExportJsonDocument } from '../export/export-document.js';
import {
  parseLocation,
  presentIssue,
  type ImportIssueCode,
  type ImportIssueParams,
  type StructuredImportIssue,
} from './import-issues.js';

/**
 * One validation problem: structured (code, location, params — #69) plus the `field` / `reason`
 * pair shown today, derived from it in import-issues.ts.
 */
export interface ImportIssue extends StructuredImportIssue {
  field: string;
  reason: string;
}

function issue(path: string, code: ImportIssueCode, params: ImportIssueParams = {}): ImportIssue {
  const structured: StructuredImportIssue = { code, location: parseLocation(path), params };
  return { ...structured, ...presentIssue(structured) };
}

export type ParsedImport =
  | {
      ok: true;
      /** One for a single-OKR file, every OKR of a backup (#50) in file order. */
      documents: ExportJsonDocument[];
      /** Set for a `kind: "backup"` file. */
      backup?: { exportedAt: string; appVersion: string };
    }
  | { ok: false; problem: ImportProblem };

type Rec = Record<string, unknown>;

/** An OKR has at most 10 key results that are not removed (B4). */
export const MAX_ACTIVE_KEY_RESULTS = 10;

const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ISO 8601 timestamps as the app writes them; anything `Date` cannot read is rejected. */
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value));

class Checker {
  readonly issues: ImportIssue[] = [];

  add(path: string, code: ImportIssueCode, params: ImportIssueParams = {}): void {
    this.issues.push(issue(path, code, params));
  }

  /** Present and a record. */
  record(parent: Rec, key: string, path: string): Rec | null {
    const value = parent[key];
    if (value === undefined) return this.missing(path);
    if (!isRecord(value)) return this.wrong(path, '对象');
    return value;
  }

  array(parent: Rec, key: string, path: string): unknown[] | null {
    const value = parent[key];
    if (value === undefined) return this.missing(path);
    if (!Array.isArray(value)) return this.wrong(path, '数组');
    return value;
  }

  text(
    parent: Rec,
    key: string,
    path: string,
    opts: { max?: number; nullable?: boolean; nonEmpty?: boolean } = {},
  ): string | null | undefined {
    const value = parent[key];
    if (value === undefined) return this.missing(path) ?? undefined;
    if (value === null && opts.nullable) return null;
    if (typeof value !== 'string') return this.wrong(path, '字符串') ?? undefined;
    if (opts.nonEmpty && value.trim().length === 0) {
      this.add(path, 'empty');
      return undefined;
    }
    if (opts.max !== undefined && !checkText(value, opts.max).ok) {
      this.add(path, 'too_long', { max: opts.max });
      return undefined;
    }
    return value;
  }

  timestamp(parent: Rec, key: string, path: string, nullable = false): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (value === null && nullable) return;
    if (!isTimestamp(value)) this.add(path, 'invalid_time');
  }

  boolean(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (typeof value !== 'boolean') this.wrong(path, '布尔值');
  }

  status(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (!isKrStatus(value)) this.add(path, 'invalid_status');
  }

  progress(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (value === null) return;
    if (typeof value !== 'number') return void this.wrong(path, '数字或 null');
    if (!Number.isInteger(value)) return void this.add(path, 'not_integer');
    if (value < 0 || value > 100) this.add(path, 'out_of_range');
  }

  private missing(path: string): null {
    this.add(path, 'missing');
    return null;
  }

  private wrong(path: string, expected: string): null {
    this.add(path, 'wrong_type', { expected });
    return null;
  }
}

function checkObjective(c: Checker, root: Rec): void {
  const objective = c.record(root, 'objective', 'objective');
  if (!objective) return;
  c.text(objective, 'title', 'objective.title', { max: TEXT_LIMITS.objective, nonEmpty: true });
  const period = objective.period;
  if (period === undefined) c.add('objective.period', 'missing');
  else if (period !== null && !isPeriod(period)) c.add('objective.period', 'invalid_period');
  c.boolean(objective, 'pinned', 'objective.pinned');
  c.timestamp(objective, 'createdAt', 'objective.createdAt');
  c.timestamp(objective, 'updatedAt', 'objective.updatedAt');
}

/** Returns the ids of the well-formed key results (for reference checks). */
function checkKeyResults(c: Checker, root: Rec, okrNumber?: number): Set<string> {
  const ids = new Set<string>();
  const list = c.array(root, 'keyResults', 'keyResults');
  if (!list) return ids;
  if (list.length === 0) c.add('keyResults', 'no_key_results');
  // Same cap as the editor (MAX_KEY_RESULTS in okr-sticky-note); removed KRs are history only.
  const active = list.filter(
    (kr) => isRecord(kr) && (kr.removedAt === null || kr.removedAt === undefined),
  ).length;
  if (active > MAX_ACTIVE_KEY_RESULTS) {
    // Plain wording, no field path (settled for B4): the dialog shows the sentence as is.
    c.add('keyResults', 'too_many_key_results', {
      count: active,
      limit: MAX_ACTIVE_KEY_RESULTS,
      ...(okrNumber === undefined ? {} : { okrNumber }),
    });
  }
  list.forEach((item, i) => {
    const path = `keyResults[${i}]`;
    if (!isRecord(item)) return void c.add(path, 'wrong_type', { expected: '对象' });
    const id = c.text(item, 'id', `${path}.id`, { max: 200, nonEmpty: true });
    if (typeof id === 'string') {
      if (ids.has(id)) c.add(`${path}.id`, 'duplicate_key_result');
      ids.add(id);
    }
    c.text(item, 'statement', `${path}.statement`, { max: TEXT_LIMITS.keyResult, nonEmpty: true });
    c.text(item, 'successMetric', `${path}.successMetric`, {
      max: TEXT_LIMITS.successMetric,
      nullable: true,
    });
    c.progress(item, 'progress', `${path}.progress`);
    c.status(item, 'status', `${path}.status`);
    c.timestamp(item, 'removedAt', `${path}.removedAt`, true);
  });
  return ids;
}

function checkProgressEntries(c: Checker, root: Rec, krIds: Set<string>): void {
  const list = c.array(root, 'progressEntries', 'progressEntries');
  if (!list) return;
  // id → krId of the `set` entries seen so far (a revert must point back to one of them)
  const seen = new Map<number, { krId: unknown; kind: unknown }>();
  list.forEach((item, i) => {
    const path = `progressEntries[${i}]`;
    if (!isRecord(item)) return void c.add(path, 'wrong_type', { expected: '对象' });
    const { id, krId, kind, revertsEntryId } = item;
    if (id === undefined) c.add(`${path}.id`, 'missing');
    else if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      c.add(`${path}.id`, 'invalid_entry_id');
    } else if (seen.has(id)) c.add(`${path}.id`, 'duplicate_entry');
    if (krId === undefined) c.add(`${path}.krId`, 'missing');
    else if (typeof krId !== 'string' || !krIds.has(krId))
      c.add(`${path}.krId`, 'unknown_key_result');
    if (kind === undefined) c.add(`${path}.kind`, 'missing');
    else if (kind !== 'set' && kind !== 'revert') c.add(`${path}.kind`, 'invalid_entry_kind');
    c.progress(item, 'value', `${path}.value`);
    c.status(item, 'status', `${path}.status`);
    c.timestamp(item, 'recordedAt', `${path}.recordedAt`);
    if (revertsEntryId === undefined) c.add(`${path}.revertsEntryId`, 'missing');
    else if (kind === 'revert') {
      const target = typeof revertsEntryId === 'number' ? seen.get(revertsEntryId) : undefined;
      if (!target || target.kind !== 'set' || target.krId !== krId) {
        c.add(`${path}.revertsEntryId`, 'unknown_entry');
      }
    } else if (revertsEntryId !== null) c.add(`${path}.revertsEntryId`, 'reverts_on_set');
    if (typeof id === 'number' && !seen.has(id)) seen.set(id, { krId, kind });
  });
}

function checkReview(c: Checker, root: Rec, krIds: Set<string>): void {
  if (root.review === undefined) return void c.add('review', 'missing');
  if (root.review === null) return;
  const review = c.record(root, 'review', 'review');
  if (!review) return;
  for (const key of ['wentWell', 'fellShort', 'nextSteps']) {
    c.text(review, key, `review.${key}`, { max: TEXT_LIMITS.reviewSection });
  }
  c.timestamp(review, 'savedAt', 'review.savedAt');
  c.timestamp(review, 'snapshotAt', 'review.snapshotAt');
  const snapshot = c.array(review, 'snapshot', 'review.snapshot');
  snapshot?.forEach((item, i) => {
    const path = `review.snapshot[${i}]`;
    if (!isRecord(item)) return void c.add(path, 'wrong_type', { expected: '对象' });
    if (typeof item.krId !== 'string' || !krIds.has(item.krId)) {
      c.add(`${path}.krId`, 'unknown_key_result');
    }
    c.text(item, 'statement', `${path}.statement`);
    c.text(item, 'successMetric', `${path}.successMetric`, { nullable: true });
    c.progress(item, 'progress', `${path}.progress`);
    c.status(item, 'status', `${path}.status`);
    c.boolean(item, 'removed', `${path}.removed`);
  });
}

/**
 * Validates one parsed JSON value against the single-OKR export format (schemaVersion 1).
 * Collects every problem; the reply carries the first one and the count of the rest (Q8-4).
 */
/** `okrNumber`: 1-based position in a backup, for the plain-language messages. */
export function validateOkrDocument(
  value: unknown,
  prefix = '',
  okrNumber?: number,
): ImportIssue[] {
  const c = new Checker();
  if (!isRecord(value)) {
    c.add(prefix, 'wrong_type', { expected: '对象' });
    return c.issues;
  }
  checkObjective(c, value);
  const krIds = checkKeyResults(c, value, okrNumber);
  checkProgressEntries(c, value, krIds);
  checkReview(c, value, krIds);
  if (!prefix) return c.issues;
  const head = parseLocation(prefix);
  return c.issues.map((i) => {
    const structured: StructuredImportIssue = {
      code: i.code,
      location: [...head, ...i.location],
      params: i.params,
    };
    return { ...structured, ...presentIssue(structured) };
  });
}

/** The dialog payload for an issue: today's `field` / `reason` text (S1§8.6). */
function invalidOf(i: ImportIssue, more: number): Extract<ImportProblem, { kind: 'invalid' }> {
  return { kind: 'invalid', field: i.field, reason: i.reason, more };
}

/** Bytes → document, or the problem to show (S1§8.6). Never throws. */
export function parseImportFile(bytes: Buffer): ParsedImport {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, problem: { kind: 'not_json' } };
  }
  if (!isRecord(value)) return { ok: false, problem: { kind: 'not_json' } };
  const version = value.schemaVersion;
  if (version === undefined) {
    return {
      ok: false,
      problem: invalidOf(issue('schemaVersion', 'missing'), 0),
    };
  }
  if (version !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      problem: { kind: 'unsupported_version', version: String(version).slice(0, 32) },
    };
  }
  if (value.kind === 'backup') return parseBackup(value);
  if (value.kind !== undefined) {
    return {
      ok: false,
      problem: invalidOf(issue('kind', 'unsupported_file_kind'), 0),
    };
  }
  const issues = validateOkrDocument(value);
  if (issues.length > 0) {
    const [first] = issues as [ImportIssue, ...ImportIssue[]];
    return {
      ok: false,
      problem: invalidOf(first, issues.length - 1),
    };
  }
  return { ok: true, documents: [value as unknown as ExportJsonDocument] };
}

/** #50: `{ schemaVersion: 1, kind: "backup", exportedAt, appVersion, okrs: [...] }`. */
function parseBackup(value: Rec): ParsedImport {
  const fail = (
    path: string,
    code: ImportIssueCode,
    params: ImportIssueParams = {},
  ): ParsedImport => ({ ok: false, problem: invalidOf(issue(path, code, params), 0) });
  if (!isTimestamp(value.exportedAt)) return fail('exportedAt', 'invalid_time');
  if (typeof value.appVersion !== 'string' || value.appVersion.length > 64) {
    return fail('appVersion', 'wrong_type', { expected: '字符串' });
  }
  if (!Array.isArray(value.okrs)) return fail('okrs', 'wrong_type', { expected: '数组' });
  if (value.okrs.length === 0) return { ok: false, problem: { kind: 'empty_backup' } };
  // The whole file is refused when any OKR is wrong (#50 AC4); the reply names the first one.
  for (const [index, okr] of value.okrs.entries()) {
    const issues = validateOkrDocument(okr, `okrs[${index}]`, index + 1);
    if (issues.length > 0) {
      const [first] = issues as [ImportIssue, ...ImportIssue[]];
      return {
        ok: false,
        problem: { ...invalidOf(first, issues.length - 1), okrIndex: index },
      };
    }
  }
  return {
    ok: true,
    documents: value.okrs as ExportJsonDocument[],
    backup: { exportedAt: value.exportedAt as string, appVersion: value.appVersion },
  };
}
