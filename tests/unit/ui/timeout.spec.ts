import { of, throwError } from 'rxjs';
import type { ClarificationPrompt } from '@clarityokr/contracts';
// Import the class under test
import { AppComponent } from '../../../app/renderer/src/app/app.component';
import { Logger } from '../../../app/renderer/src/app/core/services/logger.service';
import { SyncClarificationState } from '../../../app/renderer/src/app/clarification/services/sync-clarification-state.service';

class OrchestratorStub {
  recordSelection() {
    return of(void 0);
  }
  markReady(_ready: boolean) {}
  requestPrompt() {
    return of(void 0);
  }
}

class StickyGatewayStub {
  viewModel$ = of(null);
  hasStickyNote$ = of(false);
  async generate() {
    return {
      objective: 'obj',
      keyResults: [],
      generatedAt: new Date().toISOString(),
      hasManualEdits: false,
    } as any;
  }
}

class LlmGatewayStub {
  getNextQuestion() {
    return throwError(() => new Error('timeout'));
  }
  generateDraft() {
    return throwError(() => new Error('timeout'));
  }
}

class NgZoneStub {
  run(fn: Function) {
    return fn();
  }
}

describe('AppComponent timeout UX', () => {
  it('sets statusMessage when next-question call errors', () => {
    const logger = new Logger();
    const state = new SyncClarificationState(logger);
    const comp = new AppComponent(
      new OrchestratorStub() as any,
      state,
      new StickyGatewayStub() as any,
      new LlmGatewayStub() as any,
      new NgZoneStub() as any,
      logger,
    );

    // Seed a prompt and session to enable selection
    const prompt: ClarificationPrompt = {
      id: 'q1',
      question: 'Q',
      sequence: 0,
      context: 'ctx',
      options: [
        { id: 'a', label: 'A', description: undefined, scopeTag: 'x' },
        { id: 'b', label: 'B', description: undefined, scopeTag: 'x' },
      ],
    };
    state.setPrompt(prompt);
    (comp as any).sessionId = 's1';
    (comp as any).latestPrompt = prompt;

    comp.onOptionSelected('a');
    expect(comp.statusMessage).toMatch(/重试/);
  });
});
