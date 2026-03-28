import { clipboard } from 'electron';
import type { OKRDocument } from '@clarityokr/contracts';
import { Logger } from '../core/logger.js';

/**
 * Interface for exporting OKR documents to clipboard.
 * @usage
 * const exporter = new ClipboardExporterService();
 * const success = await exporter.exportOkrToClipboard(okrDocument, 'session-123');
 */
export interface ClipboardExporter {
  /**
   * Exports an OKR document to the system clipboard in markdown format.
   * @param okr - The OKR document to export
   * @param sessionId - Optional session ID for action logging
   * @returns Promise resolving to true if successful, false if failed
   */
  exportOkrToClipboard(okr: OKRDocument, sessionId?: string): Promise<boolean>;
}

/**
 * Service for exporting OKR documents to clipboard in markdown format.
 *
 * Formats OKR as:
 * ```markdown
 * ## Objective
 * - {objective text}
 *
 * ## Key Results
 * - {KR 1 statement} ({metric})
 * - {KR 2 statement} ({metric})
 * - ...
 * ```
 *
 * Handles OS permission errors and empty content gracefully.
 */
export class ClipboardExporterService implements ClipboardExporter {
  constructor(
    private readonly actionLogWriter?: import('../persistence/action-log-writer.js').IActionLogWriter,
  ) {}

  /**
   * Exports an OKR document to the system clipboard in markdown format.
   *
   * @param okr - The OKR document to export
   * @param sessionId - Optional session ID for action logging
   * @returns Promise resolving to true if successful, false if failed
   *
   * @example
   * ```typescript
   * const exporter = new ClipboardExporterService();
   * const success = await exporter.exportOkrToClipboard(okrDocument, 'session-123');
   * if (success) {
   *   console.log('OKR copied to clipboard');
   * }
   * ```
   */
  async exportOkrToClipboard(okr: OKRDocument, sessionId?: string): Promise<boolean> {
    try {
      // Validate input
      if (!okr) {
        Logger.error('[ClipboardExporter] Cannot export: OKR document is null or undefined');
        return false;
      }

      if (!okr.objective || okr.objective.trim().length === 0) {
        Logger.error('[ClipboardExporter] Cannot export: Objective is empty');
        return false;
      }

      // Format the OKR as markdown
      const markdown = this.formatOkrAsMarkdown(okr);

      if (markdown.trim().length === 0) {
        Logger.error('[ClipboardExporter] Cannot export: Formatted markdown is empty');
        return false;
      }

      // Write to clipboard
      clipboard.writeText(markdown);

      Logger.info('[ClipboardExporter] OKR exported to clipboard successfully', {
        okrId: okr.id,
        objectiveLength: okr.objective.length,
        keyResultCount: okr.keyResults?.length ?? 0,
      });

      // Log the copy action if sessionId is provided
      if (sessionId && this.actionLogWriter) {
        await this.actionLogWriter.logCopy(sessionId, okr.id);
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('[ClipboardExporter] Failed to export OKR to clipboard', {
        okrId: okr?.id,
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Formats an OKR document as markdown text.
   *
   * @param okr - The OKR document to format
   * @returns The formatted markdown string
   *
   * @private
   */
  private formatOkrAsMarkdown(okr: OKRDocument): string {
    const lines: string[] = [];

    // Add objective section
    lines.push('## Objective');
    lines.push(`- ${okr.objective.trim()}`);
    lines.push('');

    // Add key results section
    lines.push('## Key Results');

    if (okr.keyResults && okr.keyResults.length > 0) {
      for (const kr of okr.keyResults) {
        const statement = kr.statement?.trim() ?? '';
        const metric = kr.successMetric?.trim();

        if (statement.length > 0) {
          if (metric && metric.length > 0) {
            lines.push(`- ${statement} (${metric})`);
          } else {
            lines.push(`- ${statement}`);
          }
        }
      }
    }

    return lines.join('\n');
  }
}
