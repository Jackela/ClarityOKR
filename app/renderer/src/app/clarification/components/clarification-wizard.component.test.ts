import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { vi, describe, it, expect } from 'vitest';

import { SyncClarificationState } from '../services/sync-clarification-state.service';
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
  let state: SyncClarificationState;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClarificationWizardComponent],
      providers: [SyncClarificationState],
    }).compileComponents();

    fixture = TestBed.createComponent(ClarificationWizardComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(SyncClarificationState);

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

  it('renders prompt and emits selected option id on click', () => {
    // Given: component in prompting state
    setupPromptingState();
    fixture.detectChanges();

    const optionNodes = fixture.nativeElement.querySelectorAll(
      'button.option',
    ) as NodeListOf<HTMLButtonElement>;
    const buttons: HTMLButtonElement[] = Array.from(optionNodes);
    const optionSelectedSpy = vi.fn();
    component.optionSelected.subscribe(optionSelectedSpy);

    // When: user clicks first option
    buttons[0].click();

    // Then: event should be emitted with option id
    expect(optionSelectedSpy).toHaveBeenCalledWith('opt-1');
  });

  it('disables generate button until ready flag is true', () => {
    // Given: component in prompting state with generate not ready
    setupPromptingState();
    state.setReady(false);
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement | null;
    expect(generateButton?.disabled).toBe(true);

    // When: component becomes ready to generate
    state.setReady(true);
    fixture.detectChanges();

    // Then: generate button should be enabled
    const updatedButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement | null;
    expect(updatedButton?.disabled).toBe(false);
  });

  it('emits generate event when generate button is clicked', () => {
    // Given: component in ready state
    setupPromptingState();
    state.setReady(true);
    fixture.detectChanges();

    const generateSpy = vi.fn();
    component.generate.subscribe(generateSpy);

    const generateButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement;

    // When: user clicks generate button
    generateButton.click();

    // Then: generate event should be emitted
    expect(generateSpy).toHaveBeenCalled();
  });

  it('emits retry event when retry button is clicked in error state', () => {
    // Given: component in error state
    setupErrorState('Test error', true);
    fixture.detectChanges();

    const retrySpy = vi.fn();
    component.retry.subscribe(retrySpy);

    const retryButton = fixture.nativeElement.querySelector('button.retry') as HTMLButtonElement;

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

  it('displays loading indicator when loading', () => {
    // Given: component in loading state
    state.setLoading(true);
    fixture.detectChanges();

    // Then: loading indicator should be displayed
    const loadingElement = fixture.nativeElement.querySelector(
      '[data-testid="clarification-loading"]',
    );
    expect(loadingElement).toBeTruthy();
  });
});
