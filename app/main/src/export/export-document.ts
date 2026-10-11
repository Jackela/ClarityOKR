import type {
  KeyResultRecord,
  KrStatus,
  ObjectiveWithKeyResults,
  ProgressEntryRecord,
  ReviewRecord,
} from '@clarityokr/contracts';

export const EXPORT_SCHEMA_VERSION = 1;

/** Everything an export needs, read from the database in one pass. */
export interface ExportSource {
  objective: ObjectiveWithKeyResults;
  /** Every progress entry of every key result (removed ones included), oldest first per key result. */
  progressEntries: ProgressEntryRecord[];
  review: ReviewRecord | null;
}

/** The JSON data file. Field set and order are fixed (design spec §6.2a). */
export interface ExportJsonDocument {
  schemaVersion: 1;
  exportedAt: string;
  objective: {
    title: string;
    period: string | null;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  };
  keyResults: Array<{
    id: string;
    statement: string;
    successMetric: string | null;
    progress: number | null;
    status: KrStatus;
    removedAt: string | null;
  }>;
  progressEntries: Array<{
    id: number;
    krId: string;
    kind: 'set' | 'revert';
    value: number | null;
    status: KrStatus;
    revertsEntryId: number | null;
    recordedAt: string;
  }>;
  review: null | {
    wentWell: string;
    fellShort: string;
    nextSteps: string;
    snapshot: Array<{
      krId: string;
      statement: string;
      successMetric: string | null;
      progress: number | null;
      status: KrStatus;
      removed: boolean;
    }>;
    savedAt: string;
    snapshotAt: string;
  };
}

export const STATUS_LABELS: Record<KrStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  at_risk: '有风险',
  done: '已完成',
};

export function buildJsonDocument(source: ExportSource, exportedAt: Date): ExportJsonDocument {
  const { objective, review } = source;
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    objective: {
      title: objective.title,
      period: objective.period,
      pinned: objective.pinned,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    },
    keyResults: objective.keyResults.map((kr) => ({
      id: kr.id,
      statement: kr.statement,
      successMetric: kr.successMetric,
      progress: kr.progress,
      status: kr.status,
      removedAt: kr.removedAt,
    })),
    progressEntries: source.progressEntries.map((entry) => ({
      id: entry.id,
      krId: entry.krId,
      kind: entry.kind,
      value: entry.value,
      status: entry.status,
      revertsEntryId: entry.revertsEntryId,
      recordedAt: entry.recordedAt,
    })),
    review: review
      ? {
          wentWell: review.wentWell,
          fellShort: review.fellShort,
          nextSteps: review.nextSteps,
          snapshot: review.snapshot.map((item) => ({
            krId: item.krId,
            statement: item.statement,
            successMetric: item.successMetric,
            progress: item.progress,
            status: item.status,
            removed: item.removed,
          })),
          savedAt: review.savedAt,
          snapshotAt: review.snapshotAt,
        }
      : null,
  };
}

export function renderJson(source: ExportSource, exportedAt: Date): string {
  return `${JSON.stringify(buildJsonDocument(source, exportedAt), null, 2)}\n`;
}

function progressText(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** Single-line text for headings and list lead-ins. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Multi-line text inside a list item: continuation lines are indented under the bullet. */
function indented(text: string, indent: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join('\n');
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function activeKrLines(krs: KeyResultRecord[]): string[] {
  const lines: string[] = [];
  krs.forEach((kr, index) => {
    lines.push(`${index + 1}. ${indented(kr.statement, '   ')}`);
    lines.push(`   - 进度：${progressText(kr.progress)}`);
    lines.push(`   - 状态：${STATUS_LABELS[kr.status]}`);
    lines.push(`   - 度量：${kr.successMetric ? indented(kr.successMetric, '     ') : '未设置'}`);
  });
  return lines;
}

/** The Markdown reading copy (Chinese headings). It carries no progress entries or snapshot detail. */
export function renderMarkdown(source: ExportSource): string {
  const { objective, review } = source;
  const active = objective.keyResults.filter((kr) => kr.removedAt === null);
  const removed = objective.keyResults.filter((kr) => kr.removedAt !== null);

  const lines: string[] = [];
  lines.push(`# ${oneLine(objective.title)}`);
  lines.push('');
  lines.push(`- 周期：${objective.period ?? '未设置'}`);
  lines.push(`- 整体进度：${progressText(objective.overallProgress)}`);
  lines.push('');
  lines.push('## 关键结果');
  lines.push('');
  if (active.length === 0) {
    lines.push('（没有关键结果）');
  } else {
    lines.push(...activeKrLines(active));
  }

  if (removed.length > 0) {
    lines.push('');
    lines.push('## 已移除的关键结果');
    lines.push('');
    lines.push('以下关键结果已被移除，不计入整体进度。');
    lines.push('');
    removed.forEach((kr, index) => {
      lines.push(`${index + 1}. ${indented(kr.statement, '   ')}`);
      lines.push(`   - 已移除：${dayOf(kr.removedAt as string)}`);
      lines.push(`   - 最后进度：${progressText(kr.progress)}，${STATUS_LABELS[kr.status]}`);
      lines.push(`   - 度量：${kr.successMetric ? indented(kr.successMetric, '     ') : '未设置'}`);
    });
  }

  if (review) {
    const section = (title: string, text: string): void => {
      lines.push('');
      lines.push(`### ${title}`);
      lines.push('');
      lines.push(text.trim().length > 0 ? text : '（未填写）');
    };
    lines.push('');
    lines.push('## 复盘');
    section('做得好', review.wentWell);
    section('没做到', review.fellShort);
    section('下一步', review.nextSteps);
  }

  return `${lines.join('\n')}\n`;
}
