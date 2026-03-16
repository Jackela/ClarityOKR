import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import { SyncClarificationState } from '../../../app/renderer/src/app/clarification/services/sync-clarification-state.service';
import { Logger } from '../../../app/renderer/src/app/core/services/logger.service';

function buildPrompt(optionCount = 3): ClarificationPrompt {
  return {
    id: 'prompt-1',
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

describe('SyncClarificationState loading flag', () => {
  let state: SyncClarificationState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SyncClarificationState, Logger],
    });
    state = TestBed.inject(SyncClarificationState);
  });

  it('toggles loading state on setLoading', () => {
    const states: boolean[] = [];

    // Subscribe to changes using effect (simulating subscription)
    const originalValue = state.isLoading();
    states.push(originalValue);

    // Initial state: not loading
    expect(states.length).toBe(1);
    expect(states[0]).toBe(false);

    // Transition to loading
    state.setLoading(true);
    states.push(state.isLoading());
    expect(states.length).toBe(2);
    expect(states[1]).toBe(true);

    // Set prompt transitions to prompting (not loading)
    const prompt = buildPrompt(3);
    state.setPrompt(prompt);
    states.push(state.isLoading());
    expect(states.length).toBe(3);
    expect(states[2]).toBe(false);
  });

  it('updates workflow state with loading', () => {
    expect(state.workflowState()).toBe('idle');

    state.setLoading(true, 'test-intent');
    expect(state.workflowState()).toBe('loading');
    expect(state.intent()).toBe('test-intent');

    const prompt = buildPrompt(3);
    state.setPrompt(prompt);
    expect(state.workflowState()).toBe('prompting');
  });
});
