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

describe('ClarificationStore', () => {
  let store: ClarificationStore;

  beforeEach(() => {
    store = new ClarificationStore();
  });

  it('persists prompts with 2-5 options and exposes them', async () => {
    const prompt = buildPrompt(3);

    store.setPrompt(prompt);

    await expect(firstValueFrom(store.currentPrompt$)).resolves.toEqual(prompt);
    await expect(firstValueFrom(store.validationError$)).resolves.toBeNull();
  });

  it('throws immediately when prompt has fewer than 2 options', () => {
    const prompt = buildPrompt(1);

    expect(() => store.setPrompt(prompt)).toThrowError(
      /Clarification prompts must supply between 2 and 5 options/,
    );
  });

  it('records selection for current prompt and marks readiness', async () => {
    const prompt = buildPrompt(2);
    store.setPrompt(prompt);

    // Each call replaces the selection for the current prompt
    store.recordSelection('opt-0');
    let selectedIds = await firstValueFrom(store.selectedOptionIds$);
    expect(selectedIds).toEqual(['opt-0']);

    store.recordSelection('opt-1');
    selectedIds = await firstValueFrom(store.selectedOptionIds$);
    expect(selectedIds).toEqual(['opt-1']);

    // markReady forces the ready state
    store.markReady(true);
    const isReady = await firstValueFrom(store.isReadyToGenerate$);
    expect(isReady).toBe(true);
  });

  it('transition to ready state after selections on 2 different prompts', async () => {
    const prompt1 = buildPrompt(2);
    prompt1.id = 'prompt-1';

    // Initial state is 'idle'
    let state = await firstValueFrom(store.workflowState$);
    expect(state).toBe('idle');

    // setPrompt from idle transitions to 'prompting'
    store.setPrompt(prompt1);
    state = await firstValueFrom(store.workflowState$);
    expect(state).toBe('prompting');

    // First selection keeps state as 'prompting' (only 1 prompt has selection)
    store.recordSelection('opt-0');
    state = await firstValueFrom(store.workflowState$);
    expect(state).toBe('prompting');

    // Now set a second prompt
    const prompt2 = buildPrompt(2);
    prompt2.id = 'prompt-2';
    store.setPrompt(prompt2);

    // Make selection on second prompt - now 2 prompts have selections
    store.recordSelection('opt-1');
    state = await firstValueFrom(store.workflowState$);
    expect(state).toBe('ready');

    // markReady should keep it in 'ready' state
    store.markReady(true);
    state = await firstValueFrom(store.workflowState$);
    expect(state).toBe('ready');
  });
});
