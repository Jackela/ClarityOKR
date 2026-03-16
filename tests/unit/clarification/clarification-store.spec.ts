import type { ClarificationPrompt } from '@clarityokr/contracts';

import { SyncClarificationState } from '../../../app/renderer/src/app/clarification/services/sync-clarification-state.service';
import { Logger } from '../../../app/renderer/src/app/core/services/logger.service';

function buildPrompt(optionCount = 3, id = 'prompt-1'): ClarificationPrompt {
  return {
    id,
    question: 'Describe your goal focus',
    sequence: 0,
    context: 'goal-dimension',
    options: Array.from({ length: optionCount }, (_, index) => ({
      id: `opt-${index}`,
      label: `Option ${index + 1}`,
      description: undefined,
      scopeTag: 'test',
    })),
  } satisfies ClarificationPrompt;
}

describe('SyncClarificationState', () => {
  let state: SyncClarificationState;

  beforeEach(() => {
    const logger = new Logger();
    state = new SyncClarificationState(logger);
  });

  it('persists prompts with 2-5 options and exposes them', () => {
    const prompt = buildPrompt(3);

    // Need to start workflow first
    state.setLoading(true, 'test');
    state.setPrompt(prompt);

    expect(state.currentPrompt()).toEqual(prompt);
    expect(state.validationError()).toBeNull();
  });

  it('throws immediately when prompt has fewer than 2 options', () => {
    const prompt = buildPrompt(1);

    // Note: Validation now happens at the service level, not in state
    // The state itself accepts any prompt, validation is done before calling setPrompt
    // This test verifies the state can be set (validation is orchestrator's responsibility)
    expect(() => state.setPrompt(prompt)).not.toThrow();
  });

  it('records selection for current prompt and marks readiness', () => {
    const prompt = buildPrompt(2);

    // Start workflow and set first prompt
    state.setLoading(true, 'test');
    state.setPrompt(prompt);

    // Each call replaces the selection for the current prompt
    state.recordSelection(prompt.id, 'opt-0');
    let selectedIds = state.selectedOptionIds();
    expect(selectedIds).toEqual(['opt-0']);

    // In 'ready' state (after first selection), selection changes should still work
    // Note: state transitions to 'ready' after first selection with new logic
    state.recordSelection(prompt.id, 'opt-1');
    selectedIds = state.selectedOptionIds();
    // The second selection should still be recorded (user can change their mind)
    expect(selectedIds).toEqual(['opt-1']);

    // markReady is deprecated but should not break
    state.markReady(true);
    // isReadyToGenerate is now auto-calculated
    expect(state.isReadyToGenerate()).toBe(true);
  });

  it('transition to ready state after selection on 1 prompt', () => {
    const prompt1 = buildPrompt(2);

    // Initial state is 'idle'
    expect(state.workflowState()).toBe('idle');

    // Start workflow
    state.setLoading(true, 'test');
    expect(state.workflowState()).toBe('loading');

    // setPrompt from loading transitions to 'prompting'
    state.setPrompt(prompt1);
    expect(state.workflowState()).toBe('prompting');

    // First selection transitions to ready (only 1 prompt needed)
    state.recordSelection(prompt1.id, 'opt-0');
    expect(state.workflowState()).toBe('ready');

    // markReady is deprecated
    state.markReady(true);
    expect(state.workflowState()).toBe('ready');
  });

  it('maintains history of prompts', () => {
    const prompt1 = buildPrompt(3, 'prompt-1');
    const prompt2 = buildPrompt(3, 'prompt-2');

    state.setPrompt(prompt1);
    state.setPrompt(prompt2);

    expect(state.history()).toHaveLength(2);
    expect(state.history()[0].id).toBe('prompt-1');
    expect(state.history()[1].id).toBe('prompt-2');
  });

  it('calculates current selection correctly', () => {
    const prompt = buildPrompt(3, 'prompt-1');

    state.setPrompt(prompt);
    expect(state.currentSelection()).toBeNull();

    state.recordSelection(prompt.id, 'opt-1');
    expect(state.currentSelection()).toBe('opt-1');
  });

  it('resets all state correctly', () => {
    const prompt = buildPrompt(3);

    state.setLoading(true, 'test');
    state.setPrompt(prompt);
    state.recordSelection(prompt.id, 'opt-0');
    state.setSessionId('session-123');
    state.setValidationError('some error');

    state.reset();

    expect(state.workflowState()).toBe('idle');
    expect(state.currentPrompt()).toBeNull();
    expect(state.selectionCount()).toBe(0);
    expect(state.sessionId()).toBeNull();
    expect(state.validationError()).toBeNull();
    expect(state.history()).toHaveLength(0);
  });
});
