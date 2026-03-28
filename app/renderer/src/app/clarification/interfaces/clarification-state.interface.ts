/**
 * Wizard state service interface
 */

import type { Signal, WritableSignal } from '@angular/core';
import type { WorkflowState } from '@clarityokr/contracts';

export interface ClarificationPrompt {
  id: string;
  question: string;
  context?: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
}


export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

export interface IClarificationState {
  // State signals
  workflowState: Signal<WorkflowState>;
  currentPrompt: Signal<ClarificationPrompt | null>;
  isLoading: Signal<boolean>;
  hasError: Signal<boolean>;
  error: Signal<ErrorInfo | null>;
  isReadyToGenerate: Signal<boolean>;
  currentSelection: Signal<string | null>;
  history: Signal<ClarificationPrompt[]>;
  validationError: Signal<string | null>;
  intent: Signal<string>;

  // Methods
  canTransitionTo(targetState: WorkflowState): boolean;
}
