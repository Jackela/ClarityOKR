import { ClarificationController } from '../../../app/main/src/windows/clarification-controller.js';
import type { SessionRepository } from '../../../app/main/src/persistence/session-repository.js';
import type { OkrRepository } from '../../../app/main/src/persistence/okr-repository.js';
import type { ActionLogWriter } from '../../../app/main/src/persistence/action-log-writer.js';
import type { StickyWindowManager } from '../../../app/main/src/windows/sticky-window-manager.js';
import type { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';
import type { OKRDocument } from '@clarityokr/contracts';

describe('ClarificationController', () => {
  let controller: ClarificationController;
  let mockSessionRepository: jasmine.SpyObj<SessionRepository>;
  let mockOkrRepository: jasmine.SpyObj<OkrRepository>;
  let mockActionLogWriter: jasmine.SpyObj<ActionLogWriter>;
  let mockStickyWindowManager: jasmine.SpyObj<StickyWindowManager>;
  let mockOkrAgentService: jasmine.SpyObj<OkrAgentService>;
  let mockElectron: any;
  let ipcHandlers: Record<string, Function>;

  beforeEach(() => {
    mockSessionRepository = jasmine.createSpyObj('SessionRepository', ['load', 'saveSession']);
    mockOkrRepository = jasmine.createSpyObj('OkrRepository', ['loadLatest', 'save']);
    mockActionLogWriter = jasmine.createSpyObj('ActionLogWriter', ['append']);
    mockStickyWindowManager = jasmine.createSpyObj('StickyWindowManager', ['open']);
    mockOkrAgentService = jasmine.createSpyObj('OkrAgentService', [
      'getNextQuestion',
      'generateDraft',
    ]);

    ipcHandlers = {};
    mockElectron = {
      ipcMain: {
        handle: (channel: string, handler: Function) => {
          ipcHandlers[channel] = handler;
        },
        on: (channel: string, handler: Function) => {
          ipcHandlers[channel] = handler;
        },
      },
      webContents: {
        getAllWebContents: () => [
          {
            send: () => {},
          },
        ],
      },
    };

    controller = new ClarificationController(
      mockSessionRepository,
      mockOkrRepository,
      mockActionLogWriter,
      mockStickyWindowManager,
      mockOkrAgentService,
      mockElectron,
    );
  });

  it('should register all IPC handlers', () => {
    expect(ipcHandlers['clarityokr:clarification:prompt']).toBeDefined();
    expect(ipcHandlers['clarityokr:clarification:respond']).toBeDefined();
    expect(ipcHandlers['clarityokr:okr:generate']).toBeDefined();
    expect(ipcHandlers['clarityokr:sticky:reopen']).toBeDefined();
    expect(ipcHandlers['clarityokr:okr:latest']).toBeDefined();
    expect(ipcHandlers['clarityokr:llm:next-question']).toBeDefined();
    expect(ipcHandlers['clarityokr:llm:generate-draft']).toBeDefined();
  });

  describe('TestMode API', () => {
    it('resetSessions should clear all sessions', () => {
      controller.resetSessions();
      expect(controller.getSessionCount()).toBe(0);
    });

    it('getAllSessions should return sessions map', () => {
      const sessions = controller.getAllSessions();
      expect(sessions).toBeInstanceOf(Map);
    });

    it('getCurrentSessionId should return null initially', () => {
      expect(controller.getCurrentSessionId()).toBeNull();
    });

    it('getSessionCount should return 0 initially', () => {
      expect(controller.getSessionCount()).toBe(0);
    });
  });

  describe('OKR_LATEST handler', () => {
    it('should return latest OKR', async () => {
      const mockOkr: OKRDocument = {
        id: 'okr-1',
        objective: 'Test Objective',
        keyResults: [],
        sourceSessionId: 'session-1',
        generatedAt: new Date().toISOString(),
        lastEditedAt: null,
        regenerationPolicy: 'append',
        manualEdits: [],
      };
      mockOkrRepository.loadLatest.and.returnValue(Promise.resolve(mockOkr));

      const handler = ipcHandlers['clarityokr:okr:latest'];
      const result = await handler();

      expect(result).toEqual(mockOkr);
    });

    it('should return null when no OKR exists', async () => {
      mockOkrRepository.loadLatest.and.returnValue(Promise.resolve(null));

      const handler = ipcHandlers['clarityokr:okr:latest'];
      const result = await handler();

      expect(result).toBeNull();
    });
  });

  describe('STICKY_REOPEN handler', () => {
    it('should reopen sticky window with latest OKR', async () => {
      const mockOkr: OKRDocument = {
        id: 'okr-1',
        objective: 'Test',
        keyResults: [],
        sourceSessionId: 'session-1',
        generatedAt: new Date().toISOString(),
        lastEditedAt: null,
        regenerationPolicy: 'append',
        manualEdits: [],
      };
      mockOkrRepository.loadLatest.and.returnValue(Promise.resolve(mockOkr));
      mockStickyWindowManager.open.and.returnValue(Promise.resolve());

      const handler = ipcHandlers['clarityokr:sticky:reopen'];
      const result = await handler();

      expect(result.success).toBeTrue();
      expect(mockStickyWindowManager.open).toHaveBeenCalledWith(mockOkr);
    });

    it('should return failure when no OKR exists', async () => {
      mockOkrRepository.loadLatest.and.returnValue(Promise.resolve(null));

      const handler = ipcHandlers['clarityokr:sticky:reopen'];
      const result = await handler();

      expect(result.success).toBeFalse();
    });
  });
});
