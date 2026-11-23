/** Exit / restart confirmation decision (split from closed-loop-ipc.ts, #164). */

import type { UnsavedFlags } from './types.js';

// ---------------------------------------------------------------------------
// Exit / restart confirmation (pure decision)
// ---------------------------------------------------------------------------

export type StorageModeName = 'normal' | 'fresh-file' | 'memory';

export type ExitConfirmReason = 'wizard' | 'text_edit' | 'review_draft' | 'memory_data';

/** Display order is fixed by the design spec (§1.2c). */
export const EXIT_CONFIRM_REASON_ORDER: readonly ExitConfirmReason[] = [
  'wizard',
  'text_edit',
  'review_draft',
  'memory_data',
];

export interface ExitConfirmationInput {
  storageMode: StorageModeName;
  /** Any objective or saved review exists in the database. */
  dbHasData: boolean;
  unsaved: UnsavedFlags;
}

export interface ExitConfirmation {
  needsConfirm: boolean;
  /** Which sentences the dialog shows, in the fixed order. */
  reasons: ExitConfirmReason[];
  /** Only the in-memory-data reason applies: the safe button reads "not now" instead of "keep editing". */
  memoryOnly: boolean;
  /** The window that hosts the dialog: the sticky note only when it is the single class involved. */
  dialogWindow: 'main' | 'sticky';
  /** Windows that must be visible before the dialog opens. */
  windowsToShow: Array<'main' | 'sticky'>;
}

/**
 * Decides whether quitting (or restarting) needs the user's confirmation.
 *
 * - Wizard input, an uncommitted text edit and an unsaved review draft always ask.
 * - In `memory` storage mode it also asks when the database holds any objective or saved
 *   review; an empty in-memory database asks nothing by itself.
 * - `normal` and `fresh-file` modes never ask because of stored data (it is on disk).
 * - Progress updates are saved immediately and are not an input here.
 */
export function decideExitConfirmation(input: ExitConfirmationInput): ExitConfirmation {
  const active = new Set<ExitConfirmReason>();
  if (input.unsaved.wizard) active.add('wizard');
  if (input.unsaved.textEdit) active.add('text_edit');
  if (input.unsaved.reviewDraft) active.add('review_draft');
  if (input.storageMode === 'memory' && input.dbHasData) active.add('memory_data');

  const reasons = EXIT_CONFIRM_REASON_ORDER.filter((reason) => active.has(reason));
  const windowsToShow: Array<'main' | 'sticky'> = [];
  if (active.has('wizard') || active.has('memory_data')) windowsToShow.push('main');
  if (active.has('text_edit') || active.has('review_draft')) windowsToShow.push('sticky');

  const stickyOnly =
    reasons.length > 0 && reasons.every((r) => r === 'text_edit' || r === 'review_draft');
  return {
    needsConfirm: reasons.length > 0,
    reasons,
    memoryOnly: reasons.length === 1 && reasons[0] === 'memory_data',
    dialogWindow: stickyOnly ? 'sticky' : 'main',
    windowsToShow,
  };
}
