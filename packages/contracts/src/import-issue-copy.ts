/**
 * #69 — THE copy file for import errors (writer drops text in here; shared by main and renderer).
 *
 * #69 (prep): import validation problems as data — a code, where it is, and the values the
 * message needs. Every user-visible sentence is built in ISSUE_MESSAGES below, so the
 * plain-language copy (S1§8.6 / S1§9.4, still to be written) can replace it in one place.
 * The sentences are the writer's copy (comment.md, designer-approved 2026-10-16), no JSON keys,
 * 1-based places; B4 keeps its settled sentence. `formatLocation` (English path) is
 * for logs and tests only.
 */

export type ImportIssueCode =
  | 'missing'
  | 'wrong_type'
  | 'empty'
  | 'too_long'
  | 'invalid_time'
  | 'invalid_status'
  | 'not_integer'
  | 'out_of_range'
  | 'invalid_period'
  | 'no_key_results'
  | 'too_many_key_results'
  | 'duplicate_key_result'
  | 'invalid_entry_id'
  | 'duplicate_entry'
  | 'unknown_key_result'
  | 'invalid_entry_kind'
  | 'unknown_entry'
  | 'reverts_on_set'
  | 'unsupported_file_kind';

/** JSON location: keys and array indexes from the file root, e.g. `['keyResults', 2, 'progress']`. */
export type ImportIssueLocation = ReadonlyArray<string | number>;

export interface ImportIssueParams {
  /** wrong_type: what the value should be (Chinese noun, e.g. 「对象」). */
  expected?: string;
  /** too_long: the character limit. */
  max?: number;
  /** too_many_key_results: active KRs found, the cap, and the OKR's 1-based place in a backup. */
  count?: number;
  limit?: number;
  okrNumber?: number;
}

export interface StructuredImportIssue {
  code: ImportIssueCode;
  location: ImportIssueLocation;
  params: ImportIssueParams;
}

/**
 * Reasons, appended right after the place (no 「的」). Writer's copy (comment.md, approved by the
 * designer 2026-10-16 with 「关键结果」 everywhere; B4 keeps 「KR」).
 */
export const ISSUE_MESSAGES: Record<ImportIssueCode, (p: ImportIssueParams) => string> = {
  missing: () => '不见了',
  wrong_type: () => '格式不对',
  empty: () => '是空的',
  too_long: (p) => `超过 ${p.max} 字`,
  invalid_time: () => '不是有效的时间',
  invalid_status: () => '不是可选的状态',
  not_integer: () => '带了小数',
  out_of_range: () => '超出 0 到 100',
  invalid_period: () => '应写成 2026-Q4 这样的格式',
  no_key_results: () => '一个关键结果也没有',
  // B4: unchanged sentence (settled 2026-10-15, N50)
  too_many_key_results: (p) =>
    `${p.okrNumber === undefined ? '这个 OKR' : `第 ${p.okrNumber} 个 OKR`} 有 ${p.count} 个 KR，最多 ${p.limit} 个`,
  duplicate_key_result: () => '和前面的重复',
  invalid_entry_id: () => '不对',
  duplicate_entry: () => '和前面的重复',
  unknown_key_result: () => '找不到',
  invalid_entry_kind: () => '不是可选的类型',
  unknown_entry: () => '要撤回的记录找不到',
  reverts_on_set: () => '不是撤回，却填了撤回的记录',
  unsupported_file_kind: () => '不支持这种文件类型',
};

/** Shown as their own sentence, no place (B4). */
const PLAIN: ReadonlySet<ImportIssueCode> = new Set(['too_many_key_results']);

/** Codes whose sentence names the item, not the field (「第 2 条进度记录要撤回的记录找不到」). */
const ITEM_LEVEL: ReadonlySet<ImportIssueCode> = new Set([
  'unknown_entry',
  'reverts_on_set',
  'no_key_results',
]);

/** File-level problems: one sentence, no place (same for both imports). `code:key`. */
const FILE_LEVEL: Readonly<Record<string, string>> = {
  'missing:schemaVersion': '文件里缺少版本信息',
  'unsupported_file_kind:kind': '不支持这种文件类型',
  'invalid_time:exportedAt': '备份时间读不出来',
  'wrong_type:appVersion': '软件版本信息不对',
  'wrong_type:okrs': '备份里找不到 OKR 列表',
};

/** A code this build does not know (a newer validator, a bug). Whole sentence, no place. */
export const FALLBACK_REASON = '有一处内容读不懂，文件可能被改过';

/**
 * Field names. Keys are `container.field` (containers: objective, review, keyResults,
 * progressEntries, snapshot) or a bare top-level key. Objective / review fields are named in
 * full (「目标标题」, 「复盘保存时间」), not chained with 「的」.
 */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  objective: '目标',
  'objective.title': '目标标题',
  'objective.period': '周期',
  'objective.pinned': '置顶设置',
  'objective.createdAt': '创建时间',
  'objective.updatedAt': '修改时间',
  keyResults: '关键结果',
  'keyResults.id': '编号',
  'keyResults.statement': '描述',
  'keyResults.successMetric': '衡量标准',
  'keyResults.progress': '进度',
  'keyResults.status': '状态',
  'keyResults.removedAt': '移除时间',
  progressEntries: '进度记录',
  'progressEntries.id': '编号',
  'progressEntries.krId': '所属关键结果',
  'progressEntries.kind': '记录类型',
  'progressEntries.value': '进度值',
  'progressEntries.status': '状态',
  'progressEntries.recordedAt': '记录时间',
  'progressEntries.revertsEntryId': '撤回的记录',
  review: '复盘',
  'review.wentWell': '做得好',
  'review.fellShort': '没做到',
  'review.nextSteps': '下一步',
  'review.savedAt': '复盘保存时间',
  'review.snapshotAt': '复盘快照时间',
  'review.snapshot': '复盘快照',
  'snapshot.krId': '所属关键结果',
  'snapshot.statement': '描述',
  'snapshot.successMetric': '衡量标准',
  'snapshot.progress': '进度',
  'snapshot.status': '状态',
  'snapshot.removed': '移除标记',
};

