/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { ClarificationPrompt } from '@clarityokr/contracts';

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClarificationWizardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ClarificationWizardComponent);
    component = fixture.componentInstance;
  });

  it('renders prompt and emits selected option id on click', () => {
    component.prompt = buildPrompt();
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

  it('disables generate button until ready flag is true', async () => {
    component.prompt = buildPrompt();
    component.isReadyToGenerate = false;
    fixture.detectChanges();

    const generateButton = fixture.nativeElement.querySelector(
      'button.generate',
    ) as HTMLButtonElement | null;
    expect(generateButton?.disabled).toBeTrue();

    await fixture.whenStable();

    fixture.componentRef.setInput('isReadyToGenerate', true);
    fixture.detectChanges();

    expect(generateButton?.disabled).toBeFalse();
  });
});
