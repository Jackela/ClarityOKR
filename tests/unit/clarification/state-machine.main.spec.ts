import type { ClarificationSession, ClarificationStatus } from '@clarityokr/contracts';
import { ClarificationStateMachine } from '@clarityokr/main/clarification/clarification-state-machine';
import { StateTransitionError } from '@clarityokr/main/clarification/types';

/**
 * Factory function to create a test ClarificationSession
 */
function createMockSession(overrides: Partial<ClarificationSession> = {}): ClarificationSession {
  const now = new Date().toISOString();
  return {
    id: 'test-session-001',
    initialIntent: 'Test intent',
    status: 'collecting',
    createdAt: now,
    updatedAt: now,
    steps: [],
    selectedOptionIds: [],
    confidence: 0,
    pendingQuestionId: null,
    ...overrides,
  };
}

describe('ClarificationStateMachine (Main Process)', () => {
  let stateMachine: ClarificationStateMachine;

  beforeEach(() => {
    stateMachine = new ClarificationStateMachine();
  });

  // ============================================================================
  // INITIAL STATE BEHAVIOR
  // ============================================================================
  describe('Initial State Behavior', () => {
    it('should return the current state from session', () => {
      const collectingSession = createMockSession({ status: 'collecting' });
      const readySession = createMockSession({ status: 'ready' });
      const completedSession = createMockSession({ status: 'completed' });

      expect(stateMachine.getState(collectingSession)).toBe('collecting');
      expect(stateMachine.getState(readySession)).toBe('ready');
      expect(stateMachine.getState(completedSession)).toBe('completed');
    });

    it('should correctly identify allowed transitions from collecting', () => {
      expect(stateMachine.getAllowedTransitions('collecting')).toEqual(['ready', 'completed']);
    });

    it('should correctly identify allowed transitions from ready', () => {
      expect(stateMachine.getAllowedTransitions('ready')).toEqual(['collecting', 'completed']);
    });

    it('should return empty array for completed state (terminal)', () => {
      expect(stateMachine.getAllowedTransitions('completed')).toEqual([]);
    });
  });

  // ============================================================================
  // VALID STATE TRANSITIONS
  // ============================================================================
  describe('Valid State Transitions', () => {
    describe('collecting -> ready', () => {
      it('should successfully transition from collecting to ready', async () => {
        const session = createMockSession({ status: 'collecting' });
        const originalUpdatedAt = session.updatedAt;

        await stateMachine.transition(session, 'ready');

        expect(session.status).toBe('ready');
        expect(new Date(session.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(originalUpdatedAt).getTime());
      });

      it('should update updatedAt timestamp on transition', async () => {
        const session = createMockSession({ status: 'collecting' });
        const beforeTransition = new Date().toISOString();
        
        await new Promise(resolve => setTimeout(resolve, 10));
        await stateMachine.transition(session, 'ready');
        
        expect(new Date(session.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(beforeTransition).getTime(),
        );
      });
    });

    describe('collecting -> completed', () => {
      it('should successfully transition from collecting to completed', async () => {
        const session = createMockSession({ status: 'collecting' });

        await stateMachine.transition(session, 'completed');

        expect(session.status).toBe('completed');
      });
    });

    describe('ready -> collecting', () => {
      it('should successfully transition from ready back to collecting', async () => {
        const session = createMockSession({ status: 'ready' });

        await stateMachine.transition(session, 'collecting');

        expect(session.status).toBe('collecting');
      });
    });

    describe('ready -> completed', () => {
      it('should successfully transition from ready to completed', async () => {
        const session = createMockSession({ status: 'ready' });

        await stateMachine.transition(session, 'completed');

        expect(session.status).toBe('completed');
      });
    });
  });

  // ============================================================================
  // INVALID STATE TRANSITIONS (SHOULD THROW ERRORS)
  // ============================================================================
  describe('Invalid State Transitions (Error Cases)', () => {
    describe('completed is terminal - no outgoing transitions', () => {
      it('should throw StateTransitionError when trying to transition from completed to collecting', async () => {
        const session = createMockSession({ status: 'completed' });
        const expectedMessage = 'Invalid state transition from "completed" to "collecting"';

        await expect(stateMachine.transition(session, 'collecting')).rejects.toThrow(expectedMessage);
      });

      it('should throw StateTransitionError when trying to transition from completed to ready', async () => {
        const session = createMockSession({ status: 'completed' });
        const expectedMessage = 'Invalid state transition from "completed" to "ready"';

        await expect(stateMachine.transition(session, 'ready')).rejects.toThrow(expectedMessage);
      });

      it('should throw StateTransitionError when trying to transition from completed to completed', async () => {
        const session = createMockSession({ status: 'completed' });
        const expectedMessage = 'Invalid state transition from "completed" to "completed"';

        await expect(stateMachine.transition(session, 'completed')).rejects.toThrow(expectedMessage);
      });
    });

    describe('self-transitions are not allowed', () => {
      it('should throw StateTransitionError when trying to transition from collecting to collecting', async () => {
        const session = createMockSession({ status: 'collecting' });
        const expectedMessage = 'Invalid state transition from "collecting" to "collecting"';

        await expect(stateMachine.transition(session, 'collecting')).rejects.toThrow(expectedMessage);
      });

      it('should throw StateTransitionError when trying to transition from ready to ready', async () => {
        const session = createMockSession({ status: 'ready' });
        const expectedMessage = 'Invalid state transition from "ready" to "ready"';

        await expect(stateMachine.transition(session, 'ready')).rejects.toThrow(expectedMessage);
      });
    });
  });

  // ============================================================================
  // canTransition() METHOD TESTS
  // ============================================================================
  describe('canTransition() Method', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.canTransition('collecting', 'ready')).toBe(true);
      expect(stateMachine.canTransition('collecting', 'completed')).toBe(true);
      expect(stateMachine.canTransition('ready', 'collecting')).toBe(true);
      expect(stateMachine.canTransition('ready', 'completed')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      // Completed is terminal
      expect(stateMachine.canTransition('completed', 'collecting')).toBe(false);
      expect(stateMachine.canTransition('completed', 'ready')).toBe(false);
      expect(stateMachine.canTransition('completed', 'completed')).toBe(false);

      // Self-transitions not allowed
      expect(stateMachine.canTransition('collecting', 'collecting')).toBe(false);
      expect(stateMachine.canTransition('ready', 'ready')).toBe(false);
    });

    it('should be consistent with actual transition behavior', async () => {
      const testCases: Array<[ClarificationStatus, ClarificationStatus]> = [
        ['collecting', 'ready'],
        ['collecting', 'completed'],
        ['ready', 'collecting'],
        ['ready', 'completed'],
      ];

      for (const [fromState, toState] of testCases) {
        const session = createMockSession({ status: fromState });
        
        expect(stateMachine.canTransition(fromState, toState)).toBe(true);
        
        // Should not throw
        await expect(stateMachine.transition(session, toState)).resolves.not.toThrow();
        expect(session.status).toBe(toState);
      }
    });

    it('should be consistent with transition errors for invalid transitions', async () => {
      const invalidCases: Array<[ClarificationStatus, ClarificationStatus]> = [
        ['completed', 'collecting'],
        ['completed', 'ready'],
        ['completed', 'completed'],
        ['collecting', 'collecting'],
        ['ready', 'ready'],
      ];

      for (const [fromState, toState] of invalidCases) {
        const session = createMockSession({ status: fromState });
        
        expect(stateMachine.canTransition(fromState, toState)).toBe(false);
        
        await expect(
          stateMachine.transition(session, toState),
        ).rejects.toThrow(StateTransitionError);
      }
    });
  });

  // ============================================================================
  // getAllowedTransitions() METHOD TESTS
  // ============================================================================
  describe('getAllowedTransitions() Method', () => {
    it('should return mutable copy of allowed transitions (defensive copy)', () => {
      const allowed = stateMachine.getAllowedTransitions('collecting');
      
      // Modify the returned array
      allowed.push('completed' as ClarificationStatus);
      
      // Original should be unaffected
      expect(stateMachine.getAllowedTransitions('collecting')).toEqual(['ready', 'completed']);
    });

    it('should return correct transitions for each state', () => {
      expect(stateMachine.getAllowedTransitions('collecting')).toContain('ready');
      expect(stateMachine.getAllowedTransitions('collecting')).toContain('completed');
      expect(stateMachine.getAllowedTransitions('collecting')).toHaveLength(2);

      expect(stateMachine.getAllowedTransitions('ready')).toContain('collecting');
      expect(stateMachine.getAllowedTransitions('ready')).toContain('completed');
      expect(stateMachine.getAllowedTransitions('ready')).toHaveLength(2);

      expect(stateMachine.getAllowedTransitions('completed')).toHaveLength(0);
    });
  });

  // ============================================================================
  // STATE TRANSITION ERROR BEHAVIOR
  // ============================================================================
  describe('StateTransitionError Behavior', () => {
    it('should create error with correct message format', () => {
      const error = new StateTransitionError('collecting', 'invalid');
      expect(error.message).toBe('Invalid state transition from "collecting" to "invalid"');
      expect(error.name).toBe('StateTransitionError');
    });

    it('should be instance of ClarificationError', async () => {
      const session = createMockSession({ status: 'completed' });

      await expect(stateMachine.transition(session, 'collecting')).rejects.toBeInstanceOf(StateTransitionError);
    });

    it('should preserve session state when transition fails', async () => {
      const session = createMockSession({ status: 'completed' });
      const originalStatus = session.status;
      const originalUpdatedAt = session.updatedAt;

      await expect(stateMachine.transition(session, 'collecting')).rejects.toThrow();

      expect(session.status).toBe(originalStatus);
      expect(session.updatedAt).toBe(originalUpdatedAt);
    });
  });

  // ============================================================================
  // EDGE CASES AND BOUNDARY CONDITIONS
  // ============================================================================
  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle sessions with minimal required fields', async () => {
      const minimalSession: ClarificationSession = {
        id: 'minimal',
        initialIntent: '',
        status: 'collecting',
        createdAt: '',
        updatedAt: '',
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
      };

      await stateMachine.transition(minimalSession, 'ready');
      expect(minimalSession.status).toBe('ready');
    });

    it('should handle sessions with complex data', async () => {
      const complexSession = createMockSession({
        id: 'complex-session-with-many-fields',
        initialIntent: 'Complex multi-step intent with special chars: ñ 中文 🎉',
        status: 'collecting',
        steps: [
          {
            id: 'step-1',
            question: 'What is your goal?',
            sequence: 0,
            context: 'goal-definition',
            options: [
              { id: 'opt-1', label: 'Option 1', scopeTag: 'tag1' },
              { id: 'opt-2', label: 'Option 2', scopeTag: 'tag2', description: 'With description' },
            ],
          },
        ],
        selectedOptionIds: ['opt-1', 'opt-2'],
        confidence: 0.95,
        pendingQuestionId: 'step-2',
      });

      await stateMachine.transition(complexSession, 'ready');
      await stateMachine.transition(complexSession, 'completed');
      
      expect(complexSession.status).toBe('completed');
    });

    it('should handle rapid successive transitions', async () => {
      const session = createMockSession({ status: 'collecting' });

      await stateMachine.transition(session, 'ready');
      await stateMachine.transition(session, 'collecting');
      await stateMachine.transition(session, 'ready');
      await stateMachine.transition(session, 'completed');

      expect(session.status).toBe('completed');
    });

    it('should maintain session immutability for ID and createdAt', async () => {
      const session = createMockSession({
        id: 'immutable-id',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      await stateMachine.transition(session, 'ready');

      expect(session.id).toBe('immutable-id');
      expect(session.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  // ============================================================================
  // COMPLETE STATE TRANSITION MATRIX TESTS
  // ============================================================================
  describe('Complete State Transition Matrix', () => {
    const allStates: ClarificationStatus[] = ['collecting', 'ready', 'completed'];

    it('should cover all possible state combinations', () => {
      const expectedMatrix: Record<ClarificationStatus, ClarificationStatus[]> = {
        collecting: ['ready', 'completed'],
        ready: ['collecting', 'completed'],
        completed: [],
      };

      for (const fromState of allStates) {
        const allowed = stateMachine.getAllowedTransitions(fromState);
        expect(allowed.sort()).toEqual(expectedMatrix[fromState].sort());
      }
    });

    it('should correctly implement the full transition matrix', async () => {
      // Test all valid transitions
      const validTransitions: Array<[ClarificationStatus, ClarificationStatus]> = [
        ['collecting', 'ready'],
        ['collecting', 'completed'],
        ['ready', 'collecting'],
        ['ready', 'completed'],
      ];

      for (const [from, to] of validTransitions) {
        const session = createMockSession({ status: from });
        await expect(stateMachine.transition(session, to)).resolves.not.toThrow();
      }

      // Test all invalid transitions
      const invalidTransitions: Array<[ClarificationStatus, ClarificationStatus]> = [
        ['completed', 'collecting'],
        ['completed', 'ready'],
        ['completed', 'completed'],
        ['collecting', 'collecting'],
        ['ready', 'ready'],
      ];

      for (const [from, to] of invalidTransitions) {
        const session = createMockSession({ status: from });
        await expect(stateMachine.transition(session, to)).rejects.toThrow(StateTransitionError);
      }
    });
  });

  // ============================================================================
  // INTERFACE COMPLIANCE
  // ============================================================================
  describe('IClarificationStateMachine Interface Compliance', () => {
    it('should implement all required interface methods', () => {
      expect(typeof stateMachine.transition).toBe('function');
      expect(typeof stateMachine.getState).toBe('function');
      expect(typeof stateMachine.canTransition).toBe('function');
      expect(typeof stateMachine.getAllowedTransitions).toBe('function');
    });

    it('should return Promise<void> from transition', async () => {
      const session = createMockSession({ status: 'collecting' });
      const result = stateMachine.transition(session, 'ready');
      
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });
  });
});
