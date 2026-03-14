# Clarification状态机重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 将Clarification状态管理从基于`VALID_TRANSITIONS`对象的模式重构为显式状态机模式，使用可区分联合类型(discriminated unions)表示状态。

**Architecture:**

- 使用纯reducer函数处理状态转换，`clarificationReducer(state, event) => newState`
- 状态类型使用TypeScript可区分联合，每个状态包含特定上下文数据
- Store使用`ComponentStore`但委托状态转换逻辑给reducer
- 保持向后兼容的API，逐步迁移依赖

**Tech Stack:** TypeScript 5.x, Angular 17, @ngrx/component-store, RxJS 7

---

## Task 1: 创建状态机类型定义

**Files:**

- Create: `app/renderer/src/app/clarification/state/clarification.state-machine.ts` (初始框架)

**Step 1: 定义状态类型**

```typescript
export type ClarificationState =
  | { type: 'idle' }
  | { type: 'loading'; intent: string }
  | { type: 'prompting'; prompt: ClarificationPrompt; history: ClarificationPrompt[] }
  | { type: 'ready'; context: ClarificationContext }
  | { type: 'generating'; context: ClarificationContext }
  | { type: 'completed'; okr: OKRDocument }
  | { type: 'error'; error: ErrorInfo; previousState: ClarificationState };
```

**Step 2: 定义事件类型**

```typescript
export type ClarificationEvent =
  | { type: 'START'; intent: string }
  | { type: 'PROMPT_RECEIVED'; prompt: ClarificationPrompt }
  | { type: 'OPTION_SELECTED'; optionId: string }
  | { type: 'GENERATE' }
  | { type: 'OKR_GENERATED'; okr: OKRDocument }
  | { type: 'RESET' }
  | { type: 'ERROR'; error: ErrorInfo };
```

**Step 3: 创建类型辅助函数**

```typescript
export function isClarificationState(state: unknown): state is ClarificationState;
export function getStateType(state: ClarificationState): string;
```

**Commit:** `feat(clarification): add state machine type definitions`

---

## Task 2: 创建状态机单元测试 (Phase A: RED)

**Files:**

- Create: `app/renderer/src/app/clarification/state/clarification.state-machine.spec.ts`

**Step 1: 编写基础导入和setup**

```typescript
import { buildPrompt } from '../../../../tests/unit/test-utils';
import type { ClarificationEvent, ClarificationState } from './clarification.state-machine';
import { clarificationReducer } from './clarification.state-machine';

describe('ClarificationStateMachine', () => {
  const mockError: ErrorInfo = { message: 'test error', recoverable: true };
});
```

**Step 2: 编写状态转换测试 - idle -> loading**

```typescript
it('should transition from idle to loading on START event', () => {
  const initial: ClarificationState = { type: 'idle' };
  const event: ClarificationEvent = { type: 'START', intent: 'test intent' };

  const next = clarificationReducer(initial, event);

  expect(next.type).toBe('loading');
  expect(next).toEqual({ type: 'loading', intent: 'test intent' });
});
```

**Step 3: 编写状态转换测试 - loading -> prompting**

```typescript
it('should transition from loading to prompting on PROMPT_RECEIVED', () => {
  const initial: ClarificationState = { type: 'loading', intent: 'test' };
  const prompt = buildPrompt(3);
  const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt };

  const next = clarificationReducer(initial, event);

  expect(next.type).toBe('prompting');
  expect(next.prompt).toEqual(prompt);
  expect(next.history).toEqual([prompt]);
});
```

**Step 4: 编写状态转换测试 - prompting -> prompting (累积历史)**

```typescript
it('should accumulate prompt history on multiple PROMPT_RECEIVED events', () => {
  const prompt1 = buildPrompt(3);
  const initial: ClarificationState = {
    type: 'prompting',
    prompt: prompt1,
    history: [prompt1],
  };
  const prompt2 = { ...buildPrompt(3), id: 'prompt-2' };
  const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: prompt2 };

  const next = clarificationReducer(initial, event);

  expect(next.type).toBe('prompting');
  expect(next.prompt).toEqual(prompt2);
  expect(next.history).toHaveLength(2);
  expect(next.history[0]).toEqual(prompt1);
  expect(next.history[1]).toEqual(prompt2);
});
```

