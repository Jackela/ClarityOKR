import type { ConfettiPiece } from './success-celebration.types.js';

export const CONFETTI_COLORS = [
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ec4899',
] as const;

export const DEFAULT_CONFETTI_COUNT = 30;

export function generateConfettiPieces(
  count: number = DEFAULT_CONFETTI_COUNT,
  colors: readonly string[] = CONFETTI_COLORS,
): ConfettiPiece[] {
  return Array.from(
    { length: count },
    (_, index): ConfettiPiece => ({
      id: index,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 100 - 50,
      rotation: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0]!,
      size: Math.random() * 8 + 4,
      delay: Math.random() * 300,
    }),
  );
}

export function generateConfettiPiece(
  id: number,
  colors: readonly string[] = CONFETTI_COLORS,
): ConfettiPiece {
  return {
    id,
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 100 - 50,
    rotation: Math.random() * 360,
    color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0]!,
    size: Math.random() * 8 + 4,
    delay: Math.random() * 300,
  };
}
