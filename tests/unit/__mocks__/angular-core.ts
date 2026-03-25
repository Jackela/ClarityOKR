// Mock for @angular/core
// Provides minimal implementations for Jest testing

// Simple signal implementation
function signal(initialValue) {
  let value = initialValue;
  const sig = () => value;
  sig.set = (newValue) => {
    value = newValue;
  };
  sig.update = (updater) => {
    value = updater(value);
  };
  return sig;
}

// Simple computed implementation
function computed(fn) {
  let cachedValue = fn();
  return () => cachedValue;
}

// Injectable decorator - just returns the target
function Injectable(config) {
  return (target) => target;
}

// Effect - just executes once
function effect(fn) {
  fn();
  return { destroy: () => {} };
}

module.exports = {
  Injectable,
  signal,
  computed,
  effect,
};
