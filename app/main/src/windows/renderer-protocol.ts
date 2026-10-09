import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Net, Protocol } from 'electron';

/** Authorize only Angular's nonce-tagged component styles for this document load. */
export function renderWithStyleNonce(html: string): string {
  if (!html.includes("style-src 'self';") || !html.includes('<clarityokr-root>')) {
    throw new Error('Renderer HTML is missing the strict style policy or Angular root');
  }
  const nonce = randomBytes(24).toString('base64');
  return html
    .replace("style-src 'self';", `style-src 'self' 'nonce-${nonce}';`)
    .replace('<clarityokr-root>', `<clarityokr-root ngCspNonce="${nonce}">`);
}

export function registerRendererProtocol(
  rendererDirectory: string,
  protocol: Protocol,
  net: Net,
): void {
  const indexPath = path.resolve(rendererDirectory, 'index.html');
  protocol.handle('file', async (request) => {
    if (fileURLToPath(request.url) !== indexPath) {
      return net.fetch(request.url, { bypassCustomProtocolHandlers: true });
    }
    const html = renderWithStyleNonce(await readFile(indexPath, 'utf8'));
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  });
}
