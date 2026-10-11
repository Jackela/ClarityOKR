import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: Array<{ target: unknown; html: string }>;
}

let axeSource: string | undefined;

/**
 * Runs axe-core inside an Electron page. The script is evaluated through CDP (not injected as a
 * `<script>` tag) so the page's CSP does not block it. Returns the serious/critical violations
 * (plus moderate ones, which also fail the gate) as plain data.
 */
export async function runAxe(page: Page, context?: string): Promise<AxeViolation[]> {
  axeSource ??= readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSource);
  return page.evaluate(async (selector) => {
    const axe = (
      window as unknown as {
        axe: { run: (c: unknown, o: unknown) => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe;
    const result = await axe.run(selector ? { include: [selector] } : document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 200) })),
    }));
  }, context ?? null);
}
