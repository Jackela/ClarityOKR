/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import { ClarificationWizardComponent } from './clarification-wizard.component';
import { SyncClarificationState } from '../services/sync-clarification-state.service';

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

  it('renders prompt and emits selected option id on click', () => {
    state.setPrompt(buildPrompt());
    fixture.detectChanges();

    const optionNodes = fixture.nativeElement.querySelectorAll(
      'button.option',
    ) as NodeListOf<HTMLButtonElement>;
    const buttons: HTMLButtonElement[] = Array.from(optionNodes);
    const optionSelectedSpy = jasmine.createSpy('optionSelected');
    component.optionSelected.subscribe(optionSelectedSpy);

    buttons[0].click();

    expect(optionSelectedSpy).toHaveBeenCalledWith('opt-1');
  });

  it('disables generate button until ready flag is true', () => {
    state.setPrompt(buildPrompt());
    state.setReady(false);
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement | null;
    expect(generateButton?.disabled).toBeTrue();

    state.setReady(true);
    fixture.detectChanges();

    const updatedButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement | null;
    expect(updatedButton?.disabled).toBeFalse();
  });

  it('emits generate event when generate button is clicked', () => {
    state.setPrompt(buildPrompt());
    state.setReady(true);
    fixture.detectChanges();

    const generateSpy = jasmine.createSpy('generate');
    component.generate.subscribe(generateSpy);

    const generateButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement;
    generateButton.click();

    expect(generateSpy).toHaveBeenCalled();
  });

  it('emits retry event when retry button is clicked in error state', () => {
    state.setError({ message: 'Test error', recoverable: true });
    fixture.detectChanges();

    const retrySpy = jasmine.createSpy('retry');
    component.retry.subscribe(retrySpy);

    const retryButton = fixture.nativeElement.querySelector('button.retry') as HTMLButtonElement;
    retryButton.click();

    expect(retrySpy).toHaveBeenCalled();
  });

  it('displays error message when in error state', () => {
    const errorMessage = 'Something went wrong';
    state.setError({ message: errorMessage, recoverable: true });
    fixture.detectChanges();

    const errorElement = fixture.nativeElement.querySelector('[data-testid="error-message"]');
    expect(errorElement).toBeTruthy();
    expect(errorElement.textContent).toContain(errorMessage);
  });

  it('displays loading indicator when loading', () => {
    state.setLoading(true);
    fixture.detectChanges();

    const loadingElement = fixture.nativeElement.querySelector(
      '[data-testid="clarification-loading"]',
    );
    expect(loadingElement).toBeTruthy();
  });
});