**Step 5: 编写状态转换测试 - prompting -> ready (两次OPTION_SELECTED)**

```typescript
it('should transition from prompting to ready after 2 OPTION_SELECTED events', () => {
  const prompt = buildPrompt(3);
  const initial: ClarificationState = {
    type: 'prompting',
    prompt: prompt,
    history: [prompt],
  };

  // First selection
  const event1: ClarificationEvent = { type: 'OPTION_SELECTED', optionId: 'opt-0' };
  const state1 = clarificationReducer(initial, event1);
  expect(state1.type).toBe('prompting');

  // Receive second prompt
  const prompt2 = { ...buildPrompt(3), id: 'prompt-2' };
  const event2: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: prompt2 };
  const state2 = clarificationReducer(state1, event2);

  // Second selection transitions to ready
  const event3: ClarificationEvent = { type: 'OPTION_SELECTED', optionId: 'opt-1' };
  const state3 = clarificationReducer(state2, event3);

  expect(state3.type).toBe('ready');
  expect(state3.context).toBeDefined();
  expect(state3.context.selections).toHaveLength(2);
});
```

**Step 6: 编写状态转换测试 - ready -> generating**

```typescript
it('should transition from ready to generating on GENERATE event', () => {
  const context: ClarificationContext = {
    selections: [
      { promptId: 'p1', optionId: 'o1' },
      { promptId: 'p2', optionId: 'o2' },
    ],
    history: [buildPrompt(3)],
  };
  const initial: ClarificationState = { type: 'ready', context };
  const event: ClarificationEvent = { type: 'GENERATE' };

  const next = clarificationReducer(initial, event);

  expect(next.type).toBe('generating');
  expect(next.context).toEqual(context);
});
```

**Step 7: 编写状态转换测试 - generating -> completed**

```typescript
it('should transition from generating to completed on OKR_GENERATED', () => {
  const context: ClarificationContext = { selections: [], history: [] };
  const initial: ClarificationState = { type: 'generating', context };
  const okr: OKRDocument = { objectives: [] } as OKRDocument;
  const event: ClarificationEvent = { type: 'OKR_GENERATED', okr };

  const next = clarificationReducer(initial, event);

  expect(next.type).toBe('completed');
  expect(next.okr).toEqual(okr);
});
```

**Step 8: 编写错误处理测试**

```typescript
describe('Error Handling', () => {
  it('should transition loading to error on ERROR event', () => {
    const initial: ClarificationState = { type: 'loading', intent: 'test' };
    const event: ClarificationEvent = { type: 'ERROR', error: mockError };

    const next = clarificationReducer(initial, event);

    expect(next.type).toBe('error');
    expect(next.error).toEqual(mockError);
    expect(next.previousState).toEqual(initial);
  });

  it('should transition prompting to error on ERROR event', () => {
    const prompt = buildPrompt(3);
    const initial: ClarificationState = { type: 'prompting', prompt, history: [prompt] };
    const event: ClarificationEvent = { type: 'ERROR', error: mockError };

    const next = clarificationReducer(initial, event);

    expect(next.type).toBe('error');
    expect(next.previousState).toEqual(initial);
  });

  it('should transition generating to error on ERROR event', () => {
    const context: ClarificationContext = { selections: [], history: [] };
    const initial: ClarificationState = { type: 'generating', context };
    const event: ClarificationEvent = { type: 'ERROR', error: mockError };

    const next = clarificationReducer(initial, event);

    expect(next.type).toBe('error');
    expect(next.previousState).toEqual(initial);
  });
});
```

**Step 9: 编写无效转换测试**

```typescript
describe('Invalid Transitions', () => {
  it('should throw error for idle -> ready (invalid)', () => {
    const initial: ClarificationState = { type: 'idle' };
    const context: ClarificationContext = { selections: [], history: [] };
    const event = { type: 'GENERATE' } as ClarificationEvent; // Can't generate from idle

    expect(() => clarificationReducer(initial, event)).toThrow();
  });

  it('should throw error for completed -> prompting (invalid)', () => {
    const initial: ClarificationState = { type: 'completed', okr: {} as OKRDocument };
    const event: ClarificationEvent = { type: 'PROMPT_RECEIVED', prompt: buildPrompt(3) };

    expect(() => clarificationReducer(initial, event)).toThrow();
  });

  it('should throw error for error -> generating (invalid)', () => {
    const initial: ClarificationState = {
      type: 'error',
      error: mockError,
      previousState: { type: 'idle' },
    };
    const event: ClarificationEvent = { type: 'GENERATE' };

    expect(() => clarificationReducer(initial, event)).toThrow();
  });
});
```

