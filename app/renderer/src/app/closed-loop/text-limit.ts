/**
 * Text limits for the forms (spec §3.9a). Counting and the 32-code-unit cluster rule come from
 * `@clarityokr/contracts` — the very functions the main process uses to validate again — so
 * the UI and main can never disagree. Nothing here truncates: over-long text is only reported.
 */
import { checkText, countGraphemes } from '@clarityokr/contracts';

export type TextLimitKind = 'ok' | 'too_long' | 'cluster_too_long';

export interface TextLimitState {
  /** User-perceived characters (an emoji counts as one). */
  count: number;
  limit: number;
  kind: TextLimitKind;
  /** How many characters are over the limit (0 when within). */
  over: number;
  /** Anything that blocks saving. */
  invalid: boolean;
}

/** Evaluates `text` against `limit` graphemes. A cluster longer than 32 code units wins. */
export function evaluateText(text: string, limit: number): TextLimitState {
  const count = countGraphemes(text);
  // Ask for "no limit" first: the only way this can fail is the cluster rule.
  const cluster = checkText(text, Number.POSITIVE_INFINITY);
  if (!cluster.ok) {
    return {
      count,
      limit,
      kind: 'cluster_too_long',
      over: Math.max(0, count - limit),
      invalid: true,
    };
  }
  if (count > limit) {
    return { count, limit, kind: 'too_long', over: count - limit, invalid: true };
  }
  return { count, limit, kind: 'ok', over: 0, invalid: false };
}
