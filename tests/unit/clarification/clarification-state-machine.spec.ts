import type { ClarificationPrompt } from '@clarityokr/contracts';

import { ClarificationStateMachine } from '@clarityokr/renderer/app/clarification/services/clarification-state-machine.service';
import { Logger } from '@clarityokr/renderer/app/core/services/logger.service';

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

describe('ClarificationStateMachine', () => {
  let stateMachine: ClarificationStateMachine;

  beforeEach(() => {
    const logger = new Logger();
    stateMachine = new ClarificationStateMachine(logger);
  });

  describe('State Transitions', () => {
    it('should start in idle state', () => {
      expect(stateMachine.workflowState()).toBe('idle');
    });

    it('should transition from idle to loading on start', () => {
      stateMachine.start('test intent');
      expect(stateMachine.workflowState()).toBe('loading');
      expect(stateMachine.isLoading()).toBe(true);
      expect(stateMachine.intent()).toBe('test intent');
    });

    it('should transition from loading to prompting on setPrompt', () => {
      const prompt = buildPrompt(3);

      stateMachine.start('test');
      expect(stateMachine.workflowState()).toBe('loading');

      stateMachine.setPrompt(prompt);
      expect(stateMachine.workflowState()).toBe('prompting');
      expect(stateMachine.isLoading()).toBe(false);
      expect(stateMachine.currentPrompt()).toEqual(prompt);
    });

    it('should transition from prompting to ready on first selection', () => {
      const prompt = buildPrompt(2);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);
      expect(stateMachine.workflowState()).toBe('prompting');

      stateMachine.recordSelection(prompt.id, 'opt-0');
      expect(stateMachine.workflowState()).toBe('ready');
      expect(stateMachine.isReadyToGenerate()).toBe(true);
    });

    it('should transition from ready to generating on setGenerating', () => {
      const prompt = buildPrompt(2);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');
      expect(stateMachine.workflowState()).toBe('ready');

      stateMachine.setGenerating();
      expect(stateMachine.workflowState()).toBe('generating');
      expect(stateMachine.isLoading()).toBe(true);
    });

    it('should transition from generating to completed on setCompleted', () => {
      const prompt = buildPrompt(2);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');
      stateMachine.setGenerating();

      stateMachine.setCompleted({ objectives: [] });
      expect(stateMachine.workflowState()).toBe('completed');
      expect(stateMachine.isLoading()).toBe(false);
    });

    it('should transition to error on setError', () => {
      stateMachine.start('test');
      stateMachine.setError('network error');

      expect(stateMachine.workflowState()).toBe('error');
      expect(stateMachine.hasError()).toBe(true);
      expect(stateMachine.errorMessage()).toBe('network error');
      expect(stateMachine.isLoading()).toBe(false);
    });

    it('should clear error and return to idle', () => {
      stateMachine.start('test');
      stateMachine.setError('error');
      expect(stateMachine.workflowState()).toBe('error');

      stateMachine.clearError();
      expect(stateMachine.workflowState()).toBe('idle');
      expect(stateMachine.hasError()).toBe(false);
    });
  });

  describe('Prompt Management', () => {
    it('should persist prompts with 2-5 options', () => {
      const prompt = buildPrompt(3);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);

      expect(stateMachine.currentPrompt()).toEqual(prompt);
      expect(stateMachine.hasPrompt()).toBe(true);
    });

    it('should accept prompts with any number of options', () => {
      const prompt = buildPrompt(1);

      expect(() => stateMachine.setPrompt(prompt)).not.toThrow();
      expect(stateMachine.currentPrompt()).toEqual(prompt);
    });

    it('should set null prompt without changing state', () => {
      stateMachine.setPrompt(null);
      expect(stateMachine.currentPrompt()).toBeNull();
      expect(stateMachine.workflowState()).toBe('idle');
    });
  });

  describe('Selection Management', () => {
    it('should record selection and update count', () => {
      const prompt = buildPrompt(3);

      stateMachine.setPrompt(prompt);
      expect(stateMachine.selectionCount()).toBe(0);

      stateMachine.recordSelection(prompt.id, 'opt-0');
      expect(stateMachine.selectionCount()).toBe(1);
      expect(stateMachine.getSelection(prompt.id)).toBe('opt-0');
      expect(stateMachine.hasSelection(prompt.id)).toBe(true);
    });

    it('should replace selection for same prompt', () => {
      const prompt = buildPrompt(3);

      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');
      stateMachine.recordSelection(prompt.id, 'opt-1');

      expect(stateMachine.selectionCount()).toBe(1);
      expect(stateMachine.getSelection(prompt.id)).toBe('opt-1');
    });

    it('should track selections across multiple prompts', () => {
      const prompt1 = buildPrompt(3, 'prompt-1');
      const prompt2 = buildPrompt(3, 'prompt-2');

      stateMachine.recordSelection(prompt1.id, 'opt-a');
      stateMachine.recordSelection(prompt2.id, 'opt-b');

      expect(stateMachine.selectionCount()).toBe(2);
      expect(stateMachine.selectedOptionIds()).toEqual(['opt-a', 'opt-b']);
    });

    it('should calculate current selection based on current prompt', () => {
      const prompt = buildPrompt(3, 'prompt-1');

      stateMachine.setPrompt(prompt);
      expect(stateMachine.currentSelection()).toBeNull();

      stateMachine.recordSelection(prompt.id, 'opt-1');
      expect(stateMachine.currentSelection()).toBe('opt-1');
    });

    it('should automatically determine readiness after 1 selection', () => {
      const prompt = buildPrompt(2);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);
      expect(stateMachine.isReadyToGenerate()).toBe(false);

      stateMachine.recordSelection(prompt.id, 'opt-0');
      expect(stateMachine.isReadyToGenerate()).toBe(true);
    });

    it('should update current selection when changing option', () => {
      const prompt = buildPrompt(3);

      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');
      let selectedIds = stateMachine.selectedOptionIds();
      expect(selectedIds).toEqual(['opt-0']);

      stateMachine.recordSelection(prompt.id, 'opt-1');
      selectedIds = stateMachine.selectedOptionIds();
      expect(selectedIds).toEqual(['opt-1']);
    });
  });

  describe('History Tracking', () => {
    it('should maintain history of prompts', () => {
      const prompt1 = buildPrompt(3, 'prompt-1');
      const prompt2 = buildPrompt(3, 'prompt-2');

      stateMachine.setPrompt(prompt1);
      stateMachine.setPrompt(prompt2);

      expect(stateMachine.history()).toHaveLength(2);
      expect(stateMachine.history()[0].id).toBe('prompt-1');
      expect(stateMachine.history()[1].id).toBe('prompt-2');
    });
  });

  describe('Session Management', () => {
    it('should set and get session ID', () => {
      stateMachine.setSessionId('session-123');
      expect(stateMachine.sessionId()).toBe('session-123');

      stateMachine.setSessionId(null);
      expect(stateMachine.sessionId()).toBeNull();
    });
  });

  describe('Validation', () => {
    it('should set and clear validation errors', () => {
      stateMachine.setValidationError('validation failed');
      expect(stateMachine.validationError()).toBe('validation failed');

      stateMachine.setValidationError(null);
      expect(stateMachine.validationError()).toBeNull();
    });

    it('should clear validation error on new selection', () => {
      stateMachine.setValidationError('error');
      stateMachine.recordSelection('prompt-1', 'opt-0');

      expect(stateMachine.validationError()).toBeNull();
    });
  });

  describe('State Validation', () => {
    it('should check if transition is valid', () => {
      expect(stateMachine.canTransitionTo('loading')).toBe(true);
      expect(stateMachine.canTransitionTo('prompting')).toBe(false);

      stateMachine.start('test');
      expect(stateMachine.canTransitionTo('prompting')).toBe(true);
      expect(stateMachine.canTransitionTo('completed')).toBe(false);
    });

    it('should allow reset from any state', () => {
      const prompt = buildPrompt(2);

      stateMachine.start('test');
      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');

      stateMachine.reset();

      expect(stateMachine.workflowState()).toBe('idle');
      expect(stateMachine.currentPrompt()).toBeNull();
      expect(stateMachine.selectionCount()).toBe(0);
      expect(stateMachine.sessionId()).toBeNull();
      expect(stateMachine.validationError()).toBeNull();
      expect(stateMachine.history()).toHaveLength(0);
    });
  });

  describe('State Snapshot', () => {
    it('should return complete state snapshot', () => {
      const prompt = buildPrompt(3);

      stateMachine.start('test intent');
      stateMachine.setPrompt(prompt);
      stateMachine.recordSelection(prompt.id, 'opt-0');
      stateMachine.setSessionId('session-123');

      const snapshot = stateMachine.getStateSnapshot();

      expect(snapshot.workflowState).toBe('ready');
      expect(snapshot.intent).toBe('test intent');
      expect(snapshot.currentPrompt).toEqual(prompt);
      expect(snapshot.selections).toEqual({ [prompt.id]: 'opt-0' });
      expect(snapshot.sessionId).toBe('session-123');
    });
  });

  describe('Legacy API Compatibility', () => {
    it('should support selectOption (deprecated)', () => {
      const prompt = buildPrompt(2);
      stateMachine.setPrompt(prompt);

      // Should work with current prompt
      stateMachine.selectOption('opt-0');
      expect(stateMachine.getSelection(prompt.id)).toBe('opt-0');

      // Should warn when no prompt
      stateMachine.setPrompt(null);
      expect(() => stateMachine.selectOption('opt-0')).not.toThrow();
    });

    it('should support reportError (deprecated)', () => {
      stateMachine.reportError('test error');
      expect(stateMachine.errorMessage()).toBe('test error');
    });

    it('should support markReady (deprecated)', () => {
      const prompt = buildPrompt(2);
      stateMachine.start('test');
      stateMachine.setPrompt(prompt);

      // Should not throw, just warn
      expect(() => stateMachine.markReady(true)).not.toThrow();
      // Readiness is auto-calculated
      expect(stateMachine.isReadyToGenerate()).toBe(false);

      // Actually make it ready
      stateMachine.recordSelection(prompt.id, 'opt-0');
      expect(stateMachine.isReadyToGenerate()).toBe(true);
    });

    it('should support setReady (deprecated)', () => {
      const prompt = buildPrompt(2);
      stateMachine.start('test');
      stateMachine.setPrompt(prompt);

      // Should not throw, just warn
      expect(() => stateMachine.setReady(true)).not.toThrow();
      // Readiness is auto-calculated
      expect(stateMachine.isReadyToGenerate()).toBe(false);
    });
  });
});