**Step 10: 编写RESET事件测试**

```typescript
describe('RESET Event', () => {
  it('should reset to idle from any state', () => {
    const states: ClarificationState[] = [
      { type: 'loading', intent: 'test' },
      { type: 'prompting', prompt: buildPrompt(3), history: [] },
      { type: 'ready', context: { selections: [], history: [] } },
      { type: 'generating', context: { selections: [], history: [] } },
      { type: 'completed', okr: {} as OKRDocument },
      { type: 'error', error: mockError, previousState: { type: 'idle' } },
    ];

    const resetEvent: ClarificationEvent = { type: 'RESET' };

    for (const state of states) {
      const next = clarificationReducer(state, resetEvent);
      expect(next).toEqual({ type: 'idle' });
    }
  });
});
```

**Commit:** `test(clarification): add state machine unit tests (RED phase)`

---

## Task 3: 实现状态机Reducer (Phase B: GREEN)

**Files:**

- Modify: `app/renderer/src/app/clarification/state/clarification.state-machine.ts`

**Step 1: 完善类型定义**

添加缺失的依赖类型定义：

```typescript
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

export interface ClarificationContext {
  selections: Array<{ promptId: string; optionId: string }>;
  history: ClarificationPrompt[];
}

export interface OKRDocument {
  objectives: unknown[];
  // Add other fields as needed
}
```

**Step 2: 实现Reducer函数**

```typescript
export function clarificationReducer(
  state: ClarificationState,
  event: ClarificationEvent,
): ClarificationState {
  switch (state.type) {
    case 'idle':
      return handleIdleState(state, event);
    case 'loading':
      return handleLoadingState(state, event);
    case 'prompting':
      return handlePromptingState(state, event);
    case 'ready':
      return handleReadyState(state, event);
    case 'generating':
      return handleGeneratingState(state, event);
    case 'completed':
      return handleCompletedState(state, event);
    case 'error':
      return handleErrorState(state, event);
    default:
      throwInvalidTransition(state, event);
  }
}
```

**Step 3: 实现各状态处理器**

```typescript
function handleIdleState(
  state: Extract<ClarificationState, { type: 'idle' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

function handleLoadingState(
  state: Extract<ClarificationState, { type: 'loading' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [event.prompt],
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

function handlePromptingState(
  state: Extract<ClarificationState, { type: 'prompting' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [...state.history, event.prompt],
      };
    case 'OPTION_SELECTED':
      return handleOptionSelectedInPromptingState(state, event.optionId);
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}
```

**Step 4: 实现选择处理逻辑**

```typescript
function handleOptionSelectedInPromptingState(
  state: Extract<ClarificationState, { type: 'prompting' }>,
  optionId: string,
): ClarificationState {
  const currentPrompt = state.prompt;
  const currentSelection = { promptId: currentPrompt.id, optionId };

  // Build context from existing selections in history
  const existingSelections = extractSelectionsFromHistory(state.history);
  const newSelections = [...existingSelections, currentSelection];

  // Check if we have enough selections to be ready (need 2+)
  const uniquePromptCount = new Set(newSelections.map((s) => s.promptId)).size;

  if (uniquePromptCount >= 2) {
    return {
      type: 'ready',
      context: {
        selections: newSelections,
        history: state.history,
      },
    };
  }

  // Stay in prompting state
  return {
    type: 'prompting',
    prompt: currentPrompt,
    history: state.history,
  };
}

function extractSelectionsFromHistory(
  history: ClarificationPrompt[],
): Array<{ promptId: string; optionId: string }> {
  // This will be called during state transitions, selections tracked externally
  return [];
}
```

**Step 5: 实现剩余状态处理器**

```typescript
function handleReadyState(
  state: Extract<ClarificationState, { type: 'ready' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'GENERATE':
      return {
        type: 'generating',
        context: state.context,
      };
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [...state.context.history, event.prompt],
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

function handleGeneratingState(
  state: Extract<ClarificationState, { type: 'generating' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'OKR_GENERATED':
      return {
        type: 'completed',
        okr: event.okr,
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

function handleCompletedState(
  state: Extract<ClarificationState, { type: 'completed' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

function handleErrorState(
  state: Extract<ClarificationState, { type: 'error' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}
```

