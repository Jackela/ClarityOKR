// Jest setup file with Angular mocks
// This file runs before each test file

// Mock Angular core for renderer imports
const mockSignals = new Map();
let signalIdCounter = 0;

function createSignal(initialValue) {
  const id = ++signalIdCounter;
  const state = { value: initialValue };

  const signal = () => state.value;
  signal.set = (newValue) => {
    state.value = newValue;
  };
  signal.update = (updater) => {
    state.value = updater(state.value);
  };

  mockSignals.set(id, signal);
  return signal;
}

function createComputed(fn) {
  let value = fn();
  return () => value;
}

// Global Angular mock
global.ng = {
  signal: createSignal,
  computed: createComputed,
};

// Set test environment
process.env.NODE_ENV = 'test';

// Provide require() for ESM context (needed for T035 edit-mode store tests)
const { createRequire } = require('module');
global.require = createRequire(__filename);
