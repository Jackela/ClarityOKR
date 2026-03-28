import { Injectable } from '@angular/core';
import type { OKRDocument, RegenerationPolicy } from '@clarityokr/contracts';

export interface KeyResultViewModel {
  id: string;
  statement: string;
  metricLabel: string | null;
  ownerLabel: string | null;
}

export interface OkrStickyViewModel {
  objective: string;
  keyResults: KeyResultViewModel[];
  generatedAt: string;
  lastEditedAt: string | null;
  hasManualEdits: boolean;
  regenerationPolicy: RegenerationPolicy;
}

@Injectable({ providedIn: 'root' })
export class OkrProjectionService {
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