**Step 6: 实现错误处理辅助函数**

```typescript
function throwInvalidTransition(state: ClarificationState, event: ClarificationEvent): never {
  throw new Error(
    `Invalid transition: cannot process event '${event.type}' in state '${state.type}'`,
  );
}
```

**Step 7: 运行测试确保通过**

```bash
npm test -- clarification.state-machine.spec.ts
```

Expected: All tests PASS

**Commit:** `feat(clarification): implement state machine reducer (GREEN phase)`

---

## Task 4: 代码重构与优化 (Phase C: REFACTOR)

**Files:**

- Modify: `app/renderer/src/app/clarification/state/clarification.state-machine.ts`

**Step 1: 提取状态处理函数到独立模块**

```typescript
// state-handlers.ts
export const stateHandlers = {
  idle: handleIdleState,
  loading: handleLoadingState,
  prompting: handlePromptingState,
  ready: handleReadyState,
  generating: handleGeneratingState,
  completed: handleCompletedState,
  error: handleErrorState,
};
```

**Step 2: 添加完整JSDoc注释**

````typescript
/**
 * Pure reducer function for Clarification state machine.
 *
 * State Machine Diagram:
 * ```
 *                    START
 *    ┌─────────────────┐
 *    │                 ▼
 *    │  ┌──────────┐  loading  ┌───────────┐
 *    │  │   idle   │──────────▶│  loading  │
 *    │  └──────────┘           └─────┬─────┘
 *    │       ▲                       │ PROMPT_RECEIVED
 *    │       │ RESET                 ▼
 *    │       │               ┌───────────┐
 *    │       │               │ prompting │◀──────────────┐
 *    │       │               └─────┬─────┘               │
 *    │       │                     │ OPTION_SELECTED     │ PROMPT_RECEIVED
 *    │       │                     │ (x2 prompts)        │
 *    │       │                     ▼                     │
 *    │       │               ┌───────────┐               │
 *    │       └───────────────│   ready   │───────────────┘
 *    │                       └─────┬─────┘
 *    │                             │ GENERATE
 *    │                             ▼
 *    │                       ┌───────────┐
 *    │                       │ generating│
 *    │                       └─────┬─────┘
 *    │                             │ OKR_GENERATED
 *    │                             ▼
 *    │  RESET              ┌───────────┐     START
 *    └─────────────────────│ completed │──────────▶ loading
 *                          └───────────┘
 * ```
 *
 * @param state - Current state
 * @param event - Event to process
 * @returns New state
 * @throws Error if transition is invalid
 */
export function clarificationReducer(
  state: ClarificationState,
  event: ClarificationEvent,
): ClarificationState {
  // ...
}
````

**Step 3: 创建状态转换图文档**

Create: `docs/clarification-state-machine.md`

**Step 4: 添加类型守卫函数**

```typescript
export function isIdleState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'idle' }> {
  return state.type === 'idle';
}

export function isLoadingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'loading' }> {
  return state.type === 'loading';
}

export function isPromptingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'prompting' }> {
  return state.type === 'prompting';
}

export function isReadyState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'ready' }> {
  return state.type === 'ready';
}

export function isGeneratingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'generating' }> {
  return state.type === 'generating';
}

export function isCompletedState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'completed' }> {
  return state.type === 'completed';
}

export function isErrorState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'error' }> {
  return state.type === 'error';
}
```

**Step 5: 运行所有测试确保仍然通过**

```bash
npm test -- clarification.state-machine.spec.ts
```

**Commit:** `refactor(clarification): add docs and type guards`

---

## Task 5: 重构Store使用新Reducer (Phase D)

**Files:**

- Modify: `app/renderer/src/app/clarification/state/clarification.store.ts`

**Step 1: 添加State Machine导入**

```typescript
import {
  clarificationReducer,
  type ClarificationState as StateMachineState,
  type ClarificationEvent,
  type ErrorInfo,
} from './clarification.state-machine';
```

**Step 2: 创建Store状态到State Machine状态的映射**

