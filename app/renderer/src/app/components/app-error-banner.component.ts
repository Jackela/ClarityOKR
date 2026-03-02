import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output } from '@angular/core';
import { map } from 'rxjs';

import { ErrorService } from '../services/error.service';

@Component({
  selector: 'app-error-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="errorMessage$ | async as errorMessage" class="error-banner">
      <span data-testid="error-message">{{ errorMessage }}</span>
      <button data-testid="retry-button" (click)="onRetry()">Retry</button>
    </div>
  `,
  styles: [
    `
      .error-banner {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background-color: #fee2e2;
        border: 1px solid #ef4444;
        border-radius: 4px;
      }
      button {
        padding: 0.25rem 0.75rem;
        background-color: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover {
        background-color: #dc2626;
      }
    `,
  ],
})
export class AppErrorBannerComponent {
  private readonly errorService = inject(ErrorService);

  @Output() readonly retry = new EventEmitter<void>();

  readonly errorMessage$ = this.errorService.error$.pipe(map((state) => state?.message ?? null));

  onRetry(): void {
    this.retry.emit();
    this.errorService.clear();
  }
}
