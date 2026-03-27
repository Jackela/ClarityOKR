/* eslint-disable prefer-const */
// Mock for rxjs
// Provides minimal implementations for Jest testing

export class Observable {
  constructor(private producer) {}

  subscribe(observer) {
    this.producer({
      next: (value) => observer.next?.(value),
      error: (err) => observer.error?.(err),
      complete: () => observer.complete?.(),
    });
  }
}

export function firstValueFrom(observable) {
  return new Promise((resolve, reject) => {
    observable.subscribe({
      next: (value) => resolve(value),
      error: (err) => reject(err),
      complete: () => {
        if (!resolved) {
          reject(new Error('Observable completed without emitting'));
        }
      },
    });
  });
}

let resolved = false;