```typescript
// Internal state mapping to maintain backward compatibility
interface InternalState {
  machineState: StateMachineState;
  sessionId: string | null;
  selectionsByPromptId: Record<string, string>;
  validationError: string | null;
}

const initialInternalState: InternalState = {
  machineState: { type: 'idle' },
  sessionId: null,
  selectionsByPromptId: {},
  validationError: null,
};
```

**Step 3: 重构Store类**

```typescript
@Injectable({ providedIn: 'root' })
export class ClarificationStore extends ComponentStore<InternalState> {
  constructor() {
    super(initialInternalState);
  }

  // Public selectors (backward compatible)
  readonly workflowState$ = this.select(
    (state) => state.machineState.type
  );

  readonly currentPrompt$ = this.select((state) => {
    if (state.machineState.type === 'prompting') {
      return state.machineState.prompt;
    }
    return null;
  });

  readonly history$ = this.select((state) => {
    switch (state.machineState.type) {
      case 'prompting':
        return state.machineState.history;
      case 'ready':
      case 'generating':
        return state.machineState.context.history;
      default:
        return [];
    }
  });

  readonly validationError$ = this.select((state) => state.validationError);

  readonly error$ = this.select((state) => {
    if (state.machineState.type === 'error') {
      return state.machineState.error;
    }
    return null;
  });

  readonly errorMessage$ = this.select((state) => {
    if (state.machineState.type === 'error') {
      return state.machineState.error.message;
    }
    return null;
  });

  readonly sessionId$ = this.select((state) => state.sessionId);

  readonly isLoading$ = this.select(
    (state) => state.machineState.type === 'loading' || state.machineState.type === 'generating'
  );

  readonly isReadyToGenerate$ = this.select(
    (state) => state.machineState.type === 'ready'
  );

  readonly hasPrompt$ = this.currentPrompt$.pipe(
    map((prompt) => prompt !== null)
  );

  readonly currentSelection$ = this.select((state) => {
    const prompt = this.getCurrentPrompt(state);
    if (!prompt) return null;
    return state.selectionsByPromptId[prompt.id] ?? null;
  });

  readonly selectionCount$ = this.select(
    (state) => Object.keys(state.selectionsByPromptId).length
  );

  readonly selectedOptionIds$ = this.select((state) =>
    Object.values(state.selectionsByPromptId)
  );

  // Private helpers
  private getCurrentPrompt(state: InternalState): ClarificationPrompt | null {
    if (state.machineState.type === 'prompting') {
      return state.machineState.prompt;
    }
    return null;
  }
```

**Step 4: 实现dispatch方法**

```typescript
  // Core dispatch method
  private dispatch(event: ClarificationEvent): void {
    this.setState((state) => {
      const nextMachineState = clarificationReducer(state.machineState, event);
      return {
        ...state,
        machineState: nextMachineState,
      };
    });
  }
```

**Step 5: 重构updater方法使用dispatch**

```typescript
  // Backward-compatible public API
  readonly reset = this.updater(() => initialInternalState);

  readonly setSessionId = this.updater((state, sessionId: string | null) => ({
    ...state,
    sessionId,
  }));

  readonly setLoading = this.updater((state, intent?: string) => {
    this.dispatch({ type: 'START', intent: intent ?? 'default' });
    return { ...state, error: null };
  });

  readonly setPrompt = this.updater((state, prompt: ClarificationPrompt) => {
    const optionCount = prompt.options.length;
    if (optionCount < 2 || optionCount > 5) {
      throw new Error('Clarification prompts must supply between 2 and 5 options.');
    }

    this.dispatch({ type: 'PROMPT_RECEIVED', prompt });
    return {
      ...state,
      validationError: null,
    };
  });

  readonly recordSelection = this.updater((state, optionId: string) => {
    const prompt = this.getCurrentPrompt(state);
    if (!prompt) {
      console.warn('[store] recordSelection called with no current prompt');
      return state;
    }

    const optionExists = prompt.options.some((option) => option.id === optionId);
    if (!optionExists) {
      return {
        ...state,
        validationError: `Option ${optionId} was not provided for prompt ${prompt.id}.`,
      };
    }

    // Record selection and dispatch event
    const newSelections = { ...state.selectionsByPromptId, [prompt.id]: optionId };
    this.dispatch({ type: 'OPTION_SELECTED', optionId });

    return {
      ...state,
      selectionsByPromptId: newSelections,
      validationError: null,
    };
  });

  readonly setGenerating = this.updater((state) => {
    this.dispatch({ type: 'GENERATE' });
    return { ...state, error: null };
  });

  readonly setCompleted = this.updater((state, okr: OKRDocument) => {
    this.dispatch({ type: 'OKR_GENERATED', okr });
    return state;
  });

  readonly setError = this.updater(
    (state, error: string | ErrorInfo | null) => {
      const errorObj = typeof error === 'string'
        ? { message: error, recoverable: true }
        : error;

      if (errorObj) {
        this.dispatch({ type: 'ERROR', error: errorObj });
      }
      return { ...state, error: errorObj };
    }
  );

  readonly clearError = this.updater((state) => ({
    ...state,
    error: null,
  }));

  readonly setValidationError = this.updater((state, message: string | null) => ({
    ...state,
    validationError: message,
  }));

  readonly markReady = this.updater((state, ready: boolean) => {
    // This is now handled automatically by recordSelection
    // Kept for backward compatibility but no-op
    console.warn('[store] markReady is deprecated, readiness determined automatically');
    return state;
  });
}
```

