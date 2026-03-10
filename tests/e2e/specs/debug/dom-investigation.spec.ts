import { test, expect } from '../../fixtures';
import { ClarificationPage } from '../../page-objects';
import { waitForStateChange, waitForLoadingComplete } from '../../helpers/native-dom';

test('investigate: DOM structure when error occurs', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({ nextQuestion: () => null });

  const clarification = new ClarificationPage(mainWindow);
  await clarification.waitForReady();
  await clarification.startClarification('测试目标');

  // FIX: 使用条件等待替代固定延迟
  // 等待加载状态出现然后消失，然后等待错误消息
  await waitForStateChange(mainWindow, {
    from: '[data-testid="clarification-loading"]',
    to: '[data-testid="error-message"]',
    timeout: 15000,
    stabilizationDelay: 200,
  });

  // 使用page.evaluate检查DOM
  const domInfo = await mainWindow.evaluate(() => {
    const errorContainer = document.querySelector('[data-testid="error-message"]');
    const retryButton = document.querySelector('[data-testid="retry-button"]');

    // 获取计算样式
    const getStyles = (el: Element | null) => {
      if (!el) return null;
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        position: computed.position,
        zIndex: computed.zIndex,
      };
    };

    // 检查Shadow DOM
    const wizard = document.querySelector('clarityokr-clarification-wizard');
    const shadowRoot = wizard?.shadowRoot;

    // 如果在shadow DOM中查找
    let shadowErrorContainer: Element | null = null;
    let shadowRetryButton: Element | null = null;
    if (shadowRoot) {
      shadowErrorContainer = shadowRoot.querySelector('[data-testid="error-message"]');
      shadowRetryButton = shadowRoot.querySelector('[data-testid="retry-button"]');
    }

    // 检查所有按钮
    const allButtons = document.querySelectorAll('button');
    const allButtonInfo = Array.from(allButtons).map((btn) => ({
      text: btn.textContent?.trim(),
      testId: btn.getAttribute('data-testid'),
      visible: btn.offsetParent !== null,
      style: {
        display: window.getComputedStyle(btn).display,
        visibility: window.getComputedStyle(btn).visibility,
      },
    }));

    return {
      // Light DOM
      lightDOM: {
        errorContainerExists: !!errorContainer,
        retryButtonExists: !!retryButton,
        errorContainerHTML: errorContainer ? errorContainer.outerHTML.substring(0, 500) : null,
        errorContainerStyle: getStyles(errorContainer),
        retryButtonStyle: getStyles(retryButton),
      },
      // Shadow DOM
      shadowDOM: {
        hasShadowRoot: !!shadowRoot,
        errorContainerExists: !!shadowErrorContainer,
        retryButtonExists: !!shadowRetryButton,
        errorContainerHTML: shadowErrorContainer
          ? shadowErrorContainer.outerHTML.substring(0, 500)
          : null,
        retryButtonHTML: shadowRetryButton ? shadowRetryButton.outerHTML.substring(0, 500) : null,
        errorContainerStyle: getStyles(shadowErrorContainer),
        retryButtonStyle: getStyles(shadowRetryButton),
      },
      // All buttons
      allButtons: allButtonInfo,
      // Page info
      pageInfo: {
        url: window.location.href,
        title: document.title,
        timestamp: Date.now(),
      },
    };
  });

  console.log('=== DOM Investigation Results ===');
  console.log(JSON.stringify(domInfo, null, 2));
  console.log('=== End DOM Investigation ===');

  // 分析结果并输出关键发现
  console.log('\n=== Key Findings ===');

  if (domInfo.lightDOM.errorContainerExists) {
    console.log('✓ Error container found in light DOM');
    console.log('  Style:', domInfo.lightDOM.errorContainerStyle);
  } else if (domInfo.shadowDOM.errorContainerExists) {
    console.log('✓ Error container found in shadow DOM');
    console.log('  Style:', domInfo.shadowDOM.errorContainerStyle);
  } else {
    console.log('✗ Error container NOT found in either light or shadow DOM');
  }

  if (domInfo.lightDOM.retryButtonExists) {
    console.log('✓ Retry button found in light DOM');
    console.log('  Style:', domInfo.lightDOM.retryButtonStyle);
  } else if (domInfo.shadowDOM.retryButtonExists) {
    console.log('✓ Retry button found in shadow DOM');
    console.log('  Style:', domInfo.shadowDOM.retryButtonStyle);
  } else {
    console.log('✗ Retry button NOT found in either light or shadow DOM');
    console.log('  Available buttons:', domInfo.allButtons);
  }

  // 截图保存
  await mainWindow.screenshot({ path: 'dom-investigation-screenshot.png' });
  console.log('Screenshot saved to dom-investigation-screenshot.png');

  // 验证发现 - 我们期望至少在一个地方找到retry button
  const retryFound = domInfo.lightDOM.retryButtonExists || domInfo.shadowDOM.retryButtonExists;
  expect(retryFound, 'Retry button should exist in DOM').toBe(true);
});

