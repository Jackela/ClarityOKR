import '@angular/compiler';
import { ClarificationStore } from '../../../app/renderer/src/app/clarification/state/clarification.store';

describe('ClarificationStore loading flag', () => {
  it('toggles loading state on setLoading', (done) => {
    const store = new ClarificationStore();
    const states: boolean[] = [];
    const sub = store.isLoading$.subscribe((v) => {
      states.push(v);
      if (states.length === 3) {
        expect(states[0]).toBe(false);
        expect(states[1]).toBe(true);
        expect(states[2]).toBe(false);
        sub.unsubscribe();
        done();
      }
    });
    store.setLoading(true);
    store.setLoading(false);
  });
});