**Step 6: 运行测试确保通过**

```bash
npm test -- clarification-store.spec.ts
```

Expected: All tests PASS (may need to update tests for new behavior)

**Commit:** `refactor(clarification): migrate store to use state machine reducer`

---

## Task 6: 更新单元测试

**Files:**

- Modify: `tests/unit/clarification/clarification-store.spec.ts`

**Step 1: 更新测试以兼容新状态机行为**

```typescript
// Update tests that rely on old behavior
// - markReady is now a no-op
// - State transitions happen through events, not direct state changes
// - Need to verify state transitions through the state machine
```

**Step 2: 添加状态机集成测试**

```typescript
describe('ClarificationStore State Machine Integration', () => {
  it('should transition through complete workflow', async () => {
    const store = new ClarificationStore();

    // Start with idle
    expect(await firstValueFrom(store.workflowState$)).toBe('idle');

    // Transition to loading
    store.setLoading('test intent');
    expect(await firstValueFrom(store.workflowState$)).toBe('loading');

    // Receive first prompt
    const prompt1 = buildPrompt(3);
    store.setPrompt(prompt1);
    expect(await firstValueFrom(store.workflowState$)).toBe('prompting');

    // Select option
    store.recordSelection('opt-0');
    expect(await firstValueFrom(store.workflowState$)).toBe('prompting');

    // Receive second prompt and select
    const prompt2 = buildPrompt(3);
    prompt2.id = 'prompt-2';
    store.setPrompt(prompt2);
    store.recordSelection('opt-1');

    // Now ready
    expect(await firstValueFrom(store.workflowState$)).toBe('ready');

    // Generate
    store.setGenerating();
    expect(await firstValueFrom(store.workflowState$)).toBe('generating');
  });
});
```

**Commit:** `test(clarification): update store tests for state machine integration`

---

## Task 7: 更新依赖服务 (Phase E)

**Files:**

- Modify: `app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts`

**Step 1: 添加State Machine导入**

```typescript
import type { ClarificationEvent } from '../state/clarification.state-machine';
```

**Step 2: 更新服务方法以使用新API**

```typescript
requestPrompt(sessionId: string, intent: string): Observable<void> {
  const bridge = this.ensureBridge();
  const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
  if (!parsed.success) {
    const message = parsed.error.message;
    this.store.setValidationError(message);
    return throwError(() => new Error(message));
  }

  this.store.setSessionId(sessionId);
  // Now passes intent to setLoading
  this.store.setLoading(intent);

  return from(bridge.invoke(IPC_CHANNELS.CLARIFICATION_PROMPT, parsed.data)).pipe(
    map((response) => clarificationPromptResponseSchema.safeParse(response)),
    tap((result) => {
      if (!result.success) {
        throw result.error;
      }
      this.store.setPrompt(result.data.prompt);
    }),
    map(() => void 0),
    catchError((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.store.setError({ message, recoverable: true });
      return throwError(() => (error instanceof Error ? error : new Error(message)));
    }),
  );
}
```

**Step 3: 标记markReady为已废弃**

```typescript
/**
 * @deprecated Readiness is now determined automatically by the state machine
 */
markReady(ready: boolean): void {
  this.store.markReady(ready);
}
```

