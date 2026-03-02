import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import type { Observable, Subscription } from 'rxjs';

import { ErrorService } from '../services/error.service';

@Component({
  selector: 'app-error-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="errorMessage" class="error-banner">
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
export class AppErrorBannerComponent implements OnInit, OnDestroy {
  private readonly subscription: Subscription = new Subscription();
  errorMessage: string | null = null;

  constructor(private readonly errorService: ErrorService) {}

  ngOnInit(): void {
    this.subscription.add(
      this.errorService.error$.subscribe((state): void => {
        this.errorMessage = state?.message ?? null;
      }),
    );
  }

  @Output() readonly retry = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
    this.errorService.clear();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
