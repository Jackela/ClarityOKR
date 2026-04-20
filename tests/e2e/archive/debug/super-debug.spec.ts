import { test, expect } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';

test('SUPER DEBUG: All methods to detect error element', async ({ mainWindow, mockServer }) => {
  const clarification = new ClarificationPage(mainWindow);

  mockServer.setResponses({
    nextQuestion: () => null, // Force 503 error
  });

  await clarification.waitForReady();
  await clarification.startClarification('测试超级调试');

  // Wait for error to be set
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('=== SUPER DEBUG START ===');

  // Method 1: Playwright locator
  const method1 = await mainWindow.locator('[data-testid="error-message"]').count();
  console.log('Method 1 - Playwright locator count:', method1);

  // Method 2: Playwright getByTestId
  const method2 = await mainWindow.getByTestId('error-message').count();
  console.log('Method 2 - getByTestId count:', method2);

  // Method 3: page.evaluate with querySelector
  const method3 = await mainWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="error-message"]');
    return {
      exists: el !== null,
      tagName: el?.tagName,
      textContent: el?.textContent?.substring(0, 100),
      innerHTML: el?.innerHTML?.substring(0, 200),
      parentElement: el?.parentElement?.tagName,
      parentHTML: el?.parentElement?.innerHTML?.substring(0, 500),
    };
  });
  console.log('Method 3 - querySelector:', JSON.stringify(method3, null, 2));

  // Method 4: page.evaluate with getElementsByTagName
  const method4 = await mainWindow.evaluate(() => {
    const sections = document.getElementsByTagName('section');
    const results: Array<{ sectionIndex: number; sectionHTML: string }> = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const errorDiv = section.querySelector('[data-testid="error-message"]');
      if (errorDiv) {
        results.push({
          sectionIndex: i,
          sectionHTML: section.innerHTML.substring(0, 1000),
        });
      }
    }
    return results;
  });
  console.log('Method 4 - getElementsByTagName:', JSON.stringify(method4, null, 2));

  // Method 5: page.evaluate with XPath
  const method5 = await mainWindow.evaluate(() => {
    const xpath = "//*[@data-testid='error-message']";
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const el = result.singleNodeValue as HTMLElement | null;
    return {
      exists: el !== null,
      tagName: el?.tagName,
      outerHTML: el?.outerHTML?.substring(0, 300),
    };
  });
  console.log('Method 5 - XPath:', JSON.stringify(method5, null, 2));

  // Method 6: Check wizard component specifically
  const method6 = await mainWindow.evaluate(() => {
    const wizard = document.querySelector('clarityokr-clarification-wizard');
    if (!wizard) return { wizardExists: false };

    // Check shadow root
    const shadowRoot = (wizard as any).shadowRoot;

    // Check inside wizard
    const errorInWizard = wizard.querySelector('[data-testid="error-message"]');

    return {
      wizardExists: true,
      hasShadowRoot: !!shadowRoot,
      errorInWizard: !!errorInWizard,
      wizardInnerHTML: wizard.innerHTML.substring(0, 1000),
    };
  });
  console.log('Method 6 - Wizard check:', JSON.stringify(method6, null, 2));

  // Method 7: Get full body HTML
  const method7 = await mainWindow.evaluate(() => {
    return document.body.innerHTML.substring(0, 3000);
  });
  console.log('Method 7 - Body HTML (first 3000 chars):', method7);

  // Method 8: Check if error-container class exists
  const method8 = await mainWindow.evaluate(() => {
    const elements = document.getElementsByClassName('error-container');
    const results: Array<{
      index: number;
      tagName: string;
      textContent: string | undefined;
      hasRetryButton: boolean;
      style: { display: string; visibility: string };
      computedStyle: { display: string; visibility: string; opacity: string };
    }> = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      results.push({
        index: i,
        tagName: el.tagName,
        textContent: el.textContent?.substring(0, 100),
        hasRetryButton: !!el.querySelector('[data-testid="retry-button"]'),
        style: {
          display: (el as HTMLElement).style.display,
          visibility: (el as HTMLElement).style.visibility,
        },
        computedStyle: {
          display: window.getComputedStyle(el).display,
          visibility: window.getComputedStyle(el).visibility,
          opacity: window.getComputedStyle(el).opacity,
        },
      });
    }
    return results;
  });
  console.log('Method 8 - error-container class:', JSON.stringify(method8, null, 2));

  // Method 9: Check Angular specific attributes
  const method9 = await mainWindow.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const results: Array<{
      tagName: string;
      textContent: string;
      dataTestid: string | null;
      className: string;
    }> = [];
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el.textContent?.includes('重试') || el.textContent?.includes('网络错误')) {
        results.push({
          tagName: el.tagName,
          textContent: el.textContent?.substring(0, 100) || '',
          dataTestid: el.getAttribute('data-testid'),
          className: el.className,
        });
      }
    }
    return results;
  });
  console.log('Method 9 - Text search for "重试" or "网络错误":', JSON.stringify(method9, null, 2));

  // Method 10: Check if wizard is even rendered
  const method10 = await mainWindow.evaluate(() => {
    const wizard = document.querySelector('clarityokr-clarification-wizard');
    const wizardPanel = document.querySelector('.wizard-panel');
    return {
      wizardExists: !!wizard,
      wizardPanelExists: !!wizardPanel,
      wizardPanelHTML: wizardPanel?.innerHTML?.substring(0, 1000),
      wizardPanelDisplay: wizardPanel ? window.getComputedStyle(wizardPanel).display : null,
    };
  });
  console.log('Method 10 - Wizard rendering:', JSON.stringify(method10, null, 2));

  console.log('=== SUPER DEBUG END ===');

  // Screenshot
  await mainWindow.screenshot({ path: 'test-results/super-debug-screenshot.png', fullPage: true });

  // At least one method should find the error
  expect(method1 + method2).toBeGreaterThan(0);
});
