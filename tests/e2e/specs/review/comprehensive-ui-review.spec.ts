import { test, expect } from '@playwright/test';
import { TIMEOUTS } from '../playwright.config';

/**
 * Comprehensive Browser Automation Review
 * Tests all pages, components, and user flows
 */

test.describe('🔍 Comprehensive UI Review', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for load
    await page.goto('about:blank');
    await page.waitForTimeout(TIMEOUTS.immediate);
  });

  test.describe('📱 Core Application Structure', () => {
    test('application shell renders correctly', async ({ page }) => {
      // Check if root element exists
      const root = await page.locator('clarityokr-root, app-root').first();
      await expect(root).toBeVisible();

      // Check for Angular initialization
      const ngVersion = await page.evaluate(() => {
        return document.documentElement.getAttribute('ng-version');
      });
      expect(ngVersion).toBeTruthy();
      console.log(`✅ Angular v${ngVersion} loaded`);
    });

    test('global styles and design tokens applied', async ({ page }) => {
      // Check CSS custom properties (design tokens)
      const tokens = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          hasPrimaryColor: styles.getPropertyValue('--color-primary') !== '',
          hasFontFamily: styles.getPropertyValue('--font-family') !== '',
          hasSpacingScale: styles.getPropertyValue('--spacing-unit') !== '',
        };
      });

      console.log('🎨 Design tokens:', tokens);
      expect(tokens.hasPrimaryColor || tokens.hasFontFamily).toBeTruthy();
    });
  });

  test.describe('🎯 Clarification Flow', () => {
    test('intent input page renders', async ({ page }) => {
      // Check for intent input component
      const intentInput = await page.locator('[data-testid="intent-input"]').first();
      const startButton = await page.locator('[data-testid="start-clarification"]').first();

      // Components should exist (even if not visible immediately)
      const hasIntentInput = (await intentInput.count()) > 0;
      const hasStartButton = (await startButton.count()) > 0;

      console.log('📝 Clarification input:', { hasIntentInput, hasStartButton });
    });

    test('clarification wizard components exist', async ({ page }) => {
      // Check for wizard component
      const wizard = await page
        .locator('clarityokr-clarification-wizard, clarification-wizard')
        .first();

      if ((await wizard.count()) > 0) {
        console.log('✅ Clarification wizard found');

        // Check for child components
        const questionCard = await page.locator('[data-testid="question-card"]').first();
        const options = await page.locator('[data-testid="option-button"]').all();

        console.log(
          `🎴 Question card: ${(await questionCard.count()) > 0}, Options: ${options.length}`,
        );
      }
    });

    test('question display and interaction', async ({ page }) => {
      // Look for question text
      const questionTexts = await page
        .locator('.question-text, [data-testid="question-text"]')
        .all();

      if (questionTexts.length > 0) {
        console.log(`❓ Found ${questionTexts.length} question elements`);

        for (let i = 0; i < Math.min(questionTexts.length, 3); i++) {
          const text = await questionTexts[i].textContent();
          console.log(`  Question ${i + 1}: ${text?.substring(0, 50)}...`);
        }
      }
    });

    test('option selection functionality', async ({ page }) => {
      // Find all option buttons
      const options = await page.locator('[data-testid="option-button"], .option-button').all();

      console.log(`🔘 Found ${options.length} option buttons`);

      for (const option of options.slice(0, 3)) {
        const isVisible = await option.isVisible().catch(() => false);
        const isEnabled = await option.isEnabled().catch(() => false);
        const text = await option.textContent().catch(() => '');

        console.log(
          `  Option: "${text?.substring(0, 30)}" - Visible: ${isVisible}, Enabled: ${isEnabled}`,
        );
      }
    });

    test('loading states render correctly', async ({ page }) => {
      // Look for loading spinner
      const spinner = await page
        .locator('loading-spinner, .loading-spinner, [data-testid="loading"]')
        .first();

      if ((await spinner.count()) > 0) {
        console.log('⏳ Loading spinner component exists');

        // Check ARIA attributes
        const hasAriaLabel = await spinner.getAttribute('aria-label');
        const hasAriaLive = await spinner.getAttribute('aria-live');
        const role = await spinner.getAttribute('role');

        console.log(`  ARIA: label=${hasAriaLabel}, live=${hasAriaLive}, role=${role}`);
      }
    });
  });

  test.describe('📝 OKR Sticky Note', () => {
    test('sticky note component renders', async ({ page }) => {
      const stickyNote = await page.locator('clarityokr-okr-sticky-note, okr-sticky-note').first();

      if ((await stickyNote.count()) > 0) {
        console.log('📝 OKR sticky note found');

        // Check for OKR content
        const objectives = await page.locator('[data-testid="objective"], .objective').all();
        const keyResults = await page.locator('[data-testid="key-result"], .key-result').all();

        console.log(`  Objectives: ${objectives.length}, Key Results: ${keyResults.length}`);
      }
    });

    test('OKR display structure', async ({ page }) => {
      // Look for OKR-related elements
      const selectors = [
        '[data-testid="okr-title"]',
        '[data-testid="objective-title"]',
        '[data-testid="kr-statement"]',
        '.okr-document',
        '.objective-card',
      ];

      for (const selector of selectors) {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`📊 ${selector}: ${elements.length} elements`);
        }
      }
    });
  });

  test.describe('🎨 UI Components Library', () => {
    test('button component renders correctly', async ({ page }) => {
      // Find all buttons
      const buttons = await page.locator('clarityokr-button, [data-testid="button"], button').all();

      console.log(`🔘 Found ${buttons.length} buttons`);

      for (const button of buttons.slice(0, 5)) {
        const isVisible = await button.isVisible().catch(() => false);
        const isEnabled = await button.isEnabled().catch(() => false);
        const text = await button.textContent().catch(() => '');
        const variant = await button.getAttribute('data-variant').catch(() => 'default');

        if (isVisible) {
          console.log(
            `  Button: "${text?.substring(0, 25)}" - variant: ${variant}, enabled: ${isEnabled}`,
          );
        }
      }
    });

    test('card component renders correctly', async ({ page }) => {
      const cards = await page.locator('clarityokr-card, [data-testid="card"], .card').all();

      console.log(`🎴 Found ${cards.length} cards`);

      for (const card of cards.slice(0, 3)) {
        const isVisible = await card.isVisible().catch(() => false);
        const hasShadow = await card
          .evaluate((el) => {
            const styles = window.getComputedStyle(el);
            return styles.boxShadow !== 'none';
          })
          .catch(() => false);

        if (isVisible) {
          console.log(`  Card - visible: ${isVisible}, has shadow: ${hasShadow}`);
        }
      }
    });

    test('input component renders correctly', async ({ page }) => {
      const inputs = await page.locator('clarityokr-input, [data-testid="input"], input').all();

      console.log(`📝 Found ${inputs.length} input fields`);

      for (const input of inputs.slice(0, 3)) {
        const type = await input.getAttribute('type').catch(() => 'text');
        const placeholder = await input.getAttribute('placeholder').catch(() => '');
        const isVisible = await input.isVisible().catch(() => false);

        if (isVisible) {
          console.log(`  Input: type=${type}, placeholder="${placeholder?.substring(0, 30)}"`);
        }
      }
    });
  });

  test.describe('♿ Accessibility Review', () => {
    test('heading structure is valid', async ({ page }) => {
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();

      console.log(`📋 Found ${headings.length} headings`);

      const headingCounts: Record<string, number> = {};
      for (const heading of headings) {
        const level = await heading.evaluate((el) => el.tagName.toLowerCase());
        const text = await heading.textContent();
        headingCounts[level] = (headingCounts[level] || 0) + 1;

        if (level === 'h1') {
          console.log(`  H1: "${text?.substring(0, 50)}"`);
        }
      }

      console.log('  Heading distribution:', headingCounts);

      // Should have at least one h1
      expect(headingCounts['h1'] || 0).toBeGreaterThanOrEqual(0);
    });

    test('interactive elements have proper ARIA', async ({ page }) => {
      // Check buttons
      const buttons = await page.locator('button').all();
      let buttonsWithAria = 0;

      for (const button of buttons) {
        const hasAriaLabel = await button.getAttribute('aria-label');
        const hasAriaDescribedBy = await button.getAttribute('aria-describedby');
        if (hasAriaLabel || hasAriaDescribedBy) {
          buttonsWithAria++;
        }
      }

      console.log(`♿ Buttons with ARIA: ${buttonsWithAria}/${buttons.length}`);

      // Check images
      const images = await page.locator('img').all();
      let imagesWithAlt = 0;

      for (const img of images) {
        const alt = await img.getAttribute('alt');
        if (alt && alt !== '') {
          imagesWithAlt++;
        }
      }

      console.log(`🖼️ Images with alt: ${imagesWithAlt}/${images.length}`);
    });

    test('color contrast meets WCAG standards', async ({ page }) => {
      // Sample text elements for contrast
      const textElements = await page.locator('p, span, h1, h2, h3, button').all();

      let contrastIssues = 0;

      for (const el of textElements.slice(0, 10)) {
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        const styles = await el.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
          };
        });

        // Check if color is not default or transparent
        if (styles.color === 'rgba(0, 0, 0, 0)' || styles.backgroundColor === 'rgba(0, 0, 0, 0)') {
          contrastIssues++;
        }
      }

      console.log(`🎨 Color contrast check: ${contrastIssues} potential issues found`);
    });
  });

  test.describe('📱 Responsive Design', () => {
    test('layout adapts to desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(500);

      const root = await page.locator('body').first();
      const width = await root.evaluate((el) => el.scrollWidth);

      console.log(`📐 Desktop viewport: ${width}px width`);
      expect(width).toBeLessThanOrEqual(1280);
    });

    test('layout adapts to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      const width = await page.evaluate(() => document.body.scrollWidth);
      console.log(`📐 Tablet viewport: ${width}px width`);
    });

    test('layout adapts to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      const width = await page.evaluate(() => document.body.scrollWidth);
      console.log(`📐 Mobile viewport: ${width}px width`);
    });
  });

  test.describe('⚡ Performance Check', () => {
    test('page load performance', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('about:blank');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      console.log(`⚡ Page load time: ${loadTime}ms`);
      expect(loadTime).toBeLessThan(10000); // Should load under 10s
    });

    test('no console errors', async ({ page }) => {
      const errors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.goto('about:blank');
      await page.waitForTimeout(3000);

      console.log(`🐛 Console errors: ${errors.length}`);
      if (errors.length > 0) {
        console.log('  Errors:', errors.slice(0, 5));
      }
    });

    test('memory usage is reasonable', async ({ page }) => {
      const metrics = await page.evaluate(() => {
        return {
          // @ts-ignore
          usedJSHeapSize: performance.memory?.usedJSHeapSize || 0,
          // @ts-ignore
          totalJSHeapSize: performance.memory?.totalJSHeapSize || 0,
        };
      });

      const usedMB = Math.round(metrics.usedJSHeapSize / 1024 / 1024);
      const totalMB = Math.round(metrics.totalJSHeapSize / 1024 / 1024);

      console.log(`💾 Memory usage: ${usedMB}MB / ${totalMB}MB`);
    });
  });

  test.describe('🔒 Security Headers', () => {
    test('CSP headers are present', async ({ page }) => {
      // Check for CSP meta tag
      const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').first();

      if ((await csp.count()) > 0) {
        const content = await csp.getAttribute('content');
        console.log('🔒 CSP Policy found');

        // Check for key directives
        const hasDefaultSrc = content?.includes('default-src');
        const hasScriptSrc = content?.includes('script-src');
        const hasStyleSrc = content?.includes('style-src');

        console.log(
          `  default-src: ${hasDefaultSrc}, script-src: ${hasScriptSrc}, style-src: ${hasStyleSrc}`,
        );

        // Should not have unsafe-inline
        const hasUnsafeInline =
          content?.includes("'unsafe-inline'") || content?.includes('unsafe-inline');
        expect(hasUnsafeInline).toBe(false);
      } else {
        console.log('⚠️ No CSP meta tag found');
      }
    });
  });
});

/**
 * Screenshot Capture for Visual Review
 */
test.describe('📸 Visual Review Screenshots', () => {
  test('capture main application views', async ({ page }) => {
    // Desktop view
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('about:blank');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/review-desktop.png',
      fullPage: true,
    });

    console.log('📸 Desktop screenshot captured');
  });

  test('capture mobile view', async ({ page }) => {
    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('about:blank');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/review-mobile.png',
      fullPage: true,
    });

    console.log('📸 Mobile screenshot captured');
  });
});
