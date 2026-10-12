import { signal } from '@angular/core';

import { ANNOUNCE_GAP_MS, announceAgain } from './announce';

describe('announceAgain', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('empties the region first and writes the text a moment later', () => {
    const region = signal('same');
    announceAgain(region, 'same');
    expect(region()).toBe('');
    jest.advanceTimersByTime(ANNOUNCE_GAP_MS);
    expect(region()).toBe('same');
  });

  it('two calls in a row leave one write (the last text)', () => {
    const region = signal('');
    announceAgain(region, 'one');
    announceAgain(region, 'two');
    jest.advanceTimersByTime(ANNOUNCE_GAP_MS * 3);
    expect(region()).toBe('two');
  });
});
