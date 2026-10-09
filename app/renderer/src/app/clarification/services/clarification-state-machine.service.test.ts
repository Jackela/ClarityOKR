import { ClarificationStateMachine } from './clarification-state-machine.service';
import { environment } from '../../../environments/environment';
import { Logger } from '../../core/services/logger.service';
import type { ClarificationPrompt } from '@clarityokr/contracts';

const prompt: ClarificationPrompt = {
  id: 'priority',
  question: 'Which priority?',
  sequence: 0,
  context: 'goal-dimension',
  options: [
    { id: 'speed', label: 'Speed', scopeTag: 'speed' },
    { id: 'quality', label: 'Quality', scopeTag: 'quality' },
  ],
};
describe.each([['application state machine', ClarificationStateMachine]] as const)(
  'Actual %s workflow contract',
  (_name, Constructor) => {
    let state: ClarificationStateMachine;
    beforeEach(() => {
      state = new Constructor(new Logger());
    });

    it('keeps invalid transitions atomic and completes a valid workflow', () => {
      expect(state.workflowState()).toBe('idle');
      expect(state.currentSelection()).toBeNull();
      expect(state.hasPrompt()).toBe(false);
      expect(state.canTransitionTo('completed')).toBe(false);
      expect(() => state.setCompleted()).toThrow('Invalid state transition');
      expect(state.workflowState()).toBe('idle');
      state.start('Improve deliveries');
      state.setSessionId('session-1');
      state.setPrompt(prompt);
      expect(state.hasPrompt()).toBe(true);
      expect(state.currentSelection()).toBeNull();
      state.recordSelection(prompt.id, 'speed');
      state.recordSelection(prompt.id, 'quality');
      expect(state.workflowState()).toBe('ready');
      expect(state.selectionCount()).toBe(1);
      expect(state.selections()).toEqual({ priority: 'quality' });
      expect(state.selectedOptionIds()).toEqual(['quality']);
      expect(state.hasSelection('missing')).toBe(false);
      expect(state.getSelection('missing')).toBeNull();
      expect(state.hasSelection(prompt.id)).toBe(true);
      expect(state.getSelection(prompt.id)).toBe('quality');
      expect(state.currentSelection()).toBe('quality');
      expect(state.isReadyToGenerate()).toBe(true);
      expect(state.history()).toEqual([prompt]);
      state.setGenerating();
      expect(state.isLoading()).toBe(true);
      state.setCompleted({ objectives: [] });
      expect(state.isLoading()).toBe(false);
      expect(state.workflowState()).toBe('completed');
      state.reset();
      expect(state.sessionId()).toBeNull();
      expect(state.intent()).toBe('');
      expect(state.history()).toEqual([]);
      expect(state.selections()).toEqual({});
    });

    it('retains choices on recoverable errors and clears only requested fields', () => {
      state.start('original');
      state.setPrompt(prompt);
      state.recordSelection(prompt.id, 'speed');
      state.setValidationError('Select one');
      state.setLoading(true, 'revised');
      expect(state.validationError()).toBeNull();
      expect(state.intent()).toBe('revised');
      state.setError('Network offline');
      expect(state.hasError()).toBe(true);
      expect(state.errorMessage()).toBe('Network offline');
      expect(state.error()?.recoverable).toBe(true);
      expect(state.getSelection(prompt.id)).toBe('speed');
      state.clearError();
      expect(state.workflowState()).toBe('idle');
      expect(state.hasError()).toBe(false);
      state.setLoading(true);
      state.setError({ message: 'Invalid document', recoverable: false });
      expect(state.error()?.recoverable).toBe(false);
      state.setError(null);
      expect(state.errorMessage()).toBeNull();
      expect(state.workflowState()).toBe('error');
      state.clearError();
      state.setPrompt(null);
      state.setIntent('another');
      state.setValidationError(null);
      state.setSessionId(null);
      state.setLoading(false, 'ignored');
      expect(state.getStateSnapshot()).toMatchObject({
        workflowState: 'idle',
        intent: 'another',
        currentPrompt: null,
        isLoading: false,
        sessionId: null,
        validationError: null,
      });
      state.clearError();
      expect(state.workflowState()).toBe('idle');
    });

    it('preserves the prior state for an invalid production transition', () => {
      environment.production = true;
      try {
        const before = state.getStateSnapshot();
        state.setCompleted();
        expect(state.getStateSnapshot()).toEqual(before);
        state.start('valid');
        state.setLoading(false);
        state.setPrompt(null);
        state.setError(null);
        expect(state.workflowState()).toBe('loading');
      } finally {
        environment.production = false;
      }
    });

    it('returns independent nested snapshots without changing live state or reset defaults', () => {
      const initial = state.getStateSnapshot();

      state.start('Improve deliveries');
      state.setPrompt({ ...prompt, options: prompt.options.map((option) => ({ ...option })) });
      state.recordSelection(prompt.id, 'speed');
      state.setError({ message: 'Network offline', recoverable: true });
      const snapshot = state.getStateSnapshot();
      snapshot.selections[prompt.id] = 'quality';
      if (!snapshot.currentPrompt || !snapshot.error)
        throw new Error('Expected populated snapshot');
      snapshot.currentPrompt.options[0].label = 'Changed snapshot option';
      snapshot.history[0].question = 'Changed snapshot question';
      snapshot.history.splice(0, 1);
      snapshot.error.message = 'Changed snapshot error';

      expect(state.getSelection(prompt.id)).toBe('speed');
      expect(state.currentPrompt()?.options[0].label).toBe('Speed');
      expect(state.currentPrompt()?.question).toBe('Which priority?');
      expect(state.history()).toHaveLength(1);
      expect(state.history()[0].question).toBe('Which priority?');
      expect(state.errorMessage()).toBe('Network offline');
      state.reset();
      expect(state.getStateSnapshot()).toEqual(initial);
      expect(initial.selections).not.toBe(state.selections());
      expect(initial.history).not.toBe(state.history());
    });
  },
);
