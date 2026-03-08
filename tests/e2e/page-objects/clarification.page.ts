import type { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';
import { LoadingComponent } from './components/loading.component';
import { ErrorMessageComponent } from './components/error-message.component';

/**
 * Page Object for the Clarification interview page.
 * Encapsulates all interactions with the clarification flow.
 */
export class ClarificationPage extends BasePage {
  // Locators
  readonly intentInput: Locator;
  readonly startButton: Locator;
  readonly questionText: Locator;
  readonly options: Locator;
  readonly generateButton: Locator;
  readonly okrSummary: Locator;

  // Components
  readonly loading: LoadingComponent;
  readonly error: ErrorMessageComponent;

  /**
   * Creates a new ClarificationPage instance.
   * @param page - The Playwright page instance
   */
  constructor(page: Page) {
    super(page);
    this.intentInput = page.locator('[data-testid="intent-input"]');
    this.startButton = page.locator('[data-testid="start-clarification"]');
    this.questionText = page.locator('[data-testid="prompt-question"]');
    this.options = page.locator('[data-testid="clarification-option"]');
    this.generateButton = page.locator('[data-testid="clarification-generate"]');
    this.okrSummary = page.locator('[data-testid="okr-summary"]');
    this.loading = new LoadingComponent(page);
    this.error = new ErrorMessageComponent(page);
  }

  /**
   * Navigate to the clarification page (no-op for main window).
   * The main window is already on this page.
   */
  async navigate(): Promise<void> {
    // Main window is already on the clarification page
  }

  /**
   * Wait for the clarification page to be ready.
   * Waits for the intent input to be visible.
   */
  async waitForReady(): Promise<void> {
    await this.intentInput.waitFor({ state: 'visible', timeout: this.timeouts.default });
  }

  /**
   * Start the clarification process with the given intent.
   * Fills the intent input and clicks the start button.
   * @param intent - The intent to clarify
   */
  async startClarification(intent: string): Promise<void> {
    await this.safeFill(this.intentInput, intent);
    await this.startButton.waitFor({ state: 'visible', timeout: this.timeouts.default });
    await this.safeClick(this.startButton);
  }

  /**
   * Select an option by index.
   * @param index - The index of the option to select (0-based)
   */
  async selectOption(index: number): Promise<void> {
    const option = this.options.nth(index);
    await option.waitFor({ state: 'visible', timeout: this.timeouts.default });
    await option.click();
  }

  /**
   * Select the first available option.
   */
  async selectFirstOption(): Promise<void> {
    await this.selectOption(0);
  }

  /**
   * Select the last available option.
   */
  async selectLastOption(): Promise<void> {
    const count = await this.options.count();
    await this.selectOption(count - 1);
  }

  /**
   * Answer a question by selecting an option and waiting for question change.
   * @param index - The index of the option to select (defaults to 0)
   */
  async answerQuestion(index = 0): Promise<void> {
    const currentQuestion = await this.getCurrentQuestion();
    await this.selectOption(index);
    await this.waitForQuestionChange(currentQuestion);
  }

  /**
   * Wait for the question to change from the current question, or for error to appear.
   * This method handles both normal flow (question changes) and error flow (error appears).
   * @param previousQuestion - The previous question text to compare against
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForQuestionChange(previousQuestion: string, timeout?: number): Promise<void> {
    const timeoutMs = timeout ?? this.timeouts.long;

    try {
      // Wait for either: question change, error appearance, or options to reappear
      await this.page.waitForFunction(
        (prevQuestion: string) => {
          // Check if error appeared
          const errorEl = document.querySelector('[data-testid="error-message"]');
          if (errorEl) return true;

          // Check if question changed
          const questionEl = document.querySelector('[data-testid="prompt-question"]');
          if (questionEl && questionEl.textContent !== prevQuestion) return true;

          // Check if options are available (indicates new prompt loaded)
          const options = document.querySelectorAll('[data-testid="clarification-option"]');
          if (options.length > 0) return true;

          return false;
        },
        previousQuestion,
        { timeout: timeoutMs },
      );
    } catch (e) {
      // If timeout, check if we're in error state
      const isError = await this.error.isVisible().catch(() => false);
      if (isError) {
        return; // Error state is valid end state
      }
      throw e;
    }
  }

  /**
   * Get the current question text.
   * @returns The question text
   */
  async getCurrentQuestion(): Promise<string> {
    await this.questionText.waitFor({ state: 'visible', timeout: this.timeouts.default });
    return this.questionText.innerText();
  }

  /**
   * Wait for a question to appear.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForQuestion(timeout?: number): Promise<void> {
    await this.questionText.waitFor({
      state: 'visible',
      timeout: timeout ?? this.timeouts.default,
    });
  }

  /**
   * Wait for options to be available.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForOptions(timeout?: number): Promise<void> {
    await this.options.first().waitFor({
      state: 'visible',
      timeout: timeout ?? this.timeouts.default,
    });
  }

  /**
   * Get the number of available options.
   * @returns The count of options
   */
  async getOptionCount(): Promise<number> {
    return this.options.count();
  }

  /**
   * Check if the generate button is visible.
   * @returns True if the generate button is visible
   */
  async isGenerateButtonVisible(): Promise<boolean> {
    try {
      await this.generateButton.waitFor({ state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the generate button is enabled.
   * @returns True if the generate button is enabled
   */
  async isGenerateButtonEnabled(): Promise<boolean> {
    return this.generateButton.isEnabled();
  }

  /**
   * Click the generate OKR button.
   */
  async generateOKR(): Promise<void> {
    await this.generateButton.waitFor({ state: 'visible', timeout: this.timeouts.default });
    await this.safeClick(this.generateButton);
  }

  /**
   * Wait for the OKR summary to be visible.
   * @param timeout - Optional timeout in milliseconds
   */
  async waitForOkrSummary(timeout?: number): Promise<void> {
    const timeoutMs = timeout ?? 30000; // Increased default timeout to 30s
    try {
      await this.okrSummary.waitFor({
        state: 'visible',
        timeout: timeoutMs,
      });
    } catch (e) {
      console.log(
        `[waitForOkrSummary] Timeout after ${timeoutMs}ms, checking if element exists in DOM`,
      );
      const count = await this.okrSummary.count();
      console.log(`[waitForOkrSummary] Element count: ${count}`);
      if (count > 0) {
        // Element exists but may not be visible, try waiting a bit more
        await new Promise((resolve) => setTimeout(resolve, 5000));
        await this.okrSummary.waitFor({ state: 'visible', timeout: 10000 });
      } else {
        throw e;
      }
    }
  }

  /**
   * Get the OKR summary text.
   * @returns The OKR summary text
   */
  async getOkrSummaryText(): Promise<string> {
    await this.waitForOkrSummary();
    return this.okrSummary.innerText();
  }

  /**
   * Check if an error has occurred.
   * @returns True if error message is visible
   */
  async hasError(): Promise<boolean> {
    return this.error.isVisible();
  }

  /**
   * Get the error message text.
   * @returns The error message text
   */
  async getErrorText(): Promise<string> {
    return this.error.getText();
  }

  /**
   * Click the retry button if visible.
   */
  async retry(): Promise<void> {
    await this.error.clickRetry();
  }

  /**
   * Complete the entire clarification flow.
   * @param intent - The intent to clarify
   * @param options - Configuration for the flow
   * @param options.questionCount - Number of questions to answer (default: 2)
   * @param options.selectOptionIndex - Index of option to select for each question (default: 0)
   * @param options.finalOptionIndex - Index of option for the last question (default: last option)
   */
  async completeClarificationFlow(
    intent: string,
    options?: {
      questionCount?: number;
      selectOptionIndex?: number;
      finalOptionIndex?: number;
    },
  ): Promise<void> {
    const questionCount = options?.questionCount ?? 2;
    const selectIndex = options?.selectOptionIndex ?? 0;

    await this.startClarification(intent);
    await this.waitForQuestion();

    for (let i = 0; i < questionCount; i++) {
      await this.waitForOptions();
      const currentQuestion = await this.getCurrentQuestion();

      // For the last question, use finalOptionIndex if specified, otherwise use last option
      if (i === questionCount - 1 && options?.finalOptionIndex !== undefined) {
        await this.selectOption(options.finalOptionIndex);
      } else if (i === questionCount - 1) {
        await this.selectLastOption();
      } else {
        await this.selectOption(selectIndex);
      }

      // Wait for question change or options to reappear (indicates state transition)
      if (i < questionCount - 1) {
        await this.waitForQuestionChange(currentQuestion);
      } else {
        // After the last question, just wait for generate button to be visible
        // and then wait a bit for Angular to update the disabled state
        await this.generateButton.waitFor({ state: 'visible', timeout: this.timeouts.long });
        // Wait for Angular change detection to update the button state
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    await this.generateOKR();
    await this.waitForOkrSummary();
  }

  /**
   * Get the value of the intent input.
   * @returns The current intent value
   */
  async getIntentValue(): Promise<string> {
    return this.intentInput.inputValue();
  }

  /**
   * Check if the start button is enabled.
   * @returns True if the start button is enabled
   */
  async isStartButtonEnabled(): Promise<boolean> {
    return this.startButton.isEnabled();
  }
}
