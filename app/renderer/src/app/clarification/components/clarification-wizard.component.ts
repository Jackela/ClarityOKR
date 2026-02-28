import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './clarification-wizard.component.html',
  styleUrls: ['./clarification-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClarificationWizardComponent {
  @Input() prompt: ClarificationPrompt | null = null;
  @Input() isReadyToGenerate = false;
  @Input() validationError: string | null = null;
  @Input() loading = false;
  @Input() currentStep = 0;
  @Input() totalSteps = 5;

  @Output() readonly optionSelected = new EventEmitter<string>();
  @Output() readonly generate = new EventEmitter<void>();
}
