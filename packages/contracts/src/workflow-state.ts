/**
 * Unified workflow state types for the clarification process
 * - idle: Initial/idle state
 * - loading: Loading data
 * - prompting: Showing clarification prompt
 * - ready: Ready to generate OKRs
 * - generating: Generating OKR
 * - completed: Process completed
 * - error: Error state
 */
export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';
