import { z } from 'zod';

import { countGraphemes, splitGraphemes } from './okr-model.js';

/**
 * #110 (new-1, spec S3§12): unsaved input saved as a draft when the session ends (log off /
 * shut down) and offered back on the next launch. One versioned JSON file per window under
 * `userData/drafts/`. These are the shared shapes and the pure decision rules; the file I/O is
 * in the main process, the bar in the renderer.
 */

export const DRAFT_FILE_VERSION = 1;
export type DraftWindow = 'main' | 'sticky';
export const DRAFT_WINDOWS: readonly DraftWindow[] = ['main', 'sticky'];

const id = z.string().min(1).max(200);
const text = z.string().max(20000);
const sections = z.strictObject({ wentWell: text, fellShort: text, nextSteps: text });
const krText = z.strictObject({ statement: text, successMetric: text });

/** The wizard in the main window: the goal typed in step 1 and the step reached. */
export const wizardDraftRowSchema = z.strictObject({
  kind: z.literal('wizard'),
  step: z.number().int().min(1).max(100),
  intent: text,
});
/** One key result changed in the text edit (sticky window). `base` = its text when editing began. */
export const textEditDraftRowSchema = z.strictObject({
  kind: z.literal('textEdit'),
  okrId: id,
  krId: id,
  base: krText,
  draft: krText,
});
/**
 * #117: the objective text changed in the text edit. `base` = the objective when editing began
 * (the saved title then).
 */
export const objectiveDraftRowSchema = z.strictObject({
  kind: z.literal('objective'),
  okrId: id,
  base: text,
  draft: text,
});
/** #117: key results added in the text edit and not saved yet, in their order in the form. */
export const addedKrDraftRowSchema = z.strictObject({
  kind: z.literal('addedKr'),
  okrId: id,
  krs: z
    .array(z.strictObject({ id, statement: text, successMetric: text }))
    .min(1)
    .max(100),
});
/** The review tab of one OKR (sticky window). `base` = the saved review when typing began. */
export const reviewDraftRowSchema = z.strictObject({
  kind: z.literal('review'),
  okrId: id,
  base: sections,
  draft: sections,
});
export const draftRowSchema = z.discriminatedUnion('kind', [
  wizardDraftRowSchema,
  objectiveDraftRowSchema,
  textEditDraftRowSchema,
  addedKrDraftRowSchema,
  reviewDraftRowSchema,
]);
export type WizardDraftRow = z.infer<typeof wizardDraftRowSchema>;
export type TextEditDraftRow = z.infer<typeof textEditDraftRowSchema>;
export type ReviewDraftRow = z.infer<typeof reviewDraftRowSchema>;
export type ObjectiveDraftRow = z.infer<typeof objectiveDraftRowSchema>;
export type AddedKrDraftRow = z.infer<typeof addedKrDraftRowSchema>;
export type DraftRow = z.infer<typeof draftRowSchema>;
export type DraftSections = z.infer<typeof sections>;

export const draftReportSchema = z.strictObject({ rows: z.array(draftRowSchema).max(200) });
export type DraftReport = z.infer<typeof draftReportSchema>;

export const draftFileSchema = z.strictObject({
  version: z.literal(DRAFT_FILE_VERSION),
  window: z.enum(['main', 'sticky']),
  savedAt: z.string(),
  rows: z.array(draftRowSchema).min(1).max(200),
});
export type DraftFile = z.infer<typeof draftFileSchema>;

/** Stable key of a row (one per place a draft can go back to). */
export function draftRowKey(row: DraftRow): string {
  switch (row.kind) {
    case 'wizard':
      return 'wizard';
    case 'objective':
      return `objective:${row.okrId}`;
    case 'textEdit':
      return `textEdit:${row.okrId}:${row.krId}`;
    case 'addedKr':
      return `addedKr:${row.okrId}`;
    case 'review':
      return `review:${row.okrId}`;
  }
}

/** A row the bar shows, with what its line needs (resolved by the main process). */
export type ResolvedDraftRow =
  | { key: string; row: WizardDraftRow }
  | { key: string; row: ObjectiveDraftRow | AddedKrDraftRow; okrTitle: string }
  | { key: string; row: TextEditDraftRow; okrTitle: string; krIndex: number }
  | { key: string; row: ReviewDraftRow; okrTitle: string; period: string | null };

