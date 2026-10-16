import path from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';
import { BrowserWindow } from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import { hideOnClose } from '../lifecycle/quit-gate.js';
import type { OKRRepository } from '../persistence/okr-repository.types.js';
import type { IActionLogWriter } from '../persistence/action-log-writer.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { ISessionRepository } from '../persistence/interfaces/index.js';
import type { OkrRegenerationService } from '../services/okr-regeneration.service.js';

/**
 * Configuration for sticky window manager
 */
export interface StickyWindowConfig {
  preloadPath: string;
  rendererDistPath: string;
  okrRepository: OKRRepository;
  actionLogWriter: IActionLogWriter;
  okrAgentService: OkrAgentService;
  sessionRepository: ISessionRepository;
  okrRegeneration: OkrRegenerationService;
  isQuitting: () => boolean;
  /** N15: closing this window is a quit instead of a hide (no tray, last visible window). */
  closeQuits?: () => boolean;
  requestQuit?: () => void;
}

/**
 * Manages the lifecycle of the sticky note window.
 * Provides always-on-top sticky window functionality.
 */
export class StickyWindowManager {
  private window: BrowserWindow | null = null;
  private lastDocument: OKRDocument | null = null;
  /** 「窗口始终在最前」 (the ⋯ menu); on by default, kept for this run. */
  private alwaysOnTop = true;

  constructor(private readonly config: StickyWindowConfig) {}

  /**
   * Creates and opens the sticky window with the specified OKR document.
   * @param okrId - The OKR ID to display
   * @returns Promise resolving to the created BrowserWindow
   */
  async createStickyWindow(okrId: string): Promise<BrowserWindow> {
    Logger.info('[main] creating sticky window', { okrId });

    if (this.window && !this.window.isDestroyed()) {
      if (!this.window.isVisible()) {
        this.window.show();
      }
      this.window.focus();
      return this.window;
    }

    this.window = new BrowserWindow({
      width: 420,
      height: 560,
      minWidth: 320,
      minHeight: 400,
      backgroundColor: '#ffffff',
      title: 'ClarityOKR Sticky',
      alwaysOnTop: this.alwaysOnTop,
      type: 'panel',
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
    this.applyAlwaysOnTop();
    this.window.setFullScreenable(false);
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    Logger.info('[main] sticky window always-on-top state', this.window.isAlwaysOnTop());

    const indexFile = path.join(this.config.rendererDistPath, 'index.html');

    this.window.on('page-title-updated', (event) => event.preventDefault());
    await this.window.loadFile(indexFile, { search: 'view=sticky' });
    this.window.setTitle('ClarityOKR Sticky');
    Logger.info('[main] sticky window content loaded');

    // Handle close event to hide instead of destroy (unless app is quitting)
    // Closing hides (kept for showStickyWindow()) unless the app is quitting; without a tray
    // on Windows / Linux closing the last visible window asks to quit instead (N15).
    hideOnClose(
      this.window,
      () => this.config.isQuitting(),
      () => this.config.closeQuits?.() ?? false,
      () => this.config.requestQuit?.(),
    );

    this.window.on('page-title-updated', (event) => {
      event.preventDefault();
      this.window?.setTitle('ClarityOKR Sticky');
    });

    this.window.webContents.on('did-finish-load', () => {
      this.window?.setTitle('ClarityOKR Sticky');
      this.applyAlwaysOnTop();
      this.window?.setFullScreenable(false);
      this.window?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      Logger.info(
        '[main] sticky window post-load always-on-top state',
        this.window?.isAlwaysOnTop(),
      );
      Logger.info('[main] sticky window ready');
    });

    this.window.show();
    return this.window;
  }

  /** `webContents.id` of the sticky window's renderer (null when there is none). */
  getWebContentsId(): number | null {
    return this.window && !this.window.isDestroyed() ? this.window.webContents.id : null;
  }

  getWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  isAlwaysOnTop(): boolean {
    const window = this.getWindow();
    return window ? window.isAlwaysOnTop() : this.alwaysOnTop;
  }

  setAlwaysOnTop(enabled: boolean): void {
    this.alwaysOnTop = enabled;
    this.applyAlwaysOnTop();
    Logger.info('[main] sticky window always-on-top set', enabled);
  }

  /**
   * Shows and focuses the sticky note: the existing window, or a new one with the last
   * document. Returns false when there is nothing to show (no sticky note this run).
   */
  async bringToFront(): Promise<boolean> {
    const window = this.getWindow();
    if (window) {
      raiseWindow(window);
      return true;
    }
    if (!this.lastDocument) return false;
    await this.reopenStickyWindow();
    return this.getWindow() !== null;
  }

  private applyAlwaysOnTop(): void {
    const window = this.getWindow();
    if (!window) return;
    if (this.alwaysOnTop) window.setAlwaysOnTop(true, 'screen-saver');
    else window.setAlwaysOnTop(false);
  }

  /**
   * Shows the sticky window if it exists.
   */
  showStickyWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      Logger.info('[main] sticky window shown');
    }
  }

  /**
   * Hides the sticky window without destroying it.
   */
  hideStickyWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      Logger.info('[main] sticky window hidden');
    }
  }

  /**
   * Reopens the sticky window with the last displayed document.
   */
  async reopenStickyWindow(): Promise<void> {
    if (!this.lastDocument) {
      Logger.info('[main] no last document to reopen sticky window');
      return;
    }
    Logger.info('[main] reopening sticky window');
    await this.createStickyWindow(this.lastDocument.id);
    this.sendDocument(this.lastDocument);
  }

  /**
   * Opens the sticky window with a document (legacy method).
   * @param document - The OKR document to display
   */
  async open(document: OKRDocument): Promise<void> {
    this.lastDocument = document;
    await this.createStickyWindow(document.id);
    this.sendDocument(document);
  }

  /**
   * Reopens the sticky window with the last document (legacy method).
   */
  async reopen(): Promise<void> {
    await this.reopenStickyWindow();
  }

  /**
   * Regenerates an OKR with the specified policy.
   * Retrieves clarification context from session, calls LLM to generate new OKR draft,
   * applies the policy (overwrite or append), saves to repository, broadcasts update,
   * and logs the action.
   *
   * @param sessionId - The clarification session ID
   * @param policy - The regeneration policy ('overwrite' or 'append')
   * @throws Error if session not found, LLM generation fails, or persistence fails
   *
   * @usage
   * ```typescript
   * await stickyWindowManager.regenerateOkr('session-123', 'overwrite');
   * // or
   * await stickyWindowManager.regenerateOkr('session-123', 'append');
   * ```
   */
  async regenerateOkr(sessionId: string, policy: 'overwrite' | 'append'): Promise<void> {
    Logger.info('[main] regenerating OKR', { sessionId, policy });

    const result = await this.config.okrRegeneration.regenerate(sessionId, policy);

    if (!result.ok) {
      Logger.error('[main] Failed to regenerate OKR', { sessionId, policy, error: result.error });
      throw result.error;
    }

    const newOkr = result.value;

    this.lastDocument = newOkr;
    this.sendDocument(newOkr);
    await this.config.actionLogWriter.logRegenerate(sessionId, newOkr.id, policy);

    Logger.info('[main] OKR regenerated successfully', { okrId: newOkr.id, policy });
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

/** Minimized → restored; hidden → shown; then focused (N55: 去复盘 from the main window). */
export function raiseWindow(
  window: Pick<BrowserWindow, 'isMinimized' | 'restore' | 'show' | 'focus'>,
): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
