import { jest } from '@jest/globals';
import type { OKRDocument } from '@clarityokr/contracts';

// Mock Electron modules
const mockBrowserWindowInstances: MockBrowserWindow[] = [];

interface MockWebContents {
  send: jest.Mock;
  on: jest.Mock;
}

interface MockBrowserWindow {
  id: number;
  isDestroyed: jest.Mock;
  isAlwaysOnTop: jest.Mock;
  focus: jest.Mock;
  show: jest.Mock;
  loadFile: jest.Mock;
  setTitle: jest.Mock;
  setAlwaysOnTop: jest.Mock;
  setFullScreenable: jest.Mock;
  setVisibleOnAllWorkspaces: jest.Mock;
  on: jest.Mock;
  webContents: MockWebContents;
  _eventHandlers: Map<string, Function[]>;
  _triggerEvent: (event: string, ...args: unknown[]) => void;
}

const createMockBrowserWindow = (): MockBrowserWindow => {
  const eventHandlers = new Map<string, Function[]>();
  
  const mockWindow: MockBrowserWindow = {
    id: Math.random(),
    isDestroyed: jest.fn().mockReturnValue(false),
    isAlwaysOnTop: jest.fn().mockReturnValue(true),
    focus: jest.fn(),
    show: jest.fn(),
    loadFile: jest.fn().mockResolvedValue(undefined),
    setTitle: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setFullScreenable: jest.fn(),
    setVisibleOnAllWorkspaces: jest.fn(),
    on: jest.fn().mockImplementation((event: string, handler: Function) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockWindow;
    }),
    webContents: {
      send: jest.fn(),
      on: jest.fn().mockImplementation((event: string, handler: Function) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)!.push(handler);
        return mockWindow.webContents;
      }),
    },
    _eventHandlers: eventHandlers,
    _triggerEvent: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach(handler => handler(...args));
    },
  };
  
  mockBrowserWindowInstances.push(mockWindow);
  return mockWindow;
};

// Mock electron module
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => createMockBrowserWindow()),
}));

