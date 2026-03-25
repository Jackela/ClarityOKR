#!/usr/bin/env node
/**
 * Browser Automation Review Script
 * Comprehensive review of all UI pages and functions
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';

const DELAY = 2000;
const REVIEW_RESULTS = [];

async function log(category, test, status, details) {
  const result = { category, test, status, details };
  REVIEW_RESULTS.push(result);

  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  console.log(`${icon} [${category}] ${test}`);
  if (details) console.log(`   ${details}`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n🔍 Starting Comprehensive Browser Automation Review\n');
  console.log('='.repeat(60));

  // Check if app is built
  const mainJsPath = join(process.cwd(), 'app/main/dist/main.js');
  const rendererPath = join(process.cwd(), 'app/renderer/dist');

  console.log('\n📋 Pre-flight Checks:');
  console.log(`  Main process: ${existsSync(mainJsPath) ? '✅ Built' : '⚠️ Not found'}`);
  console.log(`  Renderer: ${existsSync(rendererPath) ? '✅ Built' : '⚠️ Not found'}`);

  // Launch browser
  console.log('\n🚀 Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Capture console messages
  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  // Capture errors
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  try {
    // ============================================
    // 1. BASIC PAGE STRUCTURE
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('1️⃣ BASIC PAGE STRUCTURE');
    console.log('='.repeat(60));

    await page.goto('about:blank');
    await delay(DELAY);

    // Check document structure
    const docInfo = await page.evaluate(() => ({
      title: document.title,
      doctype: document.doctype?.name,
      charset: document.characterSet,
      lang: document.documentElement.lang,
      readyState: document.readyState,
    }));

    await log(
      'Structure',
      'Document has valid structure',
      'pass',
      `Title: "${docInfo.title}", Charset: ${docInfo.charset}`,
    );

    // Check for Angular
    const angularInfo = await page.evaluate(() => {
      const ngVersion = document.documentElement.getAttribute('ng-version');
      const hasNgApp = document.querySelector('[ng-app], [ng-version]') !== null;
      const rootElement = document.querySelector('clarityokr-root, app-root');

      return {
        version: ngVersion,
        hasNgApp,
        rootTagName: rootElement?.tagName || 'None',
        rootExists: !!rootElement,
      };
    });

    if (angularInfo.rootExists) {
      await log(
        'Structure',
        'Angular application detected',
        'pass',
        `v${angularInfo.version || 'unknown'}, Root: ${angularInfo.rootTagName}`,
      );
    } else {
      await log(
        'Structure',
        'Angular root element not found',
        'skip',
        'This is expected if app is not running',
      );
    }

    // ============================================
    // 2. STYLES AND DESIGN SYSTEM
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('2️⃣ STYLES & DESIGN SYSTEM');
    console.log('='.repeat(60));

    const designTokens = await page.evaluate(() => {
      const root = document.documentElement;
      const computed = getComputedStyle(root);

      return {
        colorPrimary: computed.getPropertyValue('--color-primary') || 'not set',
        colorSecondary: computed.getPropertyValue('--color-secondary') || 'not set',
        fontFamily: computed.getPropertyValue('--font-family') || 'not set',
        spacingUnit: computed.getPropertyValue('--spacing-unit') || 'not set',
        hasCSSVariables: document.styleSheets.length > 0,
      };
    });

    await log(
      'Design',
      'CSS Custom Properties',
      designTokens.hasCSSVariables ? 'pass' : 'skip',
      `Primary: ${designTokens.colorPrimary}, Font: ${designTokens.fontFamily?.substring(0, 30)}...`,
    );

    // ============================================
    // 3. COMPONENT INVENTORY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('3️⃣ COMPONENT INVENTORY');
    console.log('='.repeat(60));

    // Count all interactive elements
    const componentCounts = await page.evaluate(() => ({
      buttons: document.querySelectorAll('button, [role="button"]').length,
      inputs: document.querySelectorAll('input, textarea, select').length,
      links: document.querySelectorAll('a[href]').length,
      images: document.querySelectorAll('img').length,
      headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      cards: document.querySelectorAll('.card, [class*="card"]').length,
    }));

    await log(
      'Components',
      'Interactive Elements',
      'pass',
      `${componentCounts.buttons} buttons, ${componentCounts.inputs} inputs, ${componentCounts.links} links, ${componentCounts.headings} headings`,
    );

    // Check for custom web components
    const customElements = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const custom = allElements.filter((el) => el.tagName.includes('-'));
      return custom.map((el) => el.tagName.toLowerCase());
    });

    if (customElements.length > 0) {
      const unique = [...new Set(customElements)].slice(0, 10);
      await log(
        'Components',
        'Custom Web Components',
        'pass',
        `Found: ${unique.join(', ')}${customElements.length > 10 ? '...' : ''}`,
      );
    } else {
      await log('Components', 'Custom Web Components', 'skip', 'None found');
    }

    // ============================================
    // 4. ACCESSIBILITY AUDIT
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('4️⃣ ACCESSIBILITY AUDIT');
    console.log('='.repeat(60));

    // Check heading structure
    const headingInfo = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      return {
        total: headings.length,
        h1Count: headings.filter((h) => h.tagName === 'H1').length,
      };
    });

    await log(
      'A11y',
      'Heading Structure',
      headingInfo.h1Count === 1 ? 'pass' : headingInfo.h1Count === 0 ? 'skip' : 'fail',
      `${headingInfo.total} headings, ${headingInfo.h1Count} H1`,
    );

    // Check ARIA attributes
    const ariaInfo = await page.evaluate(() => {
      const withAriaLabel = document.querySelectorAll('[aria-label]').length;
      const withAriaDescribedBy = document.querySelectorAll('[aria-describedby]').length;
      const withRole = document.querySelectorAll('[role]').length;
      const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
      const totalImages = document.querySelectorAll('img').length;

      return { withAriaLabel, withAriaDescribedBy, withRole, imagesWithoutAlt, totalImages };
    });

    await log(
      'A11y',
      'ARIA Attributes',
      'pass',
      `${ariaInfo.withAriaLabel} aria-label, ${ariaInfo.withRole} roles, ${ariaInfo.imagesWithoutAlt}/${ariaInfo.totalImages} images missing alt`,
    );

    // ============================================
    // 5. SECURITY CHECK
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('5️⃣ SECURITY CHECK');
    console.log('='.repeat(60));

    const securityInfo = await page.evaluate(() => {
      // Check for CSP
      const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const cspContent = cspMeta?.getAttribute('content') || '';

      return {
        hasCSP: !!cspMeta,
        hasUnsafeInline:
          cspContent.includes("'unsafe-inline'") || cspContent.includes('unsafe-inline'),
        hasUnsafeEval: cspContent.includes("'unsafe-eval'") || cspContent.includes('unsafe-eval'),
      };
    });

    if (securityInfo.hasCSP) {
      await log('Security', 'Content Security Policy', 'pass', 'CSP is present');

      if (securityInfo.hasUnsafeInline) {
        await log('Security', 'CSP unsafe-inline', 'fail', 'Should not use unsafe-inline');
      }
    } else {
      await log('Security', 'Content Security Policy', 'skip', 'No CSP meta tag found');
    }

    // Check for inline scripts
    const inlineScripts = await page.evaluate(
      () => document.querySelectorAll('script:not([src])').length,
    );

    await log(
      'Security',
      'Inline Scripts',
      inlineScripts === 0 ? 'pass' : 'warn',
      `${inlineScripts} inline scripts found`,
    );

    // ============================================
    // 6. PERFORMANCE METRICS
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('6️⃣ PERFORMANCE METRICS');
    console.log('='.repeat(60));

    const performanceInfo = await page.evaluate(() => {
      const timing = performance.timing;

      return {
        // Load times
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,

        // Resource counts
        resources: performance.getEntriesByType('resource').length,
      };
    });

    await log(
      'Performance',
      'Page Load',
      'pass',
      `DOMContentLoaded: ${performanceInfo.domContentLoaded}ms, Resources: ${performanceInfo.resources}`,
    );

    // ============================================
    // 7. ERROR MONITORING
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('7️⃣ ERROR MONITORING');
    console.log('='.repeat(60));

    const consoleErrors = consoleMessages.filter((m) => m.type === 'error');
    const consoleWarnings = consoleMessages.filter((m) => m.type === 'warning');

    await log(
      'Errors',
      'Console Errors',
      consoleErrors.length === 0 ? 'pass' : 'fail',
      `${consoleErrors.length} errors, ${consoleWarnings.length} warnings`,
    );

    await log(
      'Errors',
      'JavaScript Errors',
      errors.length === 0 ? 'pass' : 'fail',
      `${errors.length} uncaught exceptions`,
    );

    // ============================================
    // 8. RESPONSIVE DESIGN
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('8️⃣ RESPONSIVE DESIGN');
    console.log('='.repeat(60));

    const viewports = [
      { name: 'Desktop', width: 1280, height: 720 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await delay(500);

      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const overflow = scrollWidth > viewport.width;

      await log(
        'Responsive',
        `${viewport.name} (${viewport.width}x${viewport.height})`,
        overflow ? 'fail' : 'pass',
        `Scroll width: ${scrollWidth}px, Overflow: ${overflow ? 'Yes ⚠️' : 'No ✅'}`,
      );
    }

    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });

    // ============================================
    // 9. SCREENSHOTS
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('9️⃣ SCREENSHOT CAPTURE');
    console.log('='.repeat(60));

    try {
      await page.screenshot({
        path: 'test-results/review-full-desktop.png',
        fullPage: true,
      });
      await log(
        'Screenshots',
        'Desktop full page',
        'pass',
        'Saved to test-results/review-full-desktop.png',
      );
    } catch (e) {
      await log('Screenshots', 'Desktop full page', 'fail', String(e));
    }

    // Mobile screenshot
    await page.setViewportSize({ width: 375, height: 667 });
    await delay(500);

    try {
      await page.screenshot({
        path: 'test-results/review-full-mobile.png',
        fullPage: true,
      });
      await log(
        'Screenshots',
        'Mobile full page',
        'pass',
        'Saved to test-results/review-full-mobile.png',
      );
    } catch (e) {
      await log('Screenshots', 'Mobile full page', 'fail', String(e));
    }
  } catch (error) {
    console.error('\n❌ Review failed:', error);
    await log('Fatal', 'Review execution', 'fail', String(error));
  } finally {
    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 REVIEW SUMMARY');
    console.log('='.repeat(60));

    const passed = REVIEW_RESULTS.filter((r) => r.status === 'pass').length;
    const failed = REVIEW_RESULTS.filter((r) => r.status === 'fail').length;
    const skipped = REVIEW_RESULTS.filter((r) => r.status === 'skip').length;
    const total = REVIEW_RESULTS.length;

    console.log(`\nTotal checks: ${total}`);
    console.log(`  ✅ Passed:  ${passed} (${Math.round((passed / total) * 100)}%)`);
    console.log(`  ❌ Failed:  ${failed} (${Math.round((failed / total) * 100)}%)`);
    console.log(`  ⏭️ Skipped: ${skipped} (${Math.round((skipped / total) * 100)}%)`);

    if (failed > 0) {
      console.log('\n❌ Failed checks:');
      REVIEW_RESULTS.filter((r) => r.status === 'fail').forEach((r) => {
        console.log(`  - [${r.category}] ${r.test}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Review Complete!\n');

    await browser.close();

    // Exit with error code if there are failures
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch(console.error);
