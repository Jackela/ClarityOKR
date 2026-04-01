/**
 * Success Celebration Types
 */

/**
 * Confetti piece configuration
 */
export interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

/**
 * Dismiss button event
 */
export type DismissReason = 'auto' | 'manual' | 'navigation' | 'error' | 'timeout';
