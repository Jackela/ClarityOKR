import path from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';
import { BrowserWindow } from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';

export interface StickyWindowConfig {
  preloadPath: string;
  rendererDistPath: string;
}

export class StickyWindowManager {
  private window: BrowserWindow | null = null;
  private lastDocument: OKRDocument | null = null;

  constructor(private readonly config: StickyWindowConfig) {}

  async open(document: OKRDocument): Promise<void> {
    this.lastDocument = document;

    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      this.sendDocument(document);
      return;
    }

    Logger.info('[main] opening sticky window');
    this.window = new BrowserWindow({
      width: 420,
      height: 560,
      minWidth: 320,
      minHeight: 400,
      backgroundColor: '#ffffff',
      title: 'ClarityOKR Sticky',
      alwaysOnTop: true,
      type: 'toolbar',
      titleBarStyle: 'hidden',
      frame: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.config.preloadPath,
      },
    });

    this.window.setTitle('ClarityOKR Sticky');
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setFullScreenable(false);
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    Logger.info('[main] sticky window always-on-top state', this.window.isAlwaysOnTop());

    const indexFile = path.join(this.config.rendererDistPath, 'index.html');

    await this.window.loadFile(indexFile, { search: 'view=sticky' });
    Logger.info('[main] sticky window content loaded');

    this.window.on('closed', () => {
      this.window = null;
    });

    this.window.on('page-title-updated', (event) => {
      event.preventDefault();
      this.window?.setTitle('ClarityOKR Sticky');
    });

    this.window.webContents.on('did-finish-load', () => {
      this.window?.setTitle('ClarityOKR Sticky');
      this.window?.setAlwaysOnTop(true, 'screen-saver');
      this.window?.setFullScreenable(false);
      this.window?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      Logger.info(
        '[main] sticky window post-load always-on-top state',
        this.window?.isAlwaysOnTop(),
      );
      Logger.info('[main] sticky window ready, pushing document');
      this.sendDocument(document);
    });

    this.window.show();
  }

  async reopen(): Promise<void> {
    if (!this.lastDocument) {
      return;
    }
    await this.open(this.lastDocument);
  }

  private sendDocument(document: OKRDocument): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    Logger.info('[main] sending OKR document to sticky window', { okrId: document.id });
    this.window.webContents.send(IPCChannels.OKR_GENERATE, {
      okr: document,
    });
  }
}