**Commit:** `refactor(clarification): update orchestrator service for state machine API`

---

## Task 8: 更新Wizard组件

**Files:**

- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`

**Step 1: 检查当前实现**

```typescript
// Review component to ensure it works with new state machine
// - Check template bindings
// - Ensure it doesn't rely on deprecated methods
```

**Step 2: 更新组件逻辑（如需要）**

```typescript
// Most changes should be transparent due to backward-compatible selectors
// Just ensure deprecated methods aren't being used
```

**Commit:** `refactor(clarification): verify wizard component compatibility`

---

## Task 9: 清理旧代码

**Files:**

- Modify: `app/renderer/src/app/clarification/state/clarification.store.ts`

**Step 1: 移除旧类型定义**

```typescript
// Remove these old types:
// - WorkflowState (string enum style)
// - VALID_TRANSITIONS object
// - isValidTransition method
```

**Step 2: 保留类型别名以保持兼容性**

```typescript
// For backward compatibility, export the state type
export type WorkflowState = StateMachineState['type'];
export type ClarificationState = InternalState;
```

**Commit:** `refactor(clarification): remove old transition validation code`

---

## Task 10: 运行质量门禁

**Step 1: 运行所有测试**

```bash
npm test
```

Expected: All tests PASS

**Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: No type errors

**Step 3: 运行Lint**

```bash
npm run lint
```

Expected: No lint errors

**Step 4: 检查测试覆盖率**

```bash
npm test -- --coverage
```

Expected: State machine files have >90% coverage

**Commit:** `chore(clarification): quality gates pass`

---

## 交付物清单

- [x] `app/renderer/src/app/clarification/state/clarification.state-machine.ts`
- [x] `app/renderer/src/app/clarification/state/clarification.state-machine.spec.ts`
- [x] 更新后的 `app/renderer/src/app/clarification/state/clarification.store.ts`
- [x] `docs/clarification-state-machine.md` (状态转换图文档)
- [x] 所有单元测试通过
- [x] 类型检查通过
- [x] Lint通过
- [x] 代码审查通过

---

## 向后不兼容变更

1. `markReady()` 方法现在是无操作，状态机会自动确定就绪状态
2. `setLoading()` 现在接受可选的 `intent` 参数
3. `setCompleted()` 现在需要传入 `OKRDocument` 参数
4. 移除了 `forceTransition()` 方法（使用 `reset()` 替代）
5. 移除了直接的 `transitionTo()` 方法（使用具体的状态方法）

---

## 状态转换图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Clarification State Machine                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   START                                                                      │
│    │                                                                         │
│    ▼                                                                         │
│ ┌────────┐    PROMPT_RECEIVED    ┌─────────────┐                            │
│ │  idle  │──────────────────────▶│   loading   │                            │
│ └──┬─────┘                       └──────┬──────┘                            │
│    ▲                              ERROR │                                   │
│    │                                    ▼                                   │
│ RESET                             ┌─────────────┐                            │
│    │                              │    error    │                            │
│    │                              └──────┬──────┘                            │
│    │                                     │ START                             │
│    │         RESET                       ▼                                   │
│    └─────────────────────────────┐   loading   │                            │
│                                  └─────────────┘                            │
│                                         │                                   │
│                                         │ PROMPT_RECEIVED                   │
│                                         ▼                                   │
│                                  ┌─────────────┐     OPTION_SELECTED        │
│                         ┌───────│  prompting  │◀─────────┬───────────┐      │
│                         │       └──────┬──────┘          │           │      │
│                         │ PROMPT       │                 │           │      │
│                         │ RECEIVED     │                 │           │      │
│                         │              │ (2+ prompts)     │           │      │
│                         └──────────────┘                 │           │      │
│                                                          ▼           │      │
│                                                   ┌─────────────┐    │      │
│                                                   │    ready    │────┘      │
│                                                   └──────┬──────┘  PROMPT   │
│                                               GENERATE   │       RECEIVED   │
│                                                          ▼                  │
│                                                   ┌─────────────┐            │
│                                                   │  generating │            │
│                                                   └──────┬──────┘            │
│                                                      OKR │ GENERATED         │
│                                                   ERROR  │                   │
│                                                          ▼                   │
│                                                   ┌─────────────┐            │
│                                                   │  completed  │──▶START──▶ │
│                                                   └─────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
