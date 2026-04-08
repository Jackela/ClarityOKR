// Mock for Electron modules
import { jest } from '@jest/globals';

// Track created windows for test assertions
export const createdWindows: MockBrowserWindow[] = [];

export interface MockBrowserWindow {
  id: number;
  options: Record<string, unknown>;
  isDestroyed: ReturnType<typeof jest.fn>;
  isVisible: ReturnType<typeof jest.fn>;
  isAlwaysOnTop: ReturnType<typeof jest.fn>;
  focus: ReturnType<typeof jest.fn>;
  hide: ReturnType<typeof jest.fn>;
  show: ReturnType<typeof jest.fn>;
  loadFile: ReturnType<typeof jest.fn>;
  setTitle: ReturnType<typeof jest.fn>;
  setAlwaysOnTop: ReturnType<typeof jest.fn>;
  setFullScreenable: ReturnType<typeof jest.fn>;
  setVisibleOnAllWorkspaces: ReturnType<typeof jest.fn>;
  on: ReturnType<typeof jest.fn>;
  webContents: {
    send: ReturnType<typeof jest.fn>;
    on: ReturnType<typeof jest.fn>;
  };
  _eventHandlers: Map<string, ((...args: unknown[]) => void)[]>;
  _triggerEvent: (event: string, ...args: unknown[]) => void;
}

const createMockBrowserWindow = (options: Record<string, unknown>): MockBrowserWindow => {
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();
  let visible = true;

  const mockWindow: MockBrowserWindow = {
    id: Math.random(),
    options,
    isDestroyed: jest.fn().mockReturnValue(false),
    isVisible: jest.fn().mockImplementation(() => visible),
    isAlwaysOnTop: jest.fn().mockReturnValue(true),
    focus: jest.fn(),
    hide: jest.fn().mockImplementation(() => {
      visible = false;
    }),
    show: jest.fn().mockImplementation(() => {
      visible = true;
    }),
    loadFile: jest.fn().mockResolvedValue(undefined),
    setTitle: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setFullScreenable: jest.fn(),
    setVisibleOnAllWorkspaces: jest.fn(),
    on: jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      eventHandlers.get(event)!.push(handler);
      return mockWindow;
    }),
    webContents: {
      send: jest.fn(),
      on: jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        eventHandlers.get(event)!.push(handler);
        return mockWindow.webContents;
      }),
    },
    _eventHandlers: eventHandlers,
    _triggerEvent: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach((handler) => handler(...args));
    },
  };

  createdWindows.push(mockWindow);
  return mockWindow;
};

export const BrowserWindow = jest
  .fn()
  .mockImplementation((options: Record<string, unknown>) => createMockBrowserWindow(options));

export const clipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
  readText: jest.fn().mockResolvedValue(''),
};

export const ipcMain = {
  handle: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeHandler: jest.fn(),
};

export const ipcRenderer = {
  send: jest.fn(),
  invoke: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
};

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from(text),
  decryptString: (buffer: Buffer) => buffer.toString(),
};

export default { BrowserWindow, clipboard, ipcMain, ipcRenderer, safeStorage };
