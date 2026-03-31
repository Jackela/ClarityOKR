import { jest } from '@jest/globals';
import type { OKRDocument } from '@clarityokr/contracts';
import { StickyWindowManager } from '@clarityokr/main/windows/sticky-window-manager';
import { BrowserWindow, createdWindows } from 'electron';
import type { MockBrowserWindow } from '../__mocks__/electron.js';

describe('StickyWindowManager Unit Tests', () => {
  let manager: StickyWindowManager;
  let config: { preloadPath: string; rendererDistPath: string; isQuitting?: () => boolean };
  let mockDocument: OKRDocument;

  beforeEach(() => {
    // Clear tracked windows
    createdWindows.length = 0;
    jest.clearAllMocks();
    
    config = {
      preloadPath: '/mock/preload.js',
      rendererDistPath: '/mock/renderer/dist',
      isQuitting: () => false,
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
    createdWindows.length = 0;
  });

  describe('Constructor', () => {
    it('should initialize with provided config', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('open()', () => {
    it('should create a new BrowserWindow with correct configuration', async () => {
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
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ClarityOKR Sticky');
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
      expect(mockWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    });

    it('should load renderer HTML file with sticky view parameter', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html'),
        { search: 'view=sticky' }
      );
    });

    it('should show window after loading content', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should send document to window after did-finish-load event', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      // Trigger the did-finish-load event
      mockWindow._triggerEvent('did-finish-load');
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('clarityokr:okr:generate', {
        okr: mockDocument,
      });
    });

    it('should hide window on close instead of destroying', async () => {
      await manager.open(mockDocument);

      const mockWindow = createdWindows[0] as MockBrowserWindow;

      // Trigger close event - should hide instead of destroy
      const preventDefault = jest.fn();
      mockWindow._triggerEvent('close', { preventDefault });

      // Verify preventDefault was called (to prevent actual close)
      expect(preventDefault).toHaveBeenCalled();
      // Verify window was hidden
      expect(mockWindow.hide).toHaveBeenCalled();

      // Re-opening should show existing window, not create new one
      (BrowserWindow as jest.Mock).mockClear();
      mockWindow.show.mockClear();

      await manager.open(mockDocument);
      // No new window created
      expect(BrowserWindow).toHaveBeenCalledTimes(0);
      // Existing window was shown
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should prevent page-title-updated and reset title', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      const preventDefault = jest.fn();
      
      // Trigger page-title-updated event
      mockWindow._triggerEvent('page-title-updated', { preventDefault });
      
      expect(preventDefault).toHaveBeenCalled();
      expect(mockWindow.setTitle).toHaveBeenCalledWith('ClarityOKR Sticky');
    });

    it('should reconfigure always-on-top after did-finish-load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
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
      // Open first window
      await manager.open(mockDocument);
      const firstWindow = createdWindows[0] as MockBrowserWindow;
      
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
      // Open first window
      await manager.open(mockDocument);
      const firstWindow = createdWindows[0] as MockBrowserWindow;
      
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

    it('should apply screen-saver level for always-on-top', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
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
      // First open
      await manager.open(mockDocument);
      
      // Close the window (hides it)
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      mockWindow._triggerEvent('close', { preventDefault: jest.fn() });

      (BrowserWindow as jest.Mock).mockClear();
      mockWindow.show.mockClear();

      // Reopen should show existing hidden window, not create new one
      await manager.reopen();

      // No new window created, existing window was shown
      expect(BrowserWindow).toHaveBeenCalledTimes(0);
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it('should do nothing if no previous document exists', async () => {
      // Reopen without ever opening first
      await manager.reopen();
      
      expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('should focus existing window if already open during reopen', async () => {
      // Open first
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      mockWindow.focus.mockClear();
      
      // Reopen should just focus
      await manager.reopen();
      
      expect(mockWindow.focus).toHaveBeenCalled();
    });
  });

  describe('Window Event Handlers', () => {
    it('should handle multiple did-finish-load events correctly', async () => {
      await manager.open(mockDocument);

      const mockWindow = createdWindows[0] as MockBrowserWindow;

      // Trigger did-finish-load multiple times
      mockWindow._triggerEvent('did-finish-load');
      mockWindow._triggerEvent('did-finish-load');
      mockWindow._triggerEvent('did-finish-load');

      // Document is sent once in open(), not on each did-finish-load
      // The handler reconfigures window settings but doesn't re-send document
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
    });

    it('should not send document if window is destroyed during did-finish-load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
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
      const mockWindow = createdWindows[0] as MockBrowserWindow;

      // Clear send calls from first open
      mockWindow.webContents.send.mockClear();

      // Open second document - same window, new document
      await manager.open(secondDoc);
      
      // Verify second document was sent to existing window
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'clarityokr:okr:generate',
        { okr: secondDoc }
      );
      
      // Close (hide) and reopen
      mockWindow._triggerEvent('close', { preventDefault: jest.fn() });
      mockWindow.webContents.send.mockClear();
      
      await manager.reopen();
      
      // Trigger did-finish-load
      mockWindow._triggerEvent('did-finish-load');
      
      // Verify the second document was sent on reopen
      const sendCalls = mockWindow.webContents.send.mock.calls;
      expect(sendCalls.length).toBeGreaterThan(0);
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
      
      await manager.open(minimalDoc);
      
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
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
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
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
      // Multiple rapid open calls
      await manager.open(mockDocument);
      await manager.open(mockDocument);
      await manager.open(mockDocument);
      
      // Should only create one window
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should handle reopen after rapid close', async () => {
      await manager.open(mockDocument);

      const mockWindow = createdWindows[0] as MockBrowserWindow;
      mockWindow._triggerEvent('close', { preventDefault: jest.fn() });

      // Immediately reopen - should show existing window, not create new one
      await manager.reopen();

      // Should still only have one window (reused)
      expect(createdWindows.length).toBe(1);
      // Window was shown
      expect(mockWindow.show).toHaveBeenCalled();
  });

  describe('Window State Consistency', () => {
    it('should maintain always-on-top after page load', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      // Reset mock to track only post-load calls
      mockWindow.setAlwaysOnTop.mockClear();
      
      // Trigger page load
      mockWindow._triggerEvent('did-finish-load');
      
      // Verify always-on-top is set again
      expect(mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    });

    it('should prevent fullscreen capability throughout lifecycle', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      // Check initial setup
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
      
      // Check after page load
      mockWindow.setFullScreenable.mockClear();
      mockWindow._triggerEvent('did-finish-load');
      expect(mockWindow.setFullScreenable).toHaveBeenCalledWith(false);
    });

    it('should maintain visibility on all workspaces', async () => {
      await manager.open(mockDocument);
      
      const mockWindow = createdWindows[0] as MockBrowserWindow;
      
      // Verify visible on all workspaces is set
      expect(mockWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(
        true,
        { visibleOnFullScreen: true }
      );
    });
  });
});
