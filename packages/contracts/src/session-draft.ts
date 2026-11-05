import { z } from 'zod';

import { countGraphemes, splitGraphemes } from './okr-model.js';
import { clarificationPromptSchema } from './validators/clarify-to-okr.validator.js';

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

/**
 * #116: format of the wizard's steps inside its draft row. Bumped whenever the shape of a step
 * changes; a row of another format puts back the goal text only (S3§12.9).
 */
export const WIZARD_DRAFT_FORMAT = 2;

/**
 * The wizard in the main window: the goal typed in step 1 and the step reached. #116 adds the
 * steps (each question as shown, its options and the chosen option id), the wizard session id
 * and their format number. Rows from #115 have only `step` and `intent`. `steps` stays loosely
 * typed here so one damaged step cannot void the whole draft file; it is checked step by step
 * with `restorableWizardSteps` when put back.
 */
export const wizardDraftRowSchema = z.strictObject({
  kind: z.literal('wizard'),
  step: z.number().int().min(1).max(100),
  intent: text,
  format: z.number().int().optional(),
  sessionId: id.optional(),
  steps: z.array(z.unknown()).max(100).optional(),
  /** All questions answered and the 「可以生成」 screen shown (or 生成 OKR still running). */
  ready: z.boolean().optional(),
});

/** One wizard step as saved: the question shown and the option chosen (`null`: not yet). */
export const wizardDraftStepSchema = z.strictObject({
  prompt: clarificationPromptSchema,
  selectedOptionId: z.string().min(1).nullable(),
});
export type WizardDraftStep = z.infer<typeof wizardDraftStepSchema>;

/** What 恢复 puts back into the wizard (S3§12.9). */
export interface WizardRestorePlan {
  intent: string;
  /** Wizard session id to continue (`null`: goal text only, a new session on 开始). */
  sessionId: string | null;
  /** Complete steps, oldest first; empty = goal text only at step 1. */
  steps: WizardDraftStep[];
  /** Show the 「可以生成」 screen (every step answered, nothing damaged). */
  ready: boolean;
  /** Why the steps were cut back (logged by the main process, never shown). */
  fallback: null | 'version' | 'damaged';
  /** The step (1-based) that could not be used and why; set with `fallback`. */
  damage: null | { step: number; reason: WizardDraftFallbackReason };
}
export type WizardDraftFallbackReason = 'missing' | 'corrupt' | 'version';

/**
 * S3§12.9: which steps of a wizard draft can be put back, without calling the model.
 * - #115 rows (no format) → goal text only.
 * - another format number → goal text only (`version`).
 * - step k missing (no session id, an earlier step with no answer) or corrupt (unreadable, the
 *   chosen option not among its options) → the steps before k (`damaged`); none left → goal
 *   text only.
 * - the last step answered = the next question was still being generated → stop there with the
 *   answer kept (the next click generates as usual).
 */
export function restorableWizardSteps(row: WizardDraftRow): WizardRestorePlan {
  const intentOnly = (
    fallback: WizardRestorePlan['fallback'],
    damage: WizardRestorePlan['damage'] = null,
  ): WizardRestorePlan => ({
    intent: row.intent,
    sessionId: null,
    steps: [],
    ready: false,
    fallback,
    damage,
  });
  if (row.format === undefined && row.steps === undefined) return intentOnly(null);
  if (row.format !== WIZARD_DRAFT_FORMAT) {
    return intentOnly('version', { step: 1, reason: 'version' });
  }
  const raw = row.steps ?? [];
  const steps: WizardDraftStep[] = [];
  let damage: WizardRestorePlan['damage'] =
    raw.length > 0 && !row.sessionId ? { step: 1, reason: 'missing' } : null;
  for (const [index, value] of raw.entries()) {
    if (damage) break;
    const parsed = wizardDraftStepSchema.safeParse(value);
    const step = parsed.success ? parsed.data : null;
    const isLast = index === raw.length - 1;
    if (
      !step ||
      (step.selectedOptionId !== null &&
        !step.prompt.options.some((o) => o.id === step.selectedOptionId))
    ) {
      damage = { step: index + 1, reason: 'corrupt' };
    } else if (!isLast && step.selectedOptionId === null) {
      damage = { step: index + 1, reason: 'missing' };
    } else {
      steps.push(step);
    }
  }
  if (steps.length === 0) return intentOnly(damage ? 'damaged' : null, damage);
  const allAnswered = steps.every((s) => s.selectedOptionId !== null);
  return {
    intent: row.intent,
    sessionId: row.sessionId ?? null,
    steps,
    ready: !damage && row.ready === true && allAnswered,
    fallback: damage ? 'damaged' : null,
    damage,
  };
}

/**
 * The wizard row the main process hands to the window: steps that cannot be used are cut here
 * (logged once in the main process), so the window only ever gets a row it can put back as is.
 */
export function trimWizardDraftRow(row: WizardDraftRow): {
  row: WizardDraftRow;
  damage: WizardRestorePlan['damage'];
} {
  const plan = restorableWizardSteps(row);
  if (!plan.fallback) return { row, damage: null };
  if (plan.steps.length === 0) {
    return { row: { kind: 'wizard', step: 1, intent: row.intent }, damage: plan.damage };
  }
  return {
    row: {
      kind: 'wizard',
      step: plan.steps.length + 1,
      intent: row.intent,
      format: WIZARD_DRAFT_FORMAT,
      ...(plan.sessionId ? { sessionId: plan.sessionId } : {}),
      steps: plan.steps,
      ready: false,
    },
    damage: plan.damage,
  };
}

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
