import type { WorkflowState } from '@clarityokr/contracts';

/**
 * Common type definitions shared across components
 */

/** Size variants */
export type Size = 'sm' | 'md' | 'lg';

/** Button style variants */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Component status states */
export type Status = 'idle' | 'loading' | 'success' | 'error';

/** Spinner size options */
export type SpinnerSize = Size;

/** Skeleton placeholder types */
export type SkeletonType = 'text' | 'card' | 'circle' | 'options' | 'custom';

/** Workflow states for clarification process */
export { type WorkflowState };
export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';
