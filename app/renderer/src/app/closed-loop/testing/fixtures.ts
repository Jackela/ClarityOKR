/**
 * Plain data builders for closed-loop renderer tests. No test-framework imports: the file is
 * part of the app compilation unit but nothing imports it from app code.
 */
import type {
  KeyResultRecord,
  KrProgressInfo,
  KrStatus,
  OkrDetail,
  OkrListItem,
  ProgressChangeReply,
  ProgressEntryRecord,
} from '@clarityokr/contracts';

export const T0 = '2026-10-09T08:00:00.000Z';

export function makeKr(overrides: Partial<KeyResultRecord> = {}): KeyResultRecord {
  return {
    id: 'kr-1',
    objectiveId: 'okr-1',
    position: 0,
    statement: '把迭代周期缩短到 3 周',
    successMetric: null,
    progress: null,
    status: 'not_started',
    removedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<ProgressEntryRecord> = {}): ProgressEntryRecord {
  return {
    id: 1,
    krId: 'kr-1',
    kind: 'set',
    value: 65,
    status: 'in_progress',
    revertsEntryId: null,
    recordedAt: T0,
    ...overrides,
  };
}

export function makeInfo(overrides: Partial<KrProgressInfo> = {}): KrProgressInfo {
  return { latest: null, before: null, canRevert: false, ...overrides } as KrProgressInfo;
}

export function makeDetail(
  krs: KeyResultRecord[] = [makeKr()],
  overrides: Partial<OkrDetail['objective']> = {},
): OkrDetail {
  const active = krs.filter((kr) => kr.removedAt === null && kr.progress !== null);
  const overall = active.length
    ? Math.round(active.reduce((sum, kr) => sum + (kr.progress ?? 0), 0) / active.length)
    : null;
  return {
    objective: {
      id: 'okr-1',
      title: '提升团队交付节奏',
      period: null,
      pinned: true,
      sourceSessionId: 'session-1',
      createdAt: T0,
      updatedAt: T0,
      keyResults: krs,
      overallProgress: overall,
      ...overrides,
    },
    progress: Object.fromEntries(krs.map((kr) => [kr.id, makeInfo()])),
    review: null,
  };
}

export function makeListItem(overrides: Partial<OkrListItem> = {}): OkrListItem {
  return {
    id: 'okr-1',
    title: '提升团队交付节奏',
    period: null,
    pinned: false,
    createdAt: T0,
    updatedAt: T0,
    overallProgress: null,
    keyResultCount: 2,
    filledKeyResultCount: 0,
    allDone: false,
    reviewed: false,
    ...overrides,
  };
}

export function makeChange(
  kr: KeyResultRecord,
  info: Partial<KrProgressInfo> = {},
  changed = true,
  overallProgress: number | null = kr.progress,
): ProgressChangeReply {
  return { changed, keyResult: kr, overallProgress, progress: makeInfo(info) };
}

export const STATUSES: readonly KrStatus[] = ['not_started', 'in_progress', 'at_risk', 'done'];
