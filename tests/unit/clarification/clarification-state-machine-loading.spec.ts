import { Logger } from '@clarityokr/renderer/app/core/services/logger.service';
import { ClarificationStateMachine } from '@clarityokr/renderer/app/clarification/services/clarification-state-machine.service';

describe('ClarificationStateMachine loading flag', () => {
  let stateMachine: ClarificationStateMachine;

  beforeEach(() => {
    const logger = new Logger();
    stateMachine = new ClarificationStateMachine(logger);
  });

  it('should set isLoading to true via setLoading(true)', () => {
    expect(stateMachine.isLoading()).toBe(false);

    stateMachine.setLoading(true);
    expect(stateMachine.isLoading()).toBe(true);
  });

  it('should set isLoading to false via setLoading(false)', () => {
    stateMachine.setLoading(true);
    expect(stateMachine.isLoading()).toBe(true);

    stateMachine.setLoading(false);
    expect(stateMachine.isLoading()).toBe(false);
  });

  it('should set isLoading to true on start()', () => {
    stateMachine.start('test intent');
    expect(stateMachine.isLoading()).toBe(true);
    expect(stateMachine.workflowState()).toBe('loading');
  });

  it('should clear isLoading on setPrompt()', () => {
    stateMachine.start('test');
    expect(stateMachine.isLoading()).toBe(true);

    stateMachine.setPrompt({
      id: 'p1',
      question: 'test',
      sequence: 0,
      context: 'test',
      options: [{ id: 'opt-0', label: 'Option 1', scopeTag: 'test' }],
    });
    expect(stateMachine.isLoading()).toBe(false);
  });

  it('should clear isLoading on setError()', () => {
    stateMachine.setLoading(true);
    expect(stateMachine.isLoading()).toBe(true);

    stateMachine.setError('error');
    expect(stateMachine.isLoading()).toBe(false);
  });

  it('should set isLoading on setGenerating()', () => {
    const prompt = {
      id: 'p1',
      question: 'test',
      sequence: 0,
      context: 'test',
      options: [{ id: 'opt-0', label: 'Option 1', scopeTag: 'test' }],
    };

    stateMachine.start('test');
    stateMachine.setPrompt(prompt);
    stateMachine.recordSelection(prompt.id, 'opt-0');
    expect(stateMachine.isLoading()).toBe(false);

    stateMachine.setGenerating();
    expect(stateMachine.isLoading()).toBe(true);
  });

  it('should clear isLoading on setCompleted()', () => {
    stateMachine.start('test');
    stateMachine.setGenerating();
    expect(stateMachine.isLoading()).toBe(true);

    stateMachine.setCompleted({ objectives: [] });
    expect(stateMachine.isLoading()).toBe(false);
  });

  it('should clear validationError when starting loading', () => {
    stateMachine.setValidationError('some error');
    expect(stateMachine.validationError()).toBe('some error');

    stateMachine.setLoading(true);
    expect(stateMachine.validationError()).toBeNull();
  });
});
