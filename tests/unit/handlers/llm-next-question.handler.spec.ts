import type { SessionManager } from '../../../app/main/src/services/session-manager.service.js';
import type { OkrRepository } from '../../../app/main/src/persistence/okr-repository.js';
import type { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';
import { LlmNextQuestionHandler } from '../../../app/main/src/handlers/llm-next-question.handler.js';
import type { ClarificationSession } from '@clarityokr/contracts';

describe('LlmNextQuestionHandler', () => {
  let handler: LlmNextQuestionHandler;
  let mockSessionManager: jasmine.SpyObj<SessionManager>;
  let mockOkrAgentService: jasmine.SpyObj<OkrAgentService>;
  let mockElectron: any;
  let sentMessages: any[];

  beforeEach(() => {
    mockSessionManager = jasmine.createSpyObj('SessionManager', ['loadFromPersistence', 'addStep']);
    mockOkrAgentService = jasmine.createSpyObj('OkrAgentService', ['getNextQuestion']);
    sentMessages = [];
    mockElectron = {
      webContents: {
        getAllWebContents: () => [
          {
            send: (channel: string, payload: any) => {
              sentMessages.push({ channel, payload });
            },
          },
        ],
      },
    };

    handler = new LlmNextQuestionHandler(mockSessionManager, mockOkrAgentService, mockElectron);
  });

  it('should return question and broadcast prompt', async () => {
    const session: ClarificationSession = {
      id: 'session-1',
      initialIntent: 'Test',
      status: 'collecting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [],
      selectedOptionIds: [],
      confidence: 0,
      pendingQuestionId: null,
    };

    mockOkrAgentService.getNextQuestion.and.returnValue(
      Promise.resolve({
        question: {
          id: 'q2',
          text: 'Follow up question?',
          options: [
            { id: 'opt1', label: 'Yes' },
            { id: 'opt2', label: 'No' },
          ],
        },
      }),
    );
    mockSessionManager.loadFromPersistence.and.returnValue(Promise.resolve(session));
    mockSessionManager.addStep.and.returnValue(Promise.resolve());

    const result = await handler.handle({
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'opt1' },
    });

    expect(result.question).toBeDefined();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].channel).toBe('clarityokr:clarification:prompt');
  });

  it('should return data when no more questions', async () => {
    mockOkrAgentService.getNextQuestion.and.returnValue(
      Promise.resolve({
        question: null,
      }),
    );

    const result = await handler.handle({
      context: { turns: [] },
      lastChoice: { questionId: 'q1', optionId: 'opt1' },
    });

    expect(result.question).toBeNull();
  });

  it('should handle errors from LLM service', async () => {
    mockOkrAgentService.getNextQuestion.and.returnValue(Promise.reject(new Error('API error')));

    await expectAsync(
      handler.handle({
        context: { turns: [] },
        lastChoice: { questionId: 'q1', optionId: 'opt1' },
      }),
    ).toBeRejectedWithError('Failed to get next question: API error');
  });
});
