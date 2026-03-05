# Clarification State Machine Documentation

## Overview

The Clarification State Machine manages the workflow of the OKR clarification process. It uses a finite state machine (FSM) pattern with explicit state transitions enforced by a pure reducer function.

## States

The state machine supports the following states:

### `idle`

- **Description**: Initial state, no clarification session active
- **Context**: None
- **Entry Points**: Initial state, RESET from any state

### `loading`

- **Description**: Loading the next prompt/question
- **Context**:
  - `intent: string` - The user's intent/focus for this clarification session
- **Entry Points**: START event from `idle`, `completed`, or `error`

### `prompting`

- **Description**: Showing a clarification prompt with options
- **Context**:
  - `prompt: ClarificationPrompt` - Current prompt being shown
  - `history: ClarificationPrompt[]` - All prompts shown in this session
- **Entry Points**: PROMPT_RECEIVED event from `loading`, `ready`

### `ready`

- **Description**: Sufficient information gathered, ready to generate OKR
- **Context**:
  - `context.selections: Array<{promptId, optionId}>` - All selections made
  - `context.history: ClarificationPrompt[]` - Prompt history
- **Entry Points**: OPTION_SELECTED event from `prompting` (after 2+ prompts have selections)

### `generating`

- **Description**: Generating the OKR document
- **Context**: Same as `ready` state
- **Entry Points**: GENERATE event from `ready`

### `completed`

- **Description**: OKR document generated successfully
- **Context**:
  - `okr: OKRDocument` - The generated OKR document
- **Entry Points**: OKR_GENERATED event from `generating`

### `error`

- **Description**: An error occurred during the process
- **Context**:
  - `error: ErrorInfo` - Error details
  - `previousState: ClarificationState` - State before the error
- **Entry Points**: ERROR event from `loading`, `prompting`, `ready`, or `generating`

## Events

The state machine processes the following events:

| Event             | Payload                           | Description                       |
| ----------------- | --------------------------------- | --------------------------------- |
| `START`           | `{ intent: string }`              | Begin a new clarification session |
| `PROMPT_RECEIVED` | `{ prompt: ClarificationPrompt }` | New prompt received from backend  |
| `OPTION_SELECTED` | `{ optionId: string }`            | User selected an option           |
| `GENERATE`        | -                                 | Request OKR generation            |
| `OKR_GENERATED`   | `{ okr: OKRDocument }`            | OKR successfully generated        |
| `RESET`           | -                                 | Reset to idle state               |
| `ERROR`           | `{ error: ErrorInfo }`            | An error occurred                 |

## State Transitions

```
                    START
    ┌─────────────────┐
    │                 ▼
    │  ┌──────────┐  loading  ┌───────────┐
    │  │   idle   │──────────▶│  loading  │
    │  └──────────┘           └─────┬─────┘
    │       ▲                       │ PROMPT_RECEIVED
    │       │ RESET                 ▼
    │       │               ┌───────────┐
    │       │               │ prompting │◀──────────────┐
    │       │               └─────┬─────┘               │
    │       │                     │ OPTION_SELECTED     │ PROMPT_RECEIVED
    │       │                     │ (x2 prompts)        │
    │       │                     ▼                     │
    │       │               ┌───────────┐               │
    │       └───────────────│   ready   │───────────────┘
    │                       └─────┬─────┘
    │                             │ GENERATE
    │                             ▼
    │                       ┌───────────┐
    │                       │ generating│
    │                       └─────┬─────┘
    │                             │ OKR_GENERATED
    │                             ▼
    │  RESET              ┌───────────┐     START
    └─────────────────────│ completed │──────────▶ loading
                          └───────────┘
```

### Valid Transitions

| From State   | Valid Events    | To State(s)                                              |
| ------------ | --------------- | -------------------------------------------------------- |
| `idle`       | START           | `loading`                                                |
| `idle`       | RESET           | `idle`                                                   |
| `loading`    | PROMPT_RECEIVED | `prompting`                                              |
| `loading`    | ERROR           | `error`                                                  |
| `loading`    | RESET           | `idle`                                                   |
| `prompting`  | PROMPT_RECEIVED | `prompting` (adds to history)                            |
| `prompting`  | OPTION_SELECTED | `prompting` (if < 2 prompts) or `ready` (if ≥ 2 prompts) |
| `prompting`  | ERROR           | `error`                                                  |
| `prompting`  | RESET           | `idle`                                                   |
| `ready`      | GENERATE        | `generating`                                             |
| `ready`      | PROMPT_RECEIVED | `prompting`                                              |
| `ready`      | ERROR           | `error`                                                  |
| `ready`      | RESET           | `idle`                                                   |
| `generating` | OKR_GENERATED   | `completed`                                              |
| `generating` | ERROR           | `error`                                                  |
| `generating` | RESET           | `idle`                                                   |
| `completed`  | START           | `loading`                                                |
| `completed`  | RESET           | `idle`                                                   |
| `error`      | START           | `loading`                                                |
| `error`      | RESET           | `idle`                                                   |

