/**
 * Pure helpers for the progress UI: input validation (§3.5), the "latest update" sentence
 * (§3.6) and the quarter list (§3.2).
 */
import type { KrProgressInfo, KrStatus, Period } from '@clarityokr/contracts';

import { COPY, STATUS_LABEL, formatRelativeTime } from './copy';

export type ProgressInputResult =
  { ok: true; value: number | null } | { ok: false; message: string };

/**
 * Validates the text of the inline progress input on every keystroke. Empty means "clear".
 * Only ASCII digits count as digits: full-width digits, `50%`, `12a` are all rejected.
 */
export function validateProgressInput(text: string): ProgressInputResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (/^-\d+(\.\d+)?$/.test(trimmed)) return { ok: false, message: COPY.progressErrors.belowMin };
  if (/^\d+\.\d*$/.test(trimmed)) return { ok: false, message: COPY.progressErrors.decimal };
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (value > 100) return { ok: false, message: COPY.progressErrors.aboveMax };
    return { ok: true, value };
  }
  return { ok: false, message: COPY.progressErrors.notNumber };
}

/** Result of the ↑/↓ keys in the inline input: clamps to 0..100 and starts from 0 when empty. */
export function stepProgressText(text: string, delta: number): string {
  const parsed = validateProgressInput(text);
  const base = parsed.ok && parsed.value !== null ? parsed.value : 0;
  return String(Math.min(100, Math.max(0, base + delta)));
}

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export interface UpdateLine {
  kind: 'set' | 'revert';
  text: string;
}

/** The sentence of the "latest update" row; null when the key result has no entry yet. */
export function describeLatestUpdate(
  info: KrProgressInfo,
  now: Date = new Date(),
): UpdateLine | null {
  const { latest, before } = info;
  if (!latest) return null;
  const time = formatRelativeTime(latest.recordedAt, now);
  if (latest.kind === 'revert') {
    const value = latest.value === null ? '—' : `${latest.value}%`;
    return {
      kind: 'revert',
      text: `已撤回上一次更新，进度恢复为 ${value}，状态恢复为${STATUS_LABEL[latest.status]} · ${time}`,
    };
  }
  const valueChanged = !before || before.value !== latest.value;
  const statusChanged = !!before && before.status !== latest.status;
  let body: string;
  if (valueChanged && statusChanged && before) {
    body = `${percent(before.value)} → ${percent(latest.value)}，${STATUS_LABEL[before.status]} → ${STATUS_LABEL[latest.status]}`;
  } else if (statusChanged && before) {
    body = `状态 ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[latest.status]}`;
  } else {
    body = `${percent(before ? before.value : null)} → ${percent(latest.value)}`;
  }
  return { kind: 'set', text: `最近更新 ${body} · ${time}` };
}

export interface QuarterOption {
  /** `null` is the "not set" entry. */
  value: Period | null;
  label: string;
}

/** Quarter of `now` as `[year, quarter]`. */
export function quarterOf(now: Date): [number, number] {
  return [now.getFullYear(), Math.floor(now.getMonth() / 3) + 1];
}

export function formatPeriod(year: number, quarter: number): Period {
  return `${year}-Q${quarter}` as Period;
}

/**
 * "Not set" + the four quarters before, the current one and the four after (10 entries).
 * A stored period outside that window is shown first so it is never lost (§3.2, open item O6).
 */
export function quarterOptions(now: Date, stored: Period | null): QuarterOption[] {
  const [year, quarter] = quarterOf(now);
  const base = year * 4 + (quarter - 1);
  const options: QuarterOption[] = [{ value: null, label: COPY.period.noneOption }];
  for (let offset = -4; offset <= 4; offset += 1) {
    const index = base + offset;
    const period = formatPeriod(Math.floor(index / 4), (index % 4) + 1);
    options.push({
      value: period,
      label: offset === 0 ? `${period}（${COPY.period.current}）` : period,
    });
  }
  if (stored !== null && !options.some((option) => option.value === stored)) {
    options.unshift({ value: stored, label: stored });
  }
  return options;
}

export function isDoneButNot100(status: KrStatus, progress: number | null): boolean {
  return status === 'done' && progress !== 100;
}
