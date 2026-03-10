/**
 * Page Objects index file
 *
 * This module exports all Page Object Models for E2E testing.
 * Use this file to import page objects in your tests.
 *
 * @example
 * ```typescript
 * import { ClarificationPage, OkrStickyPage } from '../page-objects';
 *
 * test('example', async ({ page }) => {
 *   const clarification = new ClarificationPage(page);
 *   await clarification.startClarification('提高效率');
 * });
 * ```
 */

// Base Page
export { BasePage, DEFAULT_TIMEOUTS, type TimeoutConfig } from './base.page';

// Page Objects
export { ClarificationPage } from './clarification.page';

// Components
export { LoadingComponent } from './components/loading.component';
export { ErrorMessageComponent } from './components/error-message.component';
