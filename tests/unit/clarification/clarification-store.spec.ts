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
  it('records selections and marks readiness', async () => {
    const prompt = buildPrompt(2);
    store.setPrompt(prompt);
    store.recordSelection('opt-0');
    store.recordSelection('opt-1');
    store.markReady(true);
    const selectedIds = await firstValueFrom(store.selectedOptionIds$);
    expect(selectedIds).toEqual(['opt-0', 'opt-1']);
    const isReady = await firstValueFrom(store.isReadyToGenerate$);
    expect(isReady).toBe(true);
  });
  it('transition to ready state after 2 selections', async () => {
    const prompt = buildPrompt(2);
    store.setPrompt(prompt);
    expect(store.workflowState).toBe('idle');
    store.recordSelection('opt-0');
    expect(store.workflowState).toBe('prompting');
    store.recordSelection('opt-1');
    expect(store.workflowState).toBe('ready');
    store.markReady(true);
    expect(store.workflowState).toBe('ready');
  });
});
