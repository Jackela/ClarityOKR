import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ErrorState {
  message: string;
  recoverable: boolean;
}

@Injectable({ providedIn: 'root' })
export class ErrorService {
  private errorSubject = new BehaviorSubject<ErrorState | null>(null);

  error$: Observable<ErrorState | null> = this.errorSubject.asObservable();

  showError(message: string, recoverable: boolean = true): void {
    this.errorSubject.next({ message, recoverable });
  }

  clear(): void {
    this.errorSubject.next(null);
  }
}
