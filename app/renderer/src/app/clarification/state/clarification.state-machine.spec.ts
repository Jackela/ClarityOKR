import '@angular/compiler';

import type { ClarificationPrompt } from '@clarityokr/contracts';

import {
  clarificationReducer,
  type ClarificationEvent,
  type ClarificationState,
  type ErrorInfo,
  type OKRDocument,
} from './clarification.state-machine';

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

const mockError: ErrorInfo = { message: 'test error', recoverable: true };

describe('ClarificationStateMachine', () => {
  describe('Valid Transitions', () => {
    it('should transition from idle to loading on START event', () => {
      const initial: ClarificationState = { type: 'idle' };
      const event: ClarificationEvent = { type: 'START', intent: 'test intent' };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('loading');
      expect(next).toEqual({ type: 'loading', intent: 'test intent' });
    });

    it('should transition from loading to prompting on PROMPT_RECEIVED', () => {
      const initial: ClarificationState = { type: 'loading', intent: 'test' };
      const prompt = buildPrompt(3);
      const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('prompting');
      expect('prompt' in next).toBe(true);
      expect('history' in next).toBe(true);
      if (next.type === 'prompting') {
        expect(next.prompt).toEqual(prompt);
        expect(next.history).toEqual([prompt]);
      }
    });

    it('should accumulate prompt history on multiple PROMPT_RECEIVED events', () => {
      const prompt1 = buildPrompt(3, 'prompt-1');
      const initial: ClarificationState = {
        type: 'prompting',
        prompt: prompt1,
        history: [prompt1],
      };
      const prompt2 = buildPrompt(3, 'prompt-2');
      const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: prompt2 };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('prompting');
      if (next.type === 'prompting') {
        expect(next.prompt).toEqual(prompt2);
        expect(next.history.length).toBe(2);
        expect(next.history[0]).toEqual(prompt1);
        expect(next.history[1]).toEqual(prompt2);
      }
    });

    it('should transition from ready to generating on GENERATE event', () => {
      const context = {
        selections: [
          { promptId: 'p1', optionId: 'o1' },
          { promptId: 'p2', optionId: 'o2' },
        ],
        history: [buildPrompt(3, 'p1'), buildPrompt(3, 'p2')],
      };
      const initial: ClarificationState = { type: 'ready', context };
      const event: ClarificationEvent = { type: 'GENERATE' };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('generating');
      if (next.type === 'generating') {
        expect(next.context).toEqual(context);
      }
    });

    it('should transition from generating to completed on OKR_GENERATED', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'generating', context };
      const okr: OKRDocument = { objectives: [] };
      const event: ClarificationEvent = { type: 'OKR_GENERATED', okr };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('completed');
      if (next.type === 'completed') {
        expect(next.okr).toEqual(okr);
      }
    });

    it('should transition from completed to loading on START event', () => {
      const initial: ClarificationState = { type: 'completed', okr: { objectives: [] } };
      const event: ClarificationEvent = { type: 'START', intent: 'new intent' };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('loading');
      expect(next).toEqual({ type: 'loading', intent: 'new intent' });
    });

    it('should transition from error to loading on START event', () => {
      const initial: ClarificationState = {
        type: 'error',
        error: mockError,
        previousState: { type: 'idle' },
      };
      const event: ClarificationEvent = { type: 'START', intent: 'retry' };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('loading');
      expect(next).toEqual({ type: 'loading', intent: 'retry' });
    });
  });

  describe('Error Handling', () => {
    it('should transition loading to error on ERROR event', () => {
      const initial: ClarificationState = { type: 'loading', intent: 'test' };
      const event: ClarificationEvent = { type: 'ERROR', error: mockError };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('error');
      if (next.type === 'error') {
        expect(next.error).toEqual(mockError);
        expect(next.previousState).toEqual(initial);
      }
    });

    it('should transition prompting to error on ERROR event', () => {
      const prompt = buildPrompt(3);
      const initial: ClarificationState = {
        type: 'prompting',
        prompt,
        history: [prompt],
      };
      const event: ClarificationEvent = { type: 'ERROR', error: mockError };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('error');
      if (next.type === 'error') {
        expect(next.previousState).toEqual(initial);
      }
    });

    it('should transition generating to error on ERROR event', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'generating', context };
      const event: ClarificationEvent = { type: 'ERROR', error: mockError };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('error');
      if (next.type === 'error') {
        expect(next.previousState).toEqual(initial);
      }
    });

    it('should transition ready to error on ERROR event', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'ready', context };
      const event: ClarificationEvent = { type: 'ERROR', error: mockError };

      const next = clarificationReducer(initial, event);

      expect(next.type).toBe('error');
      if (next.type === 'error') {
        expect(next.previousState).toEqual(initial);
      }
    });
  });

  describe('RESET Event', () => {
    it('should reset to idle from loading state', () => {
      const initial: ClarificationState = { type: 'loading', intent: 'test' };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should reset to idle from prompting state', () => {
      const prompt = buildPrompt(3);
      const initial: ClarificationState = {
        type: 'prompting',
        prompt,
        history: [prompt],
      };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should reset to idle from ready state', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'ready', context };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should reset to idle from generating state', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'generating', context };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should reset to idle from completed state', () => {
      const initial: ClarificationState = { type: 'completed', okr: { objectives: [] } };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should reset to idle from error state', () => {
      const initial: ClarificationState = {
        type: 'error',
        error: mockError,
        previousState: { type: 'idle' },
      };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });

    it('should stay in idle on RESET from idle', () => {
      const initial: ClarificationState = { type: 'idle' };
      const resetEvent: ClarificationEvent = { type: 'RESET' };

      const next = clarificationReducer(initial, resetEvent);

      expect(next).toEqual({ type: 'idle' });
    });
  });

  describe('Invalid Transitions', () => {
    it('should throw error for idle -> GENERATE (invalid)', () => {
      const initial = { type: 'idle' } as ClarificationState;
      const event = { type: 'GENERATE' } as ClarificationEvent;

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'GENERATE'.*in state 'idle'/,
      );
    });

    it('should throw error for idle -> OKR_GENERATED (invalid)', () => {
      const initial = { type: 'idle' } as ClarificationState;
      const event = { type: 'OKR_GENERATED', okr: { objectives: [] } } as ClarificationEvent;

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'OKR_GENERATED'.*in state 'idle'/,
      );
    });

    it('should throw error for loading -> GENERATE (invalid)', () => {
      const initial = { type: 'loading', intent: 'test' } as ClarificationState;
      const event = { type: 'GENERATE' } as ClarificationEvent;

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'GENERATE'.*in state 'loading'/,
      );
    });

    it('should throw error for prompting -> GENERATE (invalid - need ready first)', () => {
      const prompt = buildPrompt(3);
      const initial = {
        type: 'prompting',
        prompt,
        history: [prompt],
      } as ClarificationState;
      const event = { type: 'GENERATE' } as ClarificationEvent;

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'GENERATE'.*in state 'prompting'/,
      );
    });

    it('should throw error for completed -> PROMPT_RECEIVED (invalid)', () => {
      const initial: ClarificationState = { type: 'completed', okr: { objectives: [] } };
      const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: buildPrompt(3) };

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'PROMPT_RECEIVED'.*in state 'completed'/,
      );
    });

    it('should throw error for error -> GENERATE (invalid)', () => {
      const initial: ClarificationState = {
        type: 'error',
        error: mockError,
        previousState: { type: 'idle' },
      };
      const event: ClarificationEvent = { type: 'GENERATE' };

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'GENERATE'.*in state 'error'/,
      );
    });

    it('should throw error for generating -> PROMPT_RECEIVED (invalid)', () => {
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      const initial: ClarificationState = { type: 'generating', context };
      const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: buildPrompt(3) };

      expect(() => clarificationReducer(initial, event)).toThrow(
        /Invalid transition.*cannot process event 'PROMPT_RECEIVED'.*in state 'generating'/,
      );
    });
  });

  describe('Type Guards', () => {
    it('isIdleState should return true for idle state', () => {
      const { isIdleState } = require('./clarification.state-machine');
      expect(isIdleState({ type: 'idle' })).toBe(true);
      expect(isIdleState({ type: 'loading', intent: 'test' })).toBe(false);
    });

    it('isLoadingState should return true for loading state', () => {
      const { isLoadingState } = require('./clarification.state-machine');
      expect(isLoadingState({ type: 'loading', intent: 'test' })).toBe(true);
      expect(isLoadingState({ type: 'idle' })).toBe(false);
    });

    it('isPromptingState should return true for prompting state', () => {
      const { isPromptingState } = require('./clarification.state-machine');
      const prompt = buildPrompt(3);
      expect(isPromptingState({ type: 'prompting', prompt, history: [prompt] })).toBe(true);
      expect(isPromptingState({ type: 'idle' })).toBe(false);
    });

    it('isReadyState should return true for ready state', () => {
      const { isReadyState } = require('./clarification.state-machine');
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      expect(isReadyState({ type: 'ready', context })).toBe(true);
      expect(isReadyState({ type: 'idle' })).toBe(false);
    });

    it('isGeneratingState should return true for generating state', () => {
      const { isGeneratingState } = require('./clarification.state-machine');
      const context = {
        selections: [{ promptId: 'p1', optionId: 'o1' }],
        history: [buildPrompt(3)],
      };
      expect(isGeneratingState({ type: 'generating', context })).toBe(true);
      expect(isGeneratingState({ type: 'idle' })).toBe(false);
    });

    it('isCompletedState should return true for completed state', () => {
      const { isCompletedState } = require('./clarification.state-machine');
      expect(isCompletedState({ type: 'completed', okr: { objectives: [] } })).toBe(true);
      expect(isCompletedState({ type: 'idle' })).toBe(false);
    });

    it('isErrorState should return true for error state', () => {
      const { isErrorState } = require('./clarification.state-machine');
      expect(
        isErrorState({
          type: 'error',
          error: mockError,
          previousState: { type: 'idle' },
        }),
      ).toBe(true);
      expect(isErrorState({ type: 'idle' })).toBe(false);
    });
  });
});
