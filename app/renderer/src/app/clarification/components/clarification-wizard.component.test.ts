import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import { Logger } from '../../core/services/logger.service';
import { ClarificationStateMachine } from '../services/clarification-state-machine.service';
import { ClarificationWizardComponent } from './clarification-wizard.component';

function buildPrompt(): ClarificationPrompt {
  return {
    id: 'prompt-1',
    question: 'Choose the focus of your goal',
    sequence: 0,
    context: 'Select the area to explore first',
    options: [
      { id: 'opt-1', label: 'Team productivity', description: undefined, scopeTag: 'team' },
      { id: 'opt-2', label: 'Customer success', description: undefined, scopeTag: 'customer' },
    ],
  } satisfies ClarificationPrompt;
}

describe('ClarificationWizardComponent', () => {
  let fixture: ComponentFixture<ClarificationWizardComponent>;
  let component: ClarificationWizardComponent;
  let state: ClarificationStateMachine;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClarificationWizardComponent],
      providers: [
        ClarificationStateMachine,
        {
          provide: Logger,
          useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClarificationWizardComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(ClarificationStateMachine);

    // Reset state before each test
    state.reset();
  });

  // Helper function to transition from idle -> loading -> prompting
  function setupPromptingState(): void {
    state.setLoading(true);
    state.setLoading(false);
    state.setPrompt(buildPrompt());
  }

  // Helper function to transition to error state
  function setupErrorState(message: string, recoverable: boolean): void {
    state.setLoading(true);
    state.setLoading(false);
    state.setError({ message, recoverable });
  }

  it('digits and Esc typed in a textarea, a select or a contenteditable never drive the wizard', () => {
    setupPromptingState();
    state.recordSelection('prompt-1', 'opt-1');
    fixture.detectChanges();
    const selected = jest.fn();
    const back = jest.fn();
    component.optionSelected.subscribe(selected);
    component.goBack.subscribe(back);
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editable.append(inner);
    document.body.append(textarea, select, editable);
    try {
      for (const target of [textarea, select, editable, inner]) {
        const digit = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
        target.dispatchEvent(digit);
        expect(digit.defaultPrevented).toBe(false);
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
      expect(selected).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled();
    } finally {
      textarea.remove();
      select.remove();
      editable.remove();
    }
  });

  it('nothing reaches the wizard while a modal dialog is open', () => {
    setupPromptingState();
    fixture.detectChanges();
    const selected = jest.fn();
    component.optionSelected.subscribe(selected);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', cancelable: true }));
      expect(selected).not.toHaveBeenCalled();
    } finally {
      modal.remove();
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', cancelable: true }));
    expect(selected).toHaveBeenCalledWith('opt-1');
  });

  it('honors keyboard selection and navigation without intercepting text entry', () => {
    setupPromptingState();
    fixture.detectChanges();
    const selected = jest.fn();
    const back = jest.fn();
    const generated = jest.fn();
    component.optionSelected.subscribe(selected);
    component.goBack.subscribe(back);
    component.generate.subscribe(generated);
    const second = new KeyboardEvent('keydown', { key: '2', cancelable: true });
    document.dispatchEvent(second);
    expect(selected).toHaveBeenCalledWith('opt-2');
    expect(second.defaultPrevented).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }));
    const textInput = document.createElement('input');
    document.body.append(textInput);
    textInput.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    textInput.remove();
    expect(selected).toHaveBeenCalledTimes(1);
    const option: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="clarification-option"]',
    );
    option.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(selected).toHaveBeenLastCalledWith('opt-1');
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(back).toHaveBeenCalledTimes(1);
    state.recordSelection('prompt-1', 'opt-1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(back).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(generated).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(generated).toHaveBeenCalledTimes(1);
    state.reset();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(selected).toHaveBeenCalledTimes(2);
    expect(component.progressTotal).toBe(5);
  });

  it('renders prompt and emits selected option id on click', () => {
    // Given: component in prompting state
    setupPromptingState();
    fixture.detectChanges();

    const optionNodes = fixture.nativeElement.querySelectorAll(
      '[data-testid="clarification-option"]',
    ) as NodeListOf<HTMLButtonElement>;
    const buttons: HTMLButtonElement[] = Array.from(optionNodes);
    expect(buttons.length).toBeGreaterThan(0);

    const optionSelectedSpy = jest.fn();
    component.optionSelected.subscribe(optionSelectedSpy);

    // When: user clicks first option
    buttons[0].click();

    // Then: event should be emitted with option id
    expect(optionSelectedSpy).toHaveBeenCalledWith('opt-1');
  });

  it('disables generate button until selection is made', () => {
    // Given: component in prompting state with no selection (not ready)
    setupPromptingState();
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector(
      '[data-testid="clarification-generate"]',
    ) as HTMLButtonElement | null;
    expect(generateButton).toBeTruthy();
    expect(generateButton?.disabled).toBe(true);

    // When: user makes a selection (which makes component ready to generate)
    state.recordSelection('prompt-1', 'opt-1');
    fixture.detectChanges();

    // Then: generate button should be enabled
    const updatedButton = fixture.nativeElement.querySelector(
      '[data-testid="clarification-generate"]',
    ) as HTMLButtonElement | null;
    expect(updatedButton?.disabled).toBe(false);
  });

  it('emits generate event when generate button is clicked', () => {
    // Given: component in ready state (after selection)
    setupPromptingState();
    state.recordSelection('prompt-1', 'opt-1');
    fixture.detectChanges();

    const generateSpy = jest.fn();
    component.generate.subscribe(generateSpy);

    const generateButton = fixture.nativeElement.querySelector(
      '[data-testid="clarification-generate"]',
    ) as HTMLButtonElement;

    expect(generateButton).toBeTruthy();

    // When: user clicks generate button
    generateButton.click();

    // Then: generate event should be emitted
    expect(generateSpy).toHaveBeenCalled();
  });

  it('emits retry event when retry button is clicked in error state', () => {
    // Given: component in error state
    setupErrorState('Test error', true);
    fixture.detectChanges();

    const retrySpy = jest.fn();
    component.retry.subscribe(retrySpy);

    const retryButton = fixture.nativeElement.querySelector(
      '[data-testid="retry-button"]',
    ) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();

    // When: user clicks retry button
    retryButton.click();

    // Then: retry event should be emitted
    expect(retrySpy).toHaveBeenCalled();
  });

  it('displays error message when in error state', () => {
    // Given: component in error state
    const errorMessage = 'Something went wrong';
    setupErrorState(errorMessage, true);
    fixture.detectChanges();

    // Then: error message should be displayed
    const errorElement = fixture.nativeElement.querySelector('[data-testid="error-message"]');
    expect(errorElement).toBeTruthy();
    expect(errorElement.textContent).toContain(errorMessage);
  });

  it('displays loading state when loading', () => {
    // Given: component in loading state
    state.setLoading(true);
    fixture.detectChanges();

    // Then: loading state should be displayed (skeleton or loading indicator)
    // The component shows skeleton components during loading
    const skeletonElement = fixture.nativeElement.querySelector('clarityokr-skeleton');
    expect(skeletonElement).toBeTruthy();
  });
});
