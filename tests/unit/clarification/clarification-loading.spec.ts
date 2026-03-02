import '@angular/compiler';
import { firstValueFrom } from 'rxjs';

import type { ClarificationPrompt } from '@clarityokr/contracts';

import { ClarificationStore } from '../../../app/renderer/src/app/clarification/state/clarification.store';

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

describe('ClarificationStore loading flag', () => {
  let store: ClarificationStore;

  beforeEach(() => {
    store = new ClarificationStore();
  });

  it('toggles loading state on setLoading', async () => {
    const states: boolean[] = [];
    const sub = store.isLoading$.subscribe((v) => {
      states.push(v);
    });

    // Initial state: not loading
    expect(states.length).toBe(1);
    expect(states[0]).toBe(false);

    // Transition to loading
    store.setLoading();
    expect(states.length).toBe(2);
    expect(states[1]).toBe(true);

    // Set prompt transitions to prompting (not loading)
    const prompt = buildPrompt(3);
    store.setPrompt(prompt);
    expect(states.length).toBe(3);
    expect(states[2]).toBe(false);

    sub.unsubscribe();
  });
});
