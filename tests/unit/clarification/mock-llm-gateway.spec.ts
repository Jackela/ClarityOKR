/**
 * MockLlmGateway Tests - Phase A: RED
 *
 * These tests verify that the Mock implementation can:
 * 1. Queue responses for testing
 * 2. Record all calls made to it
 * 3. Clear its state between tests
 * 4. Be created via factory function
 */

import type {
  ClarificationContext,
  LastChoice,
  NextQuestionResponse,
  DraftResponse,
} from '@clarityokr/contracts';
import { firstValueFrom } from 'rxjs';

import {
  createMockLlmGateway,
  type MockLlmGateway,
} from '../../../app/renderer/src/app/clarification/services/mock-llm-gateway.service.js';

describe('MockLlmGateway', () => {
  // Factory function using actual implementation
  const createMockLlmGatewayFactory = (): MockLlmGateway => {
    return createMockLlmGateway();
  };

  describe('Phase B: GREEN - Implementation tests', () => {
    test('should queue and return response for getNextQuestion', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const mockResponse: NextQuestionResponse = {
        question: {
          id: 'q-1',
          text: 'What is your goal?',
          options: [
            { id: 'opt-1', label: 'Option 1' },
            { id: 'opt-2', label: 'Option 2' },
          ],
        },
      };

      // Act & Assert - This should throw in RED phase
      mock.queueNextQuestionResponse(mockResponse);
      const context: ClarificationContext = { turns: [] };
      const lastChoice: LastChoice = { questionId: 'q-0', optionId: 'opt-1' };

      const result = await firstValueFrom(mock.getNextQuestion(context, lastChoice));

      expect(result).toEqual(mockResponse);
    });

    test('should queue and return response for generateDraft', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const mockResponse: DraftResponse = {
        okr: { objective: 'Test Objective' },
        session: { id: 'session-1' },
      };

      // Act & Assert
      mock.queueDraftResponse(mockResponse);
      const context: ClarificationContext = { turns: [] };

      const result = await firstValueFrom(mock.generateDraft(context));

      expect(result).toEqual(mockResponse);
    });

    test('should record all getNextQuestion calls', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const context1: ClarificationContext = {
        turns: [{ questionId: 'q-1', optionId: 'opt-1', timestamp: '2024-01-01' }],
      };
      const context2: ClarificationContext = {
        turns: [
          { questionId: 'q-1', optionId: 'opt-1', timestamp: '2024-01-01' },
          { questionId: 'q-2', optionId: 'opt-2', timestamp: '2024-01-02' },
        ],
      };
      const lastChoice1: LastChoice = { questionId: 'q-1', optionId: 'opt-1' };
      const lastChoice2: LastChoice = { questionId: 'q-2', optionId: 'opt-2' };

      // Act - Queue 2 responses for 2 calls
      mock.queueNextQuestionResponse({
        question: { id: 'q-2', text: 'Question 2', options: [] },
      });
      mock.queueNextQuestionResponse({
        question: { id: 'q-3', text: 'Question 3', options: [] },
      });
      await firstValueFrom(mock.getNextQuestion(context1, lastChoice1));
      await firstValueFrom(mock.getNextQuestion(context2, lastChoice2));

      // Assert
      const calls = mock.getNextQuestionCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ context: context1, lastChoice: lastChoice1 });
      expect(calls[1]).toEqual({ context: context2, lastChoice: lastChoice2 });
    });

    test('should record all generateDraft calls', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const context1: ClarificationContext = { turns: [] };
      const context2: ClarificationContext = {
        turns: [{ questionId: 'q-1', optionId: 'opt-1', timestamp: '2024-01-01' }],
      };

      // Act - Queue 2 responses for 2 calls
      mock.queueDraftResponse({ okr: {}, session: {} });
      mock.queueDraftResponse({ okr: {}, session: {} });
      await firstValueFrom(mock.generateDraft(context1));
      await firstValueFrom(mock.generateDraft(context2));

      // Assert
      const calls = mock.getGenerateDraftCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ context: context1 });
      expect(calls[1]).toEqual({ context: context2 });
    });

    test('should clear all state when clear() is called', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const context: ClarificationContext = { turns: [] };
      const lastChoice: LastChoice = { questionId: 'q-1', optionId: 'opt-1' };

      mock.queueNextQuestionResponse({
        question: { id: 'q-1', text: 'Question', options: [] },
      });
      await firstValueFrom(mock.getNextQuestion(context, lastChoice));

      // Verify state exists
      expect(mock.getNextQuestionCalls()).toHaveLength(1);

      // Act
      mock.clear();

      // Assert
      expect(mock.getNextQuestionCalls()).toHaveLength(0);
      expect(mock.getGenerateDraftCalls()).toHaveLength(0);
      // After clear, calling getNextQuestion without queued response should error
      await expect(firstValueFrom(mock.getNextQuestion(context, lastChoice))).rejects.toThrow();
    });

    test('should queue and throw error for getNextQuestion', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const error = new Error('Network error');
      const context: ClarificationContext = { turns: [] };
      const lastChoice: LastChoice = { questionId: 'q-1', optionId: 'opt-1' };

      // Act & Assert
      mock.queueNextQuestionError(error);
      await expect(firstValueFrom(mock.getNextQuestion(context, lastChoice))).rejects.toThrow(
        'Network error',
      );
    });

    test('should queue and throw error for generateDraft', async () => {
      // Arrange
      const mock = createMockLlmGatewayFactory();
      const error = new Error('Timeout');
      const context: ClarificationContext = { turns: [] };

      // Act & Assert
      mock.queueDraftError(error);
      await expect(firstValueFrom(mock.generateDraft(context))).rejects.toThrow('Timeout');
    });

    test('should create independent instances via factory', async () => {
      // Arrange
      const mock1 = createMockLlmGateway();
      const mock2 = createMockLlmGateway();

      // Act
      mock1.queueNextQuestionResponse({
        question: { id: 'q-1', text: 'Q1', options: [] },
      });

      // Assert
      const context: ClarificationContext = { turns: [] };
      const lastChoice: LastChoice = { questionId: 'q-0', optionId: 'opt-0' };

      // mock1 should work
      const result1 = await firstValueFrom(mock1.getNextQuestion(context, lastChoice));
      expect(result1.question.id).toBe('q-1');

      // mock2 should throw (no queued response)
      await expect(firstValueFrom(mock2.getNextQuestion(context, lastChoice))).rejects.toThrow();
    });
  });
});
