/**
 * #69 (prep): import validation problems as data — a code, where it is, and the values the
 * message needs. Every user-visible sentence is built in ISSUE_MESSAGES below, so the
 * plain-language copy (S1§8.6 / S1§9.4, still to be written) can replace it in one place.
 * The wording here is unchanged from before the refactor.
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

/** The only place the reasons are worded. */
export const ISSUE_MESSAGES: Record<ImportIssueCode, (p: ImportIssueParams) => string> = {
  missing: () => '缺失',
  wrong_type: (p) => `类型不对（应为${p.expected ?? ''}）`,
  empty: () => '不能为空',
  too_long: (p) => `超过 ${p.max} 字`,
  invalid_time: () => '不是有效的时间',
  invalid_status: () => '取值无效（应为 not_started / in_progress / at_risk / done）',
  not_integer: () => '不是整数',
  out_of_range: () => '超出 0–100',
  invalid_period: () => '格式不对（应为 2026-Q4）',
  no_key_results: () => '至少要有 1 个关键结果',
  too_many_key_results: (p) =>
    `${p.okrNumber === undefined ? '这个 OKR' : `第 ${p.okrNumber} 个 OKR`} 有 ${p.count} 个 KR，最多 ${p.limit} 个`,
  duplicate_key_result: () => '与前面的关键结果重复',
  invalid_entry_id: () => '应为正整数',
  duplicate_entry: () => '与前面的进度记录重复',
  unknown_key_result: () => '指向的关键结果不存在',
  invalid_entry_kind: () => '取值无效（应为 set / revert）',
  unknown_entry: () => '指向的进度记录不存在',
  reverts_on_set: () => '只有撤回记录可以填写',
  unsupported_file_kind: () => '取值无效（不支持的文件类型）',
};

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

/** The `field` / `reason` pair the dialog shows today (ImportProblem `invalid`). */
export function presentIssue(issue: StructuredImportIssue): { field: string; reason: string } {
  return {
    field: PLAIN.has(issue.code) ? '' : formatLocation(issue.location),
    reason: ISSUE_MESSAGES[issue.code](issue.params),
  };
}
