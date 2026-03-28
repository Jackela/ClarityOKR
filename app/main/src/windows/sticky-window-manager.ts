import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { OKRDocument } from '@clarityokr/contracts';
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@clarityokr/contracts';
import { ClipboardExporterService } from './clipboard-exporter.js';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import type { OKRRepository } from '../persistence/okr-repository.types.js';
import type { IActionLogWriter } from '../persistence/action-log-writer.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { SessionRepository } from '../persistence/session-repository.js';
/**
 * Configuration for sticky window manager
 */
export interface StickyWindowConfig {
  preloadPath: string;
  rendererDistPath: string;
  okrRepository: OKRRepository;
  actionLogWriter: IActionLogWriter;
  okrAgentService: OkrAgentService;
  sessionRepository: SessionRepository;
}

/**
 * Manages the lifecycle of the sticky note window.
 * Provides always-on-top sticky window functionality.
 */
export class StickyWindowManager {
  private window: BrowserWindow | null = null;
  private lastDocument: OKRDocument | null = null;
  private readonly clipboardExporter: ClipboardExporterService;

  constructor(private readonly config: StickyWindowConfig) {
    this.clipboardExporter = new ClipboardExporterService(config.actionLogWriter);
    this.registerIpcHandlers();
  }

  /**
   * Creates and opens the sticky window with the specified OKR document.
   * @param okrId - The OKR ID to display
   * @returns Promise resolving to the created BrowserWindow
   */
  async createStickyWindow(okrId: string): Promise<BrowserWindow> {
    Logger.info('[main] creating sticky window', { okrId });

    if (this.window && !this.window.isDestroyed()) {
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

    // Handle close event to hide instead of destroy
    this.window.on('close', (event) => {
      if (this.window && !this.window.isDestroyed()) {
        event.preventDefault();
        this.window.hide();
        Logger.info('[main] sticky window hidden on close');
      }
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
      Logger.info('[main] sticky window ready');
    });

    this.window.show();
    return this.window;
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
   * Stub implementation for T033.
   */
  async reopenStickyWindow(): Promise<void> {
    if (!this.lastDocument) {
      Logger.info('[main] no last document to reopen sticky window');
      return;
    }
    Logger.info('[main] reopening sticky window');
    await this.createStickyWindow(this.lastDocument.id);
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

    try {
      // Step 1: Retrieve clarification context from session
      const session = await this.config.sessionRepository.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Get current OKR for the session (needed for append policy)
      const currentOkr = await this.config.okrRepository.getLatestForSession(sessionId);

      // Build clarification context from session steps and selections
      const context = {
        turns: session.steps.map((step) => ({
          questionId: step.id,
          optionId:
            session.selectedOptionIds.find((id) => step.options.some((opt) => opt.id === id)) ?? '',
          timestamp: step.context ?? new Date().toISOString(),
        })),
      };

      // Step 2: Call LLM to generate new OKR draft
      const llmResponse = await this.config.okrAgentService.generateDraft(context);
      const newDraft = llmResponse as {
        objective: string;
        keyResults: Array<{
          id: string;
          statement: string;
          successMetric?: string;
          owner?: string;
        }>;
      };

      // Step 3: Generate new OKR document based on policy
      const timestamp = new Date().toISOString();
      let newOkr: OKRDocument;

      if (policy === 'overwrite') {
        // Complete replacement - create new document
        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: newDraft.objective,
          keyResults: newDraft.keyResults.map((kr) => ({
            id: kr.id,
            statement: kr.statement,
            successMetric: kr.successMetric,
            owner: kr.owner,
          })),
          sourceSessionId: sessionId,
          generatedAt: timestamp,
          regenerationPolicy: policy,
          manualEdits: currentOkr?.manualEdits ?? [],
        };
      } else {
        // Append policy - merge new KRs into existing OKR
        const existingKeyResults = currentOkr?.keyResults ?? [];
        const mergedKeyResults = [
          ...existingKeyResults,
          ...newDraft.keyResults.map((kr) => ({
            id: kr.id,
            statement: kr.statement,
            successMetric: kr.successMetric,
            owner: kr.owner,
          })),
        ];

        newOkr = {
          id: currentOkr?.id ?? randomUUID(),
          objective: newDraft.objective,
          keyResults: mergedKeyResults,
          sourceSessionId: sessionId,
          generatedAt: timestamp,
          regenerationPolicy: policy,
          manualEdits: currentOkr?.manualEdits ?? [],
        };
      }

      // Step 4: Save to OKRRepository
      await this.config.okrRepository.save(newOkr);

      // Step 5: Update last document reference
      this.lastDocument = newOkr;

      // Step 6: Broadcast update via IPC (OKR_GENERATE channel)
      this.sendDocument(newOkr);

      // Step 7: Log action via ActionLogWriter
      await this.config.actionLogWriter.logRegenerate(sessionId, newOkr.id, policy);

      Logger.info('[main] OKR regenerated successfully', { okrId: newOkr.id, policy });
    } catch (error) {
      Logger.error('[main] Failed to regenerate OKR', { sessionId, policy, error });
      throw error;
    }
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

  /**
   * Registers IPC handlers for sticky window operations.
   */
  private registerIpcHandlers(): void {
    ipcMain.handle(
      IPC_CHANNELS.CLIPBOARD_EXPORT,
      async (_event, payload: { okr: OKRDocument; sessionId: string }) => {
        return this.clipboardExporter.exportOkrToClipboard(payload.okr, payload.sessionId);
      },
    );
    Logger.info('[main] Clipboard export IPC handler registered');
  }
}
