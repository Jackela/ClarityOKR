/**
 * Shared types for OKR sticky note components
 *
 * This module provides type definitions used across the okr-sticky
 * presentational components, ensuring type safety and consistency.
 *
 * @module okr-sticky/components/types
 */

import type { RegenerationPolicy } from '@clarityokr/contracts';

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
 * Transforms domain model into UI-friendly format.
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
 * Save edits event payload
 */
export interface SaveEditsEvent {
  objective: string;
  keyResults: Array<{
    id: string;
    statement: string;
    successMetric?: string;
    owner?: string;
  }>;
}
