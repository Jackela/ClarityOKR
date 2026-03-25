/**
 * Wizard state service interface
 */

import { Signal, WritableSignal } from '@angular/core';

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

export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';

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
