/* eslint-disable prefer-const */
// Mock for @angular/core
// Provides minimal implementations for Jest testing

// Simple signal implementation
export function signal(initialValue: unknown) {
  let value = initialValue;
  const sig = () => value;
  sig.set = (newValue: unknown) => {
    value = newValue;
  };
  sig.update = (updater: (v: unknown) => unknown) => {
    value = updater(value);
  };
  return sig;
}

// Simple computed implementation
export function computed(fn: () => unknown) {
  let cachedValue = fn();
  return () => cachedValue;
}

// Injectable decorator - just returns the target
export function Injectable(config?: unknown) {
  return (target: unknown) => target;
}

// Effect - just executes once
export function effect(fn: () => void) {
  fn();
  return { destroy: () => {} };
}
