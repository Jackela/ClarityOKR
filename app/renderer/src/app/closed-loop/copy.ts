/**
 * zh-CN copy for the closed-loop UI (spec v2.7 §3.13, §4.8). Kept in one module so the wording
 * can be checked against the design spec in one place; interpolated strings are functions.
 */
import type { KrStatus } from '@clarityokr/contracts';

export const STATUS_LABEL: Record<KrStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  at_risk: '有风险',
  done: '已完成',
};

export const STATUS_ICON: Record<KrStatus, string> = {
  not_started: '○',
  in_progress: '◐',
  at_risk: '△',
  done: '✓',
};

export const STATUS_ORDER: readonly KrStatus[] = ['not_started', 'in_progress', 'at_risk', 'done'];

export const COPY = {
  edit: { action: '编辑文字' },
  addShort: '添加',
  tabs: { note: '便签', history: '历史', tablistLabel: '页面切换' },
  overall: {
    label: '整体进度',
    none: '还没有填写进度',
    summary: (total: number, filled: number) => `${total} 个关键结果中 ${filled} 个已填写进度`,
    barLabel: '整体进度',
    valueText: (value: number | null) => (value === null ? '整体进度未填写' : `整体进度 ${value}%`),
  },
  period: {
    none: '不设置周期',
    noneOption: '不设置',
    current: '当前季度',
    label: '周期',
    set: (period: string) => `周期已设为 ${period}。`,
    cleared: '已取消周期。',
    failed: '没能保存周期，请重试。',
  },
  pin: {
    notPinned: '这不是置顶便签。',
    action: '设为置顶便签',
    done: '已设为置顶便签，下次打开会先显示这一条。',
    failed: '没能设为置顶便签，请重试。',
    retry: '重试',
  },
  kr: {
    heading: (count: number) => `关键结果 ${count}`,
    metricPrefix: '度量：',
    addMetric: '添加度量',
    addMetricLabel: (n: number) => `添加度量，关键结果 ${n}`,
    removedHeading: (count: number) => `已移除的关键结果（${count}）`,
    removedNote: '已移除的关键结果不计入整体进度。',
    removedTag: (date: string) => `已移除 · ${date}`,
    lastProgress: (value: number | null, status: string) =>
      `最后进度 ${value === null ? '—' : `${value}%`} · ${status}`,
    empty: '还没有关键结果',
    notFilled: '—',
    notFilledSpoken: '未填写',
    editValueLabel: (n: number, value: number | null) =>
      `编辑进度，关键结果 ${n}，当前${value === null ? '未填写' : ` ${value}%`}`,
    inputLabel: (n: number) => `关键结果 ${n} 进度百分比，0 到 100 的整数`,
    statusLabel: (n: number, status: KrStatus) =>
      `关键结果 ${n} 状态，当前${STATUS_LABEL[status]}，更改`,
    barLabel: (n: number) => `关键结果 ${n} 进度`,
    barText: (value: number | null, status: KrStatus) =>
      value === null ? '未填写' : `${value}%，${STATUS_LABEL[status]}`,
    editLast: '修改这次',
    revertLast: '撤回这次',
    editLastLabel: (n: number) => `修改这次，关键结果 ${n}`,
    revertLastLabel: (n: number) => `撤回这次，关键结果 ${n}`,
    revertDisabledReason: '已撤回的更新不能再次撤回，请先更新进度。',
    saveFailed: '没能保存，进度没有改动。',
    stale: '这个关键结果刚在别处有改动，已刷新为最新状态，请再试一次。',
    retry: '重试',
    discard: '放弃修改',
    doneNot100: (value: number | null) =>
      value === null
        ? '状态是「已完成」，但进度还没填写。'
        : `状态是「已完成」，但进度是 ${value}%。`,
    doneNot100Spoken: (n: number) => `关键结果 ${n}：状态是已完成，但进度不是 100。`,
    setTo100: '改为 100%',
    setTo100Label: (n: number) => `把关键结果 ${n} 的进度改为 100%`,
    progressUpdated: (n: number, value: number | null) =>
      value === null ? `关键结果 ${n} 进度已清空。` : `关键结果 ${n} 进度已更新为 ${value}%。`,
    statusUpdated: (n: number, status: KrStatus) =>
      `关键结果 ${n} 状态已改为${STATUS_LABEL[status]}。`,
    reverted: (n: number, value: number | null, status: KrStatus) =>
      `已撤回关键结果 ${n} 的上一次进度更新，进度恢复为${
        value === null ? '未填写' : ` ${value}%`
      }，状态恢复为${STATUS_LABEL[status]}。`,
    saving: '正在保存…',
  },
  progressErrors: {
    belowMin: '进度不能小于 0',
    aboveMax: '进度不能超过 100',
    notNumber: '请输入 0–100 的整数',
    decimal: '请输入整数，不要带小数点',
  },
  history: {
    heading: (count: number) => `全部 OKR · ${count}`,
    listLabel: 'OKR 列表',
    searchPlaceholder: '搜索目标…',
    searchLabel: '搜索 OKR 目标',
    clearSearch: '清除搜索',
    searchFound: (count: number) => `找到 ${count} 个 OKR`,
    noMatch: (keyword: string) => `没有找到包含「${keyword}」的 OKR。`,
    openNow: '当前打开',
    periodLabel: '周期 ',
    overallLabel: '整体进度 ',
    overallNotFilled: '整体进度未填写',
    pinned: '置顶',
    reviewed: '已复盘',
    allDone: '全部完成',
    updatedAt: (time: string) => `更新于 ${time}`,
    krCount: (count: number) => `${count} 个关键结果`,
    emptyTitle: '还没有 OKR',
    emptyBody: '你创建的每一个 OKR 都会保存在这里，随时可以找回。',
    loadFailed: '没能读取 OKR 列表。',
    retry: '重试',
    openFailed: '没能打开这条 OKR，请重试。',
    blockedBusy: '正在重新生成，完成后可切换。',
    blockedEditing: '正在编辑文字，保存或取消后可切换。',
  },
  note: {
    loadFailed: '没能读取这条 OKR。',
    retry: '重试',
    emptyTitle: '还没有 OKR',
    emptyBody: '告诉 ClarityOKR 你想实现什么，回答几个问题就能生成。',
    loadingLabel: '正在读取…',
  },
} as const;

/** `今天 14:20` / `昨天 09:05` / `2026-09-28` in local time (§4.8). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayKey = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayKey(now) - dayKey(date)) / 86_400_000);
  if (diffDays === 0) return `今天 ${hm}`;
  if (diffDays === 1) return `昨天 ${hm}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `10-03` style month-day for removed key results. */
export function formatMonthDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