// Mock logger to suppress output
jest.mock('@clarityokr/main/core/logger', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock ipc-channels
jest.mock('@clarityokr/main/bootstrap/ipc-channels', () => ({
  IPCChannels: {
    OKR_GENERATE: 'okr:generate',
  },
}));

// Import after mocks
import { StickyWindowManager } from '@clarityokr/main/windows/sticky-window-manager';

describe('StickyWindowManager Unit Tests', () => {
  let manager: StickyWindowManager;
  let config: { preloadPath: string; rendererDistPath: string };
  let mockDocument: OKRDocument;

  beforeEach(() => {
    // Clear mock instances
    mockBrowserWindowInstances.length = 0;
    jest.clearAllMocks();
    
    config = {
      preloadPath: '/mock/preload.js',
      rendererDistPath: '/mock/renderer/dist',
    };
    
    mockDocument = {
      id: 'test-okr-123',
      objective: 'Improve team productivity',
      keyResults: [
        { id: 'kr-1', description: 'Reduce bug count by 50%', metrics: '', target: '50%', deadline: '2024-12-31' },
      ],
      sourceSessionId: 'session-456',
      generatedAt: new Date().toISOString(),
      regenerationPolicy: { type: 'conservative' },
      manualEdits: [],
    };
    
    manager = new StickyWindowManager(config);
  });

  afterEach(() => {
    mockBrowserWindowInstances.length = 0;
  });

  describe('Constructor', () => {
    it('should initialize with provided config', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('open()', () => {
    it('should create a new BrowserWindow with correct configuration', async () => {
      const { BrowserWindow } = await import('electron');
      
      await manager.open(mockDocument);
      
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      
      const windowOptions = (BrowserWindow as jest.Mock).mock.calls[0][0];
      
      // Verify window dimensions
      expect(windowOptions.width).toBe(420);
      expect(windowOptions.height).toBe(560);
      expect(windowOptions.minWidth).toBe(320);
      expect(windowOptions.minHeight).toBe(400);
      
      // Verify window styling
      expect(windowOptions.backgroundColor).toBe('#ffffff');
      expect(windowOptions.title).toBe('ClarityOKR Sticky');
      expect(windowOptions.alwaysOnTop).toBe(true);
      expect(windowOptions.type).toBe('toolbar');
      expect(windowOptions.titleBarStyle).toBe('hidden');
      expect(windowOptions.frame).toBe(false);
      
      // Verify security settings
      expect(windowOptions.webPreferences.contextIsolation).toBe(true);
      expect(windowOptions.webPreferences.nodeIntegration).toBe(false);
      expect(windowOptions.webPreferences.sandbox).toBe(true);
      expect(windowOptions.webPreferences.preload).toBe(config.preloadPath);
    });

    it('should configure always-on-top settings after window creation', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ClarityOKR Sticky');
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
      expect(mockWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    });

    it('should load renderer HTML file with sticky view parameter', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html'),
        { search: 'view=sticky' }
      );
    });

    it('should show window after loading content', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should send document to window after did-finish-load event', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Trigger the did-finish-load event
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('okr:generate', {
        okr: mockDocument,
      });
    });

    it('should set window to null when closed event fires', async () => {
      const { BrowserWindow } = await import('electron');
      
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Trigger closed event
      mockWindow._triggerEvent('closed');
      
      // Re-opening should create a new window (proves old reference was cleared)
      (BrowserWindow as jest.Mock).mockClear();
      
      await manager.open(mockDocument);
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should prevent page-title-updated and reset title', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      const preventDefault = jest.fn();
      
      // Trigger page-title-updated event
      mockWindow._triggerEvent('page-title-updated', { preventDefault });
      
      expect(preventDefault).toHaveBeenCalled();
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ClarityOKR Sticky');
    });

    it('should reconfigure always-on-top after did-finish-load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Clear calls from initial setup
      mockWindow.setAlwaysOnTop.mockClear();
      mockWindow.setFullScreenable.mockClear();
      mockWindow.setVisibleOnAllWorkspaces.mockClear();
      
      // Trigger did-finish-load
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
      expect(mockWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    });

    it('should focus existing window instead of creating duplicate', async () => {
      const { BrowserWindow } = await import('electron');
      
      // Open first window
      await manager.open(mockDocument);
      const firstWindow = mockBrowserWindowInstances[0];
      
      (BrowserWindow as jest.Mock).mockClear();
      
      // Try to open again with same document
      const secondDocument = { ...mockDocument, id: 'different-id' };
      await manager.open(secondDocument);
      
      // Should not create new BrowserWindow
      expect(BrowserWindow).not.toHaveBeenCalled();
      
      // Should focus and send new document
      expect(firstWindow.focus).toHaveBeenCalled();
      expect(firstWindow.webContents.send).toHaveBeenCalled();
    });

    it('should create new window if existing is destroyed', async () => {
      const { BrowserWindow } = await import('electron');
      
      // Open first window
      await manager.open(mockDocument);
      const firstWindow = mockBrowserWindowInstances[0];
      
      // Mark as destroyed
      firstWindow.isDestroyed.mockReturnValue(true);
      
      (BrowserWindow as jest.Mock).mockClear();
      
      // Try to open again
      await manager.open(mockDocument);
      
      // Should create new BrowserWindow
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should store document reference for reopen functionality', async () => {
      await manager.open(mockDocument);
      
      // After opening, reopen should work with same document
      await expect(manager.reopen()).resolves.not.toThrow();
    });

    it('should handle loadFile errors gracefully', async () => {
      const { BrowserWindow } = await import('electron');
      
      (BrowserWindow as jest.Mock).mockImplementationOnce(() => {
        const mockWindow = createMockBrowserWindow();
        mockWindow.loadFile.mockRejectedValue(new Error('File not found'));
        return mockWindow;
      });
      
      // Reset manager to pick up new mock
      manager = new StickyWindowManager(config);
      
      // Should throw when loadFile fails
      await expect(manager.open(mockDocument)).rejects.toThrow('File not found');
    });

    it('should apply screen-saver level for always-on-top', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Verify screen-saver level is used (highest level)
      const alwaysOnTopCalls = mockWindow.setAlwaysOnTop.mock.calls;
      alwaysOnTopCalls.forEach(call => {
        expect(call[0]).toBe(true);
        expect(call[1]).toBe('screen-saver');
      });
    });
  });

  describe('reopen()', () => {
    it('should reopen window with last document', async () => {
      const { BrowserWindow } = await import('electron');
      
      // First open
      await manager.open(mockDocument);
      
      // Close the window
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow._triggerEvent('closed');
      
      (BrowserWindow as jest.Mock).mockClear();
      
      // Reopen should create new window with same document
      await manager.reopen();
      
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if no previous document exists', async () => {
      const { BrowserWindow } = await import('electron');
      
      // Reopen without ever opening first
      await manager.reopen();
      
      expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('should focus existing window if already open during reopen', async () => {
      // Open first
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow.focus.mockClear();
      
      // Reopen should just focus
      await manager.reopen();
      
      expect(mockWindow.focus).toHaveBeenCalled();
    });
  });

  describe('Window Event Handlers', () => {
    it('should handle multiple did-finish-load events correctly', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Trigger did-finish-load multiple times
      mockWindow._triggerEvent('did-finish-load');
      mockWindow._triggerEvent('did-finish-load');
      mockWindow._triggerEvent('did-finish-load');
      
      // Should send document each time
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(3);
    });

    it('should not send document if window is destroyed during did-finish-load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow.isDestroyed.mockReturnValue(true);
      
      mockWindow.webContents.send.mockClear();
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('Document Management', () => {
    it('should update lastDocument when opening new document', async () => {
      const firstDoc = { ...mockDocument, id: 'first-doc' };
      const secondDoc = { ...mockDocument, id: 'second-doc' };
      
      await manager.open(firstDoc);
      
      // Close window to force new window creation
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow._triggerEvent('closed');
      
      await manager.open(secondDoc);
      
      // Now reopen should use second document
      const { BrowserWindow } = await import('electron');
      (BrowserWindow as jest.Mock).mockClear();
      
      // Close and reopen
      const newWindow = mockBrowserWindowInstances[1];
      newWindow._triggerEvent('closed');
      
      await manager.reopen();
      
      // Verify the second document was sent
      const latestWindow = mockBrowserWindowInstances[mockBrowserWindowInstances.length - 1];
      const sendCalls = latestWindow.webContents.send.mock.calls;
      const lastCall = sendCalls[sendCalls.length - 1];
      expect(lastCall[1].okr.id).toBe('second-doc');
    });

    it('should handle document with minimal fields', async () => {
      const minimalDoc: OKRDocument = {
        id: 'minimal',
        objective: 'Test',
        keyResults: [],
        sourceSessionId: 's1',
        generatedAt: new Date().toISOString(),
        regenerationPolicy: { type: 'conservative' },
        manualEdits: [],
      };
      
      const { BrowserWindow } = await import('electron');
      
      await manager.open(minimalDoc);
      
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        expect.any(String),
        { okr: minimalDoc }
      );
    });

    it('should handle document with complex regeneration policy', async () => {
      const complexDoc: OKRDocument = {
        ...mockDocument,
        regenerationPolicy: {
          type: 'targeted',
          keyResultIndices: [0, 2],
        },
      };
      
      await manager.open(complexDoc);
      
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        expect.any(String),
        { okr: complexDoc }
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long document objective', async () => {
      const longDoc: OKRDocument = {
        ...mockDocument,
        objective: 'A'.repeat(10000),
      };
      
      await expect(manager.open(longDoc)).resolves.not.toThrow();
    });

    it('should handle document with many key results', async () => {
      const manyKRsDoc: OKRDocument = {
        ...mockDocument,
        keyResults: Array.from({ length: 100 }, (_, i) => ({
          id: `kr-${i}`,
          description: `Key result ${i}`,
          metrics: '',
          target: '100%',
          deadline: '2024-12-31',
        })),
      };
      
      await expect(manager.open(manyKRsDoc)).resolves.not.toThrow();
    });

    it('should handle special characters in document fields', async () => {
      const specialDoc: OKRDocument = {
        ...mockDocument,
        objective: 'Test <script>alert("xss")</script> & "quotes"',
      };
      
      await expect(manager.open(specialDoc)).resolves.not.toThrow();
    });

    it('should handle unicode characters in document', async () => {
      const unicodeDoc: OKRDocument = {
        ...mockDocument,
        objective: '🎯 目标：提高效率 日本語 العربية',
      };
      
      await expect(manager.open(unicodeDoc)).resolves.not.toThrow();
    });

    it('should handle rapid open/close cycles', async () => {
      const { BrowserWindow } = await import('electron');
      
      // Multiple rapid open calls
      await manager.open(mockDocument);
      await manager.open(mockDocument);
      await manager.open(mockDocument);
      
      // Should only create one window
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should handle reopen after rapid close', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      mockWindow._triggerEvent('closed');
      
      // Immediately reopen
      await manager.reopen();
      
      expect(mockBrowserWindowInstances.length).toBe(2);
    });
  });

  describe('Window State Consistency', () => {
    it('should maintain always-on-top after page load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Reset mock to track only post-load calls
      mockWindow.setAlwaysOnTop.mockClear();
      
      // Trigger page load
      mockWindow._triggerEvent('did-finish-load');
      
      // Verify always-on-top is set again
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    });

    it('should prevent fullscreen capability throughout lifecycle', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Check initial setup
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
      
      // Check after page load
      mockWindow.setFullScreenable.mockClear();
      mockWindow._triggerEvent('did-finish-load');
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
    });

    it('should maintain visibility on all workspaces', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = mockBrowserWindowInstances[0];
      
      // Verify visible on all workspaces is set
      expect(mockWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(
        true,
        { visibleOnFullScreen: true }
      );
    });
  });
});