/** Item names for array entries; numbers are 1-based (`keyResults[2]` → 「第 3 个关键结果」). */
const ITEM_NAMES: Readonly<Record<string, (n: number) => string>> = {
  okrs: (n) => `第 ${n} 个 OKR`,
  keyResults: (n) => `第 ${n} 个关键结果`,
  progressEntries: (n) => `第 ${n} 条进度记录`,
  snapshot: (n) => `复盘快照的第 ${n} 个关键结果`,
};

/** Structured, 1-based description of where an issue is. */
export interface IssuePlace {
  /** e.g. `{ list: 'keyResults', number: 3 }` or `{ field: 'progress', container: 'keyResults' }`. */
  parts: ReadonlyArray<{ list: string; number: number } | { field: string; container: string }>;
}

export function placeOf(location: ImportIssueLocation): IssuePlace {
  const parts: Array<{ list: string; number: number } | { field: string; container: string }> = [];
  let container = '';
  location.forEach((part, i) => {
    if (typeof part === 'number') return;
    const next = location[i + 1];
    if (typeof next === 'number') {
      parts.push({ list: part, number: next + 1 });
      container = part;
    } else if (i < location.length - 1 && (part === 'objective' || part === 'review')) {
      container = part; // named in full by the field label, not chained
    } else {
      parts.push({ field: part, container });
      container = part;
    }
  });
  return { parts };
}

/** Chains with 「的」; a space after a Latin word (「第 4 个 OKR 的…」). */
function chain(a: string, b: string): string {
  if (a === '') return b;
  return `${a}${/[A-Za-z]$/.test(a) ? ' ' : ''}的${b}`;
}

/** 「第 3 个关键结果的进度」; '' for the file root. */
export function describePlace(location: ImportIssueLocation): string {
  return placeOf(location).parts.reduce((acc, p) => {
    const name =
      'list' in p
        ? (ITEM_NAMES[p.list]?.(p.number) ?? `第 ${p.number} 项`)
        : (FIELD_LABELS[`${p.container}.${p.field}`] ?? FIELD_LABELS[p.field] ?? '某一项');
    return chain(acc, name);
  }, '');
}

/** Place + reason, no 「的」 between; a space after a Latin word. */
function join(place: string, reason: string): string {
  return place === '' ? reason : `${place}${/[A-Za-z]$/.test(place) ? ' ' : ''}${reason}`;
}

/** `['keyResults', 2, 'progress']` → `keyResults[2].progress`; the root is `(根)`. */
export function formatLocation(location: ImportIssueLocation): string {
  if (location.length === 0) return '(根)';
  return location
    .map((part, i) => (typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`))
    .join('');
}

/** `keyResults[2].progress` → `['keyResults', 2, 'progress']`. */
export function parseLocation(path: string): ImportIssueLocation {
  if (path === '' || path === '(根)') return [];
  const parts: Array<string | number> = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    parts.push(m[2] !== undefined ? Number(m[2]) : (m[1] as string));
  }
  return parts;
}

/**
 * The `field` / `reason` pair for the dialog. #69: `field` is always empty (no paths on screen);
 * `reason` is one plain sentence. B4 keeps its settled sentence as is.
 */
export function presentIssue(issue: StructuredImportIssue): { field: string; reason: string } {
  const message = ISSUE_MESSAGES[issue.code as ImportIssueCode] as
    ((p: ImportIssueParams) => string) | undefined;
  if (!message) return { field: '', reason: FALLBACK_REASON };
  if (PLAIN.has(issue.code)) return { field: '', reason: message(issue.params) };
  const loc = issue.location;
  if (loc.length === 1 && typeof loc[0] === 'string') {
    const fileLevel = FILE_LEVEL[`${issue.code}:${loc[0]}`];
    if (fileLevel) return { field: '', reason: fileLevel };
  }
  const where = ITEM_LEVEL.has(issue.code)
    ? typeof loc[loc.length - 1] === 'string'
      ? loc.slice(0, -1)
      : loc
    : loc;
  return { field: '', reason: join(describePlace(where), message(issue.params)) };
}

/** Dialog layout and the remaining 【缺·文案】 placeholder (S1§8.6 v3.2). */
export const IMPORT_ISSUE_UI = {
  /** Detail area: at most this many lines; the rest merge into the last line. */
  maxLines: 5,
  /** Merged line (writer: 「另有 n 处」 / 「另有 99+ 处」 from 100). */
  moreLine: (n: number) => `另有 ${n >= 100 ? '99+' : n} 处`,
  /** 【缺·文案】PLACEHOLDER — the writer has not given the single-OKR body sentence (N49). */
  singleBody: '【缺·文案】这个文件里有内容不对，没有导入。',
} as const;

/** The issues that come with an `invalid` reply (first ones only; `total` counts all). */
export const MAX_REPORTED_ISSUES = 5;

/**
 * Detail lines for the dialog: up to 5; when there are more, 4 issues and 「另有 n 处」.
 */
export function issueLines(issues: ReadonlyArray<StructuredImportIssue>, total: number): string[] {
  const max = IMPORT_ISSUE_UI.maxLines;
  if (total <= max) return issues.slice(0, total).map((i) => presentIssue(i).reason);
  const shown = issues.slice(0, max - 1).map((i) => presentIssue(i).reason);
  return [...shown, IMPORT_ISSUE_UI.moreLine(total - shown.length)];
}
