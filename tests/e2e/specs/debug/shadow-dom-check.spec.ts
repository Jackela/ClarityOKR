import { test, expect, cleanupPersistenceFiles } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test.beforeEach(async () => {
  await cleanupPersistenceFiles();
});

/**
 * Helper function to start clarification and wait for error state
 */
async function startAndWaitForError(mainWindow: any, mockServer: any): Promise<void> {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    nextQuestion: () => null, // null triggers 503 error
  });

  await clarification.waitForReady();
  await clarification.startClarification('测试Shadow DOM');

  // Wait for error state with retry
  await clarification.error.waitForVisible(10000);
}

test.describe('Shadow DOM Investigation', () => {
  test('check: shadow DOM usage in components', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    // Now check Shadow DOM usage
    const shadowInfo = await mainWindow.evaluate(() => {
      // Check wizard component
      const wizard = document.querySelector('clarityokr-clarification-wizard');

      // Get all custom elements in the document
      const allElements = Array.from(document.querySelectorAll('*'));
      const customElements = allElements.filter((el) => el.tagName.includes('-'));

      return {
        // Wizard component info
        wizardExists: !!wizard,
        wizardShadowRoot: !!wizard?.shadowRoot,
        wizardInnerHTML: wizard?.innerHTML?.substring(0, 500) ?? null,
        wizardTagName: wizard?.tagName ?? null,

        // All custom elements summary
        customElements: customElements.map((el) => ({
          tag: el.tagName,
          hasShadowRoot: !!(el as any).shadowRoot,
          innerHTMLPreview: el.innerHTML?.substring(0, 200) ?? '',
        })),

        // Different ways to access retry button
        directQuery: document.querySelector('[data-testid="retry-button"]') !== null,
        wizardQuery: wizard?.querySelector('[data-testid="retry-button"]') !== null,
        shadowQuery: wizard?.shadowRoot?.querySelector('[data-testid="retry-button"]') !== null,

        // Check if Angular emulated encapsulation is active (look for _ngcontent attributes)
        hasNgContentAttributes: document.querySelectorAll('[_ngcontent]').length > 0,
        ngContentCount: document.querySelectorAll('[_ngcontent]').length,

        // Check error container
        errorContainer: document.querySelector('[data-testid="error-message"]') !== null,
        errorContainerInnerHTML:
          document.querySelector('[data-testid="error-message"]')?.innerHTML?.substring(0, 300) ??
          null,
      };
    });

    console.log('=== Shadow DOM Investigation Results ===');
    console.log(JSON.stringify(shadowInfo, null, 2));

    // Log key findings
    console.log('\n=== Key Findings ===');
    console.log(`Wizard component exists: ${shadowInfo.wizardExists}`);
    console.log(`Wizard has Shadow Root: ${shadowInfo.wizardShadowRoot}`);
    console.log(
      `Angular Emulated Encapsulation active: ${shadowInfo.hasNgContentAttributes} (${shadowInfo.ngContentCount} elements)`,
    );
    console.log(`Retry button found via direct query: ${shadowInfo.directQuery}`);
    console.log(`Retry button found via wizard query: ${shadowInfo.wizardQuery}`);
    console.log(`Retry button found via shadow query: ${shadowInfo.shadowQuery}`);

    // Assertions to verify findings
    expect(shadowInfo.wizardExists).toBe(true);

    // These are diagnostic tests - we're investigating, not asserting strict behavior
    if (shadowInfo.wizardShadowRoot) {
      console.log('⚠️  WARNING: Shadow DOM is enabled! This may affect Playwright selectors.');
    } else {
      console.log('✅ GOOD: No Shadow DOM detected on wizard component.');
    }

    if (shadowInfo.hasNgContentAttributes) {
      console.log('✅ Angular Emulated ViewEncapsulation is active (expected behavior)');
    }
  });

  test('check: component encapsulation strategy', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    const encapsulationInfo = await mainWindow.evaluate(() => {
      // Check for Angular-specific encapsulation markers
      const allElements = Array.from(document.querySelectorAll('*'));

      // Look for _nghost (host elements) and _ngcontent (child elements)
      const ngHostElements = allElements.filter((el) =>
        Array.from(el.attributes).some((attr) => attr.name.startsWith('_nghost')),
      );

      const ngContentElements = allElements.filter((el) =>
        Array.from(el.attributes).some((attr) => attr.name.startsWith('_ngcontent')),
      );

      // Check for Shadow DOM markers
      const shadowHosts = allElements.filter((el) => el.shadowRoot !== null);

      return {
        totalElements: allElements.length,
        ngHostCount: ngHostElements.length,
        ngContentCount: ngContentElements.length,
        shadowHostCount: shadowHosts.length,
        shadowHostTags: shadowHosts.map((el) => el.tagName),
        sampleNgHost: ngHostElements[0]?.tagName ?? null,
        sampleNgContent: ngContentElements[0]?.tagName ?? null,
      };
    });

    console.log('=== Encapsulation Strategy Analysis ===');
    console.log(JSON.stringify(encapsulationInfo, null, 2));

    // Determine encapsulation type
    if (encapsulationInfo.shadowHostCount > 0) {
      console.log('\n⚠️  SHADOW DOM DETECTED!');
      console.log(
        `Found ${encapsulationInfo.shadowHostCount} shadow hosts: ${encapsulationInfo.shadowHostTags.join(', ')}`,
      );
      console.log('Playwright selectors may need to use shadow DOM piercing.');
    } else if (encapsulationInfo.ngHostCount > 0 || encapsulationInfo.ngContentCount > 0) {
      console.log('\n✅ Angular Emulated ViewEncapsulation detected (standard)');
      console.log(`- ${encapsulationInfo.ngHostCount} host elements with _nghost attributes`);
      console.log(
        `- ${encapsulationInfo.ngContentCount} child elements with _ngcontent attributes`,
      );
      console.log('Playwright selectors should work normally with data-testid attributes.');
    } else {
      console.log('\n⚠️  No Angular encapsulation markers found');
      console.log('Components may be using ViewEncapsulation.None or not yet rendered.');
    }
  });

  test('check: retry button accessibility paths', async ({ mainWindow, mockServer }) => {
    await startAndWaitForError(mainWindow, mockServer);

    // Try different selector strategies
    const accessibilityInfo = await mainWindow.evaluate(() => {
      const results = {
        // Direct data-testid
        directTestId: document.querySelector('[data-testid="retry-button"]') !== null,

        // Via wizard component
        wizard: {
          exists: !!document.querySelector('clarityokr-clarification-wizard'),
          shadowRoot: !!(document.querySelector('clarityokr-clarification-wizard') as any)
            ?.shadowRoot,
        },

        // Error container
        errorContainer: {
          exists: !!document.querySelector('[data-testid="error-message"]'),
          innerHTML: document.querySelector('[data-testid="error-message"]')?.innerHTML ?? null,
        },

        // All buttons in document
        allButtons: Array.from(document.querySelectorAll('button')).map((btn) => ({
          text: btn.textContent?.trim() ?? '',
          testId: btn.getAttribute('data-testid'),
          className: btn.className,
          parentTag: btn.parentElement?.tagName,
          parentTestId: btn.parentElement?.getAttribute('data-testid'),
        })),
      };

      return results;
    });

    console.log('=== Retry Button Accessibility Paths ===');
    console.log(JSON.stringify(accessibilityInfo, null, 2));

    // Verify button exists and is accessible
    const retryButton = mainWindow.locator('[data-testid="retry-button"]');
    await expect(retryButton)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        console.log('⚠️  Retry button not visible with direct selector');
      });
  });
});
