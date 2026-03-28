import { Injectable } from '@angular/core';
import type { OKRDocument, RegenerationPolicy } from '@clarityokr/contracts';

/**
 * ViewModel for a single Key Result in the sticky note display.
 */
export interface KeyResultViewModel {
  id: string;
  statement: string;
  metricLabel: string | null;
  ownerLabel: string | null;
}

/**
 * ViewModel for the OKR sticky note display.
 * Transforms domain model (OKRDocument) into UI-friendly format.
 */
export interface OkrStickyViewModel {
  objective: string;
  keyResults: KeyResultViewModel[];
  generatedAt: string;
  lastEditedAt: string | null;
  hasManualEdits: boolean;
  regenerationPolicy: RegenerationPolicy;
}

/**
 * Service that transforms OKRDocument domain model to ViewModel for UI display.
 * 
 * @usage
 * ```typescript
 * const service = new OkrProjectionService();
 * const viewModel = service.project(okrDocument);
 * ```
 */

@Injectable({ providedIn: 'root' })
export class OkrProjectionService {
  /**
   * Transforms an OKRDocument into a ViewModel for UI display.
   * 
   * @param document - The OKRDocument domain model to transform
   * @returns The OkrStickyViewModel for UI display
   * @throws Error if document.keyResults is empty
   */
  project(document: OKRDocument): OkrStickyViewModel {
    if (!document.keyResults.length) {
      throw new Error('Key Results are required for sticky note rendering.');
    }

    return {
      objective: document.objective,
      keyResults: document.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        metricLabel: kr.successMetric ?? null,
        ownerLabel: kr.owner ?? null
      })),
      generatedAt: document.generatedAt,
      lastEditedAt: document.lastEditedAt ?? null,
      hasManualEdits: document.manualEdits.length > 0,
      regenerationPolicy: document.regenerationPolicy
    };
  }
}
