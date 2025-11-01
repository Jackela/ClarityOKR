import { BrowserWindow } from 'electron';
import path from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

import { IPCChannels } from '../bootstrap/ipc-channels.js';

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
      await this.sendDocument(document);
      return;
    }

    console.info('[main] opening sticky window');
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
        preload: this.config.preloadPath
      }
    });

    this.window.setTitle('ClarityOKR Sticky');
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setFullScreenable(false);
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    console.info('[main] sticky window always-on-top state', this.window.isAlwaysOnTop());

    const indexFile = path.join(this.config.rendererDistPath, 'index.html');

    await this.window.loadFile(indexFile, { search: 'view=sticky' });
    console.info('[main] sticky window content loaded');

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
      console.info('[main] sticky window post-load always-on-top state', this.window?.isAlwaysOnTop());
      console.info('[main] sticky window ready, pushing document');
      void this.sendDocument(document);
    });

    this.window.show();
  }

  async reopen(): Promise<void> {
    if (!this.lastDocument) {
      return;
    }
    await this.open(this.lastDocument);
  }

  private async sendDocument(document: OKRDocument): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    console.info('[main] sending OKR document to sticky window', { okrId: document.id });
    this.window.webContents.send(IPCChannels.OKR_GENERATE, {
      okr: document
    });
  }
}