### Invalid Transitions (Will Throw)

- `idle` -> GENERATE, OKR_GENERATED, PROMPT_RECEIVED, OPTION_SELECTED
- `loading` -> GENERATE, OKR_GENERATED, OPTION_SELECTED
- `prompting` -> GENERATE, OKR_GENERATED
- `ready` -> OKR_GENERATED, OPTION_SELECTED
- `generating` -> PROMPT_RECEIVED, OPTION_SELECTED, START
- `completed` -> PROMPT_RECEIVED, OPTION_SELECTED, GENERATE, OKR_GENERATED
- `error` -> GENERATE, OKR_GENERATED, PROMPT_RECEIVED, OPTION_SELECTED

## Usage

### Basic Workflow

```typescript
import { clarificationReducer } from './clarification.state-machine';

// Start a session
let state = clarificationReducer(
  { type: 'idle' },
  { type: 'START', intent: 'improve performance' },
);
// state = { type: 'loading', intent: 'improve performance' }

// Receive a prompt
state = clarificationReducer(state, { type: 'PROMPT_RECEIVED', prompt: myPrompt });
// state = { type: 'prompting', prompt: myPrompt, history: [myPrompt] }

// Select an option
state = clarificationReducer(state, { type: 'OPTION_SELECTED', optionId: 'opt-1' });
// state = { type: 'prompting', ... } (still prompting, only 1 prompt)

// Receive second prompt and select
state = clarificationReducer(state, { type: 'PROMPT_RECEIVED', prompt: myPrompt2 });
state = clarificationReducer(state, { type: 'OPTION_SELECTED', optionId: 'opt-2' });
// state = { type: 'ready', context: { selections: [...], history: [...] } }

// Generate OKR
state = clarificationReducer(state, { type: 'GENERATE' });
// state = { type: 'generating', context: { ... } }

// Complete
state = clarificationReducer(state, { type: 'OKR_GENERATED', okr: myOkr });
// state = { type: 'completed', okr: myOkr }
```

### With Store

```typescript
import { ClarificationStore } from './clarification.store';

const store = new ClarificationStore();

// Start session
store.setLoading('improve performance');

// Set prompts
store.setPrompt(prompt1);
store.setPrompt(prompt2);

// Record selections
store.recordSelection('opt-1');
store.recordSelection('opt-2');

// Check readiness
store.isReadyToGenerate$.subscribe((ready) => console.log('Ready:', ready));

// Generate
store.setGenerating();

// Complete
store.setCompleted(myOkr);
```

## Error Handling

Errors automatically transition to the `error` state while preserving the previous state:

```typescript
// From loading
const errorState = clarificationReducer(
  { type: 'loading', intent: 'test' },
  { type: 'ERROR', error: { message: 'Network error', recoverable: true } },
);
// errorState = { type: 'error', error: { ... }, previousState: { type: 'loading', ... } }
```

From the `error` state, you can:

1. **Retry**: Send START event to go back to `loading`
2. **Reset**: Send RESET event to go back to `idle`

## Type Guards

Use type guards to narrow state types:

```typescript
import { isPromptingState, isReadyState } from './clarification.state-machine';

if (isPromptingState(state)) {
  console.log('Current prompt:', state.prompt.question);
}

if (isReadyState(state)) {
  console.log('Selections:', state.context.selections);
}
```

## Backward Compatibility

The `ClarificationStore` maintains backward compatibility with the old API:

- `workflowState$` - Observable of current state type string
- `setLoading()` - Now accepts optional intent parameter
- `setPrompt()` - Works with state machine internally
- `recordSelection()` - Works with state machine internally
- `markReady()` - **Deprecated**, no longer needed (state machine determines readiness)

## Testing

See `clarification.state-machine.spec.ts` for comprehensive tests covering:

- All valid state transitions
- All invalid transitions (expecting throws)
- Error handling
- Reset behavior
- Type guards
