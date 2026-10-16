/**
 * #69 (prep): import validation problems as data — a code, where it is, and the values the
 * message needs. Every user-visible sentence is built in ISSUE_MESSAGES below, so the
 * plain-language copy (S1§8.6 / S1§9.4, still to be written) can replace it in one place.
 * The sentences are DRAFT plain-language copy (no JSON keys, 1-based places) for the
 * writer/designer to replace; B4 keeps its settled sentence. `formatLocation` (English path) is
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
 * The only place the reasons are worded. Plain Chinese with no JSON keys or enum values (#69).
 * DRAFT copy for the writer/designer to replace (S1§8.6 / S1§9.4 not written yet).
 */
export const ISSUE_MESSAGES: Record<ImportIssueCode, (p: ImportIssueParams) => string> = {
  missing: () => '缺失',
  wrong_type: (p) => `类型不对（应为${p.expected ?? '其他类型'}）`,
  empty: () => '不能为空',
  too_long: (p) => `超过 ${p.max} 字`,
  invalid_time: () => '不是有效的时间',
  invalid_status: () => '不是有效的状态（应为未开始、进行中、有风险或已完成）',
  not_integer: () => '不是整数',
  out_of_range: () => '超出 0–100',
  invalid_period: () => '格式不对（应为年份加季度，例如 2026 年第 4 季度写作 2026-Q4）',
  no_key_results: () => '至少要有 1 个关键结果',
  // B4: unchanged sentence (settled 2026-10-15)
  too_many_key_results: (p) =>
    `${p.okrNumber === undefined ? '这个 OKR' : `第 ${p.okrNumber} 个 OKR`} 有 ${p.count} 个 KR，最多 ${p.limit} 个`,
  duplicate_key_result: () => '与前面的关键结果重复',
  invalid_entry_id: () => '编号应为正整数',
  duplicate_entry: () => '与前面的进度记录重复',
  unknown_key_result: () => '指向的关键结果不存在',
  invalid_entry_kind: () => '不是有效的记录类型（应为更新或撤回）',
  unknown_entry: () => '指向的进度记录不存在',
  reverts_on_set: () => '只有撤回记录可以指向被撤回的记录',
  unsupported_file_kind: () => '不是 ClarityOKR 能导入的文件类型',
};

/** Text for a code this build does not know (a newer validator, a bug). DRAFT copy. */
export const FALLBACK_REASON = '有一处内容不对';

/** Leaf keys → plain names. DRAFT copy (designer decides the final phrasing). */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  objective: '目标',
  title: '名称',
  period: '季度',
  pinned: '置顶设置',
  createdAt: '创建时间',
  updatedAt: '修改时间',
  keyResults: '关键结果',
  id: '编号',
  statement: '内容',
  successMetric: '度量',
  progress: '进度',
  status: '状态',
  removedAt: '移除时间',
  progressEntries: '进度记录',
  krId: '所属关键结果',
  kind: '类型',
  value: '进度',
  recordedAt: '记录时间',
  revertsEntryId: '撤回的记录',
  review: '复盘',
  wentWell: '「做得好」',
  fellShort: '「没做到」',
  nextSteps: '「下一步」',
  savedAt: '保存时间',
  snapshotAt: '快照时间',
  snapshot: '复盘快照',
  removed: '是否已移除',
  schemaVersion: '文件版本',
  exportedAt: '备份时间',
  appVersion: '应用版本',
  okrs: 'OKR 列表',
};

/** Item names for array entries; numbers are 1-based (`keyResults[2]` → 「第 3 个关键结果」). */
const ITEM_NAMES: Readonly<Record<string, (n: number) => string>> = {
  okrs: (n) => `第 ${n} 个 OKR`,
  keyResults: (n) => `第 ${n} 个关键结果`,
  progressEntries: (n) => `第 ${n} 条进度记录`,
  snapshot: (n) => `复盘快照的第 ${n} 项`,
};

/** Structured, 1-based description of where an issue is (for the designer's final phrasing). */
export interface IssuePlace {
  /** e.g. `{ list: 'keyResults', number: 3 }` or `{ field: 'progress' }`. */
  parts: ReadonlyArray<{ list: string; number: number } | { field: string }>;
}

export function placeOf(location: ImportIssueLocation): IssuePlace {
  const parts: Array<{ list: string; number: number } | { field: string }> = [];
  location.forEach((part, i) => {
    if (typeof part === 'number') return;
    const next = location[i + 1];
    if (typeof next === 'number') parts.push({ list: part, number: next + 1 });
    else parts.push({ field: part });
  });
  return { parts };
}

/** 「第 3 个关键结果的进度」; the file root is 「文件」. DRAFT copy. */
export function describePlace(location: ImportIssueLocation): string {
  const { parts } = placeOf(location);
  if (parts.length === 0) return '文件';
  return parts
    .map((p) =>
      'list' in p
        ? (ITEM_NAMES[p.list]?.(p.number) ?? `${FIELD_LABELS[p.list] ?? '内容'}的第 ${p.number} 项`)
        : (FIELD_LABELS[p.field] ?? '某一项'),
    )
    .join('的');
}

/**
 * Issues shown without a field path (plain sentence, B4). Today only the KR cap; #69 will
 * move the rest here once the copy exists.
 */
const PLAIN: ReadonlySet<ImportIssueCode> = new Set(['too_many_key_results']);

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
  if (!message) return { field: '', reason: `${describePlace(issue.location)}${FALLBACK_REASON}` };
  const reason = message(issue.params);
  if (PLAIN.has(issue.code)) return { field: '', reason };
  return { field: '', reason: `${describePlace(issue.location)}${reason}` };
}