export interface DraftGetReply {
  rows: ResolvedDraftRow[];
  /** Rows dropped because their OKR / KR no longer exists (S3§12.4). */
  deletedCount: number;
}

export const draftSettleSchema = z.strictObject({
  /** Row keys to drop; `all: true` drops the whole draft of this window (放弃). */
  keys: z.array(z.string().max(500)).max(200).optional(),
  all: z.literal(true).optional(),
});
export type DraftSettleRequest = z.infer<typeof draftSettleSchema>;
export interface DraftSettleReply {
  remaining: number;
}

/** S3§12.1: in-memory database mode never saves a draft and never offers one. */
export function draftsEnabled(storageMode: 'normal' | 'fresh-file' | 'memory'): boolean {
  return storageMode !== 'memory';
}

/**
 * Fixed order of the lines (S3§12.2 / §12.7): wizard, objective text, key result texts, added
 * key results, review.
 */
const ORDER: Record<DraftRow['kind'], number> = {
  wizard: 0,
  objective: 1,
  textEdit: 2,
  addedKr: 3,
  review: 4,
};
export function sortDraftRows<T extends { row: DraftRow }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => ORDER[a.row.kind] - ORDER[b.row.kind]);
}

/** What the main process knows about a row's target now. */
export type DraftTargetState =
  | { exists: false }
  | {
      exists: true;
      /** The saved value equals `base` (nothing was saved over the spot since). */
      unchangedSinceDraft: boolean;
    };

/**
 * S3§12.4 / §12.3 case 3, at launch: drop rows whose OKR / KR is gone (counted for 「另有 n 条…」)
 * and rows whose spot the user already saved (voided silently).
 */
export function filterDraftRows<T>(
  rows: readonly T[],
  stateOf: (row: T) => DraftTargetState,
): { valid: T[]; deletedCount: number; voidedCount: number } {
  const valid: T[] = [];
  let deletedCount = 0;
  let voidedCount = 0;
  for (const row of rows) {
    const state = stateOf(row);
    if (!state.exists) deletedCount += 1;
    else if (!state.unchangedSinceDraft) voidedCount += 1;
    else valid.push(row);
  }
  return { valid, deletedCount, voidedCount };
}

/**
 * S3§12.3 「恢复前确认再覆盖」 for one spot:
 * - `saved`: the user saved this spot since the draft → the row is voided.
 * - `dirty`: the spot holds new unsaved edits → confirm 「用上次没保存的内容替换现在的修改？」 first.
 * - `untouched`: restore at once.
 */
export type RestoreTarget = 'saved' | 'dirty' | 'untouched';
export type RestoreAction = 'void' | 'confirm' | 'restore';
export function restoreAction(target: RestoreTarget): RestoreAction {
  if (target === 'saved') return 'void';
  if (target === 'dirty') return 'confirm';
  return 'restore';
}

/** The whole draft row's spot: several spots in one window → the strongest decision wins. */
export function combineRestoreActions(actions: readonly RestoreAction[]): 'confirm' | 'restore' {
  return actions.includes('confirm') ? 'confirm' : 'restore';
}

const TRAILING_SPACES = /[\u0020\u3000]+$/u;

/**
 * S3§12.5 v3.3 (final): the OKR title in a bar line. Counted with the shared grapheme counter,
 * every cluster counts 1. ≤ 10 → the whole title; ≥ 11 → the first 9 clusters, trailing
 * U+0020 / U+3000 removed, then 「…」. No width weights, no dynamic limit.
 */
export const DRAFT_TITLE_FULL_MAX = 10;
export const DRAFT_TITLE_KEEP = 9;
export function truncateDraftTitle(title: string): string {
  if (countGraphemes(title) <= DRAFT_TITLE_FULL_MAX) return title;
  const kept = splitGraphemes(title).slice(0, DRAFT_TITLE_KEEP).join('');
  return `${kept.replace(TRAILING_SPACES, '')}…`;
}
