import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import { Logger } from '../../core/services/logger.service';
import { ClarificationStateMachine } from '../services/clarification-state-machine.service';
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
      providers: [
        ClarificationStateMachine,
        SyncClarificationState,
        { provide: Logger, useValue: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
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

    const retryButton = fixture.nativeElement.querySelector('[data-testid="retry-button"]') as HTMLButtonElement;
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
