import {
  TEXT_LIMITS,
  checkText,
  isKrStatus,
  isPeriod,
  type ImportProblem,
} from '@clarityokr/contracts';

import { EXPORT_SCHEMA_VERSION, type ExportJsonDocument } from '../export/export-document.js';

/** One validation problem: the JSON path (English keys, as in the file) and a Chinese reason. */
export interface ImportIssue {
  field: string;
  reason: string;
}

export type ParsedImport = { ok: true; document: ExportJsonDocument } | { ok: false; problem: ImportProblem };

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ISO 8601 timestamps as the app writes them; anything `Date` cannot read is rejected. */
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value));

class Checker {
  readonly issues: ImportIssue[] = [];

  add(field: string, reason: string): void {
    this.issues.push({ field, reason });
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
      this.add(path, '不能为空');
      return undefined;
    }
    if (opts.max !== undefined && !checkText(value, opts.max).ok) {
      this.add(path, `超过 ${opts.max} 字`);
      return undefined;
    }
    return value;
  }

  timestamp(parent: Rec, key: string, path: string, nullable = false): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (value === null && nullable) return;
    if (!isTimestamp(value)) this.add(path, '不是有效的时间');
  }

  boolean(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (typeof value !== 'boolean') this.wrong(path, '布尔值');
  }

  status(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (!isKrStatus(value)) this.add(path, '取值无效（应为 not_started / in_progress / at_risk / done）');
  }

  progress(parent: Rec, key: string, path: string): void {
    const value = parent[key];
    if (value === undefined) return void this.missing(path);
    if (value === null) return;
    if (typeof value !== 'number') return void this.wrong(path, '数字或 null');
    if (!Number.isInteger(value)) return void this.add(path, '不是整数');
    if (value < 0 || value > 100) this.add(path, '超出 0–100');
  }

  private missing(path: string): null {
    this.add(path, '缺失');
    return null;
  }

  private wrong(path: string, expected: string): null {
    this.add(path, `类型不对（应为${expected}）`);
    return null;
  }
}

function checkObjective(c: Checker, root: Rec): void {
  const objective = c.record(root, 'objective', 'objective');
  if (!objective) return;
  c.text(objective, 'title', 'objective.title', { max: TEXT_LIMITS.objective, nonEmpty: true });
  const period = objective.period;
  if (period === undefined) c.add('objective.period', '缺失');
  else if (period !== null && !isPeriod(period)) c.add('objective.period', '格式不对（应为 2026-Q4）');
  c.boolean(objective, 'pinned', 'objective.pinned');
  c.timestamp(objective, 'createdAt', 'objective.createdAt');
  c.timestamp(objective, 'updatedAt', 'objective.updatedAt');
}

/** Returns the ids of the well-formed key results (for reference checks). */
function checkKeyResults(c: Checker, root: Rec): Set<string> {
  const ids = new Set<string>();
  const list = c.array(root, 'keyResults', 'keyResults');
  if (!list) return ids;
  if (list.length === 0) c.add('keyResults', '至少要有 1 个关键结果');
  list.forEach((item, i) => {
    const path = `keyResults[${i}]`;
    if (!isRecord(item)) return void c.add(path, '类型不对（应为对象）');
    const id = c.text(item, 'id', `${path}.id`, { max: 200, nonEmpty: true });
    if (typeof id === 'string') {
      if (ids.has(id)) c.add(`${path}.id`, '与前面的关键结果重复');
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
    if (!isRecord(item)) return void c.add(path, '类型不对（应为对象）');
    const { id, krId, kind, revertsEntryId } = item;
    if (id === undefined) c.add(`${path}.id`, '缺失');
    else if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      c.add(`${path}.id`, '应为正整数');
    } else if (seen.has(id)) c.add(`${path}.id`, '与前面的进度记录重复');
    if (krId === undefined) c.add(`${path}.krId`, '缺失');
    else if (typeof krId !== 'string' || !krIds.has(krId)) c.add(`${path}.krId`, '指向的关键结果不存在');
    if (kind === undefined) c.add(`${path}.kind`, '缺失');
    else if (kind !== 'set' && kind !== 'revert') c.add(`${path}.kind`, '取值无效（应为 set / revert）');
    c.progress(item, 'value', `${path}.value`);
    c.status(item, 'status', `${path}.status`);
    c.timestamp(item, 'recordedAt', `${path}.recordedAt`);
    if (revertsEntryId === undefined) c.add(`${path}.revertsEntryId`, '缺失');
    else if (kind === 'revert') {
      const target = typeof revertsEntryId === 'number' ? seen.get(revertsEntryId) : undefined;
      if (!target || target.kind !== 'set' || target.krId !== krId) {
        c.add(`${path}.revertsEntryId`, '指向的进度记录不存在');
      }
    } else if (revertsEntryId !== null) c.add(`${path}.revertsEntryId`, '只有撤回记录可以填写');
    if (typeof id === 'number' && !seen.has(id)) seen.set(id, { krId, kind });
  });
}

function checkReview(c: Checker, root: Rec, krIds: Set<string>): void {
  if (root.review === undefined) return void c.add('review', '缺失');
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
    if (!isRecord(item)) return void c.add(path, '类型不对（应为对象）');
    if (typeof item.krId !== 'string' || !krIds.has(item.krId)) {
      c.add(`${path}.krId`, '指向的关键结果不存在');
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
export function validateOkrDocument(value: unknown, prefix = ''): ImportIssue[] {
  const c = new Checker();
  if (!isRecord(value)) {
    c.add(prefix || '(根)', '类型不对（应为对象）');
    return c.issues;
  }
  checkObjective(c, value);
  const krIds = checkKeyResults(c, value);
  checkProgressEntries(c, value, krIds);
  checkReview(c, value, krIds);
  return prefix ? c.issues.map((i) => ({ ...i, field: `${prefix}.${i.field}` })) : c.issues;
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
    return { ok: false, problem: { kind: 'invalid', field: 'schemaVersion', reason: '缺失', more: 0 } };
  }
  if (version !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      problem: { kind: 'unsupported_version', version: String(version).slice(0, 32) },
    };
  }
  if (value.kind !== undefined) {
    // Backups (`kind: "backup"`) arrive with #50.
    return {
      ok: false,
      problem: { kind: 'invalid', field: 'kind', reason: '取值无效（不支持的文件类型）', more: 0 },
    };
  }
  const issues = validateOkrDocument(value);
  if (issues.length > 0) {
    const [first] = issues as [ImportIssue, ...ImportIssue[]];
    return {
      ok: false,
      problem: { kind: 'invalid', field: first.field, reason: first.reason, more: issues.length - 1 },
    };
  }
  return { ok: true, document: value as unknown as ExportJsonDocument };
}
