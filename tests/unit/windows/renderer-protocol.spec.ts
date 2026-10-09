import { describe, expect, it } from '@jest/globals';
import { renderWithStyleNonce } from '../../../app/main/src/windows/renderer-protocol.js';

describe('renderer style CSP', () => {
  const html = `<meta content="script-src 'self'; style-src 'self'; object-src 'none';"><clarityokr-root></clarityokr-root>`;

  it('uses a fresh unpredictable nonce matching the Angular root on every load', () => {
    const first = renderWithStyleNonce(html);
    const nonce = first.match(/ngCspNonce="([^"]+)"/)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/);
    expect(first).toContain(`style-src 'self' 'nonce-${nonce}';`);
    expect(renderWithStyleNonce(html)).not.toEqual(first);
    expect(first).toContain("script-src 'self';");
    expect(first).toContain("object-src 'none';");
    expect(first).not.toContain('unsafe-inline');
  });

  it('fails closed if the build no longer contains its expected strict policy and root', () => {
    expect(() => renderWithStyleNonce('<clarityokr-root></clarityokr-root>')).toThrow();
    expect(() => renderWithStyleNonce("style-src 'self';")).toThrow();
  });
});