test('investigate: retry button visibility in depth', async ({ mainWindow, mockServer }) => {
  mockServer.setResponses({ nextQuestion: () => null });

  const clarification = new ClarificationPage(mainWindow);
  await clarification.waitForReady();
  await clarification.startClarification('测试目标');

  // FIX: 使用条件等待替代固定延迟
  await waitForLoadingComplete(mainWindow, { maxWaitTime: 15000 });

  // Wait for error message to appear
  await waitForStateChange(mainWindow, {
    to: '[data-testid="error-message"]',
    timeout: 10000,
  });

  // 深入检查可见性
  const visibilityInfo = await mainWindow.evaluate(() => {
    const checkVisibility = (el: Element | null): any => {
      if (!el) return { exists: false };

      const rect = el.getBoundingClientRect();
      const computed = window.getComputedStyle(el);

      // 检查父元素
      let parent = el.parentElement;
      let hiddenByParent = false;
      while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
          hiddenByParent = true;
          break;
        }
        parent = parent.parentElement;
      }

      // 使用类型断言访问HTMLElement属性
      const htmlEl = el as HTMLElement;

      return {
        exists: true,
        offsetParent: htmlEl.offsetParent !== null,
        boundingRect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
        },
        computedStyle: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
        },
        hiddenByParent,
        isConnected: el.isConnected,
      };
    };

    // 在light DOM中检查
    const lightError = document.querySelector('[data-testid="error-message"]');
    const lightRetry = document.querySelector('[data-testid="retry-button"]');

    // 在shadow DOM中检查
    const wizard = document.querySelector('clarityokr-clarification-wizard');
    const shadowRoot = wizard?.shadowRoot;
    const shadowError = shadowRoot?.querySelector('[data-testid="error-message"]') || null;
    const shadowRetry = shadowRoot?.querySelector('[data-testid="retry-button"]') || null;

    return {
      light: {
        error: checkVisibility(lightError),
        retry: checkVisibility(lightRetry),
      },
      shadow: {
        hasShadowRoot: !!shadowRoot,
        error: checkVisibility(shadowError),
        retry: checkVisibility(shadowRetry),
      },
    };
  });

  console.log('=== Visibility Investigation Results ===');
  console.log(JSON.stringify(visibilityInfo, null, 2));

  // 分析可见性问题
  console.log('\n=== Visibility Analysis ===');

  const lightRetry = visibilityInfo.light.retry;
  const shadowRetry = visibilityInfo.shadow.retry;

  if (lightRetry.exists) {
    console.log('Light DOM retry button analysis:');
    if (!lightRetry.isConnected) console.log('  - Not connected to DOM');
    if (!lightRetry.offsetParent)
      console.log('  - offsetParent is null (display:none or not in layout)');
    if (lightRetry.hiddenByParent) console.log('  - Hidden by parent element');
    if (lightRetry.boundingRect.width === 0 || lightRetry.boundingRect.height === 0) {
      console.log('  - Zero dimensions (possibly hidden)');
    }
    console.log('  - Computed style:', lightRetry.computedStyle);
  }

  if (shadowRetry.exists) {
    console.log('Shadow DOM retry button analysis:');
    if (!shadowRetry.isConnected) console.log('  - Not connected to DOM');
    if (!shadowRetry.offsetParent) console.log('  - offsetParent is null');
    if (shadowRetry.hiddenByParent) console.log('  - Hidden by parent element');
    if (shadowRetry.boundingRect.width === 0 || shadowRetry.boundingRect.height === 0) {
      console.log('  - Zero dimensions (possibly hidden)');
    }
    console.log('  - Computed style:', shadowRetry.computedStyle);
  }

  if (!lightRetry.exists && !shadowRetry.exists) {
    console.log('ERROR: Retry button not found in any DOM context!');
  }
});
