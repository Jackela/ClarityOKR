import { stateMachineReducer, validateTransition } from './clarification-state-machine.reducer';
import { INITIAL_STATE } from './clarification-state-machine.config';
import type { StateAction } from './clarification-state-machine.types';
import { Logger } from '../../core/services/logger.service';
import { environment } from '../../../environments/environment';

describe('Exported clarification reducer workflow contract', () => {
  const logger = new Logger();
  it('retains answers across an error and completes a subsequent generation', () => {
    const actions: StateAction[] = [
      { type: 'START', payload: { intent: 'Improve deliveries' } },
      { type: 'SET_SESSION_ID', payload: { sessionId: 'synthetic' } },
      { type: 'SET_VALIDATION_ERROR', payload: { message: 'Choose one' } },
      { type: 'SET_LOADING', payload: { loading: true } },
      {
        type: 'SET_PROMPT',
        payload: {
          prompt: {
            id: 'p',
            question: 'Priority?',
            sequence: 0,
            context: 'goal-dimension',
            options: [{ id: 'a', label: 'Speed', scopeTag: 'speed' }],
          },
        },
      },
      { type: 'RECORD_SELECTION', payload: { promptId: 'p', optionId: 'a' } },
      { type: 'SET_LOADING', payload: { loading: true } },
      { type: 'SET_ERROR', payload: { error: { message: 'Offline', recoverable: true } } },
    ];
    let state = actions.reduce(
      (value, action) => stateMachineReducer(value, action, logger),
      INITIAL_STATE,
    );
    expect(state).toMatchObject({
      workflowState: 'error',
      selections: { p: 'a' },
      isLoading: false,
      sessionId: 'synthetic',
      isReadyToGenerate: true,
      validationError: null,
    });
    state = stateMachineReducer(state, { type: 'SET_ERROR', payload: { error: null } }, logger);
    state = stateMachineReducer(state, { type: 'CLEAR_ERROR' }, logger);
    expect(state).toMatchObject({ workflowState: 'idle', selections: { p: 'a' }, error: null });
    state = stateMachineReducer(state, { type: 'SET_LOADING', payload: { loading: true } }, logger);
    state = stateMachineReducer(
      state,
      { type: 'SET_INTENT', payload: { intent: 'Updated' } },
      logger,
    );
    state = stateMachineReducer(state, { type: 'SET_PROMPT', payload: { prompt: null } }, logger);
    state = stateMachineReducer(
      state,
      { type: 'SET_LOADING', payload: { loading: false } },
      logger,
    );
    state = stateMachineReducer(state, { type: 'SET_GENERATING' }, logger);
    state = stateMachineReducer(state, { type: 'SET_COMPLETED', payload: {} }, logger);
    expect(state).toMatchObject({
      workflowState: 'completed',
      intent: 'Updated',
      selections: { p: 'a' },
      isLoading: false,
    });
    state = stateMachineReducer(state, { type: 'CLEAR_ERROR' }, logger);
    expect(state.workflowState).toBe('completed');
    expect(stateMachineReducer(state, { type: 'RESET' }, logger)).toEqual(INITIAL_STATE);
  });

  it('rejects an invalid development transition and retains state in production', () => {
    const completed = { ...INITIAL_STATE, workflowState: 'completed' as const };
    expect(() => validateTransition(INITIAL_STATE, completed, logger)).toThrow(
      'Invalid state transition',
    );
    environment.production = true;
    try {
      expect(validateTransition(INITIAL_STATE, completed, logger)).toBe(INITIAL_STATE);
      expect(
        validateTransition(INITIAL_STATE, { ...INITIAL_STATE, intent: 'Same state' }, logger)
          .intent,
      ).toBe('Same state');
    } finally {
      environment.production = false;
    }
  });
});
