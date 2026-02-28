# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and high-priority code review issues to achieve AI coding best practices compliance.

**Architecture:**

- Move IPC channel definitions to `@clarityokr/contracts` for single source of truth
- Add channel whitelist validation to preload script
- Add Zod schemas for LLM request types
- Replace `.parse()` with `.safeParse()` for graceful error handling
- Add dependency injection support to ClarificationController
- Extract shared bridge utility and externalize inline templates

**Tech Stack:** TypeScript 5.4 (strict), Zod, Electron 30, Angular 17

---

## Phase 1: P0 Security Fixes (Critical)

### Task 1.1: Move IPC Channels to Contracts Package

**Files:**

- Create: `packages/contracts/src/ipc-channels.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `app/main/src/bootstrap/ipc-channels.ts`
- Modify: `app/renderer/src/app/shared/ipc-channel.tokens.ts`

**Step 1: Create unified IPC channels in contracts**

```typescript
// packages/contracts/src/ipc-channels.ts
export const IPC_CHANNELS = {
  CLARIFICATION_PROMPT: 'clarityokr:clarification:prompt',
  CLARIFICATION_RESPOND: 'clarityokr:clarification:respond',
  OKR_GENERATE: 'clarityokr:okr:generate',
  OKR_REGENERATE: 'clarityokr:okr:regenerate',
  LLM_NEXT_QUESTION: 'clarityokr:llm:next-question',
  LLM_GENERATE_DRAFT: 'clarityokr:llm:generate-draft',
  SESSION_PERSIST: 'clarityokr:session:persist',
  CLIPBOARD_EXPORT: 'clarityokr:clipboard:export',
  STICKY_REOPEN: 'clarityokr:sticky:reopen',
  OKR_LATEST: 'clarityokr:okr:latest',
} as const;

export type IpcChannelKey = keyof typeof IPC_CHANNELS;
export type IpcChannel = (typeof IPC_CHANNELS)[IpcChannelKey];

export const ALLOWED_IPC_CHANNELS: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
```

**Step 2: Export from contracts index**

```typescript
// Add to packages/contracts/src/index.ts
export * from './ipc-channels.js';
```

**Step 3: Update main process to re-export from contracts**

```typescript
// app/main/src/bootstrap/ipc-channels.ts
export { IPC_CHANNELS, type IpcChannelKey, type IpcChannel } from '@clarityokr/contracts';
```

**Step 4: Update renderer process to re-export from contracts**

```typescript
// app/renderer/src/app/shared/ipc-channel.tokens.ts
export { IPC_CHANNELS, type IpcChannelKey, type IpcChannel } from '@clarityokr/contracts';
```

**Step 5: Build and verify**

```bash
pnpm run build:contracts
pnpm run typecheck
```

**Step 6: Commit**

```bash
git add packages/contracts/src/ipc-channels.ts packages/contracts/src/index.ts
git add app/main/src/bootstrap/ipc-channels.ts app/renderer/src/app/shared/ipc-channel.tokens.ts
git commit -m "refactor(contracts): move IPC channels to contracts for SSOT"
```

---

### Task 1.2: Add Channel Whitelist to Preload Script

**Files:**

- Modify: `app/main/src/bootstrap/preload.mts`

**Step 1: Update preload with channel validation**

```typescript
// app/main/src/bootstrap/preload.mts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { ALLOWED_IPC_CHANNELS, type IpcChannel } from '@clarityokr/contracts';

type ClarifyOkrApi = {
  send: (channel: IpcChannel, payload?: unknown) => void;
  invoke: (channel: IpcChannel, payload?: unknown) => Promise<unknown>;
  on: (channel: IpcChannel, listener: (event: IpcRendererEvent, payload: unknown) => void) => void;
};

function validateChannel(channel: string): channel is IpcChannel {
  if (!ALLOWED_IPC_CHANNELS.includes(channel as IpcChannel)) {
    console.error(`[preload] Blocked IPC call to unauthorized channel: ${channel}`);
    return false;
  }
  return true;
}

const api: ClarifyOkrApi = {
  send: (channel, payload) => {
    if (!validateChannel(channel)) return;
    ipcRenderer.send(channel, payload);
  },
  invoke: (channel, payload) => {
    if (!validateChannel(channel)) {
      return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, listener) => {
    if (!validateChannel(channel)) {
      console.error(`[preload] Blocked listener registration for unauthorized channel: ${channel}`);
      return;
    }
    ipcRenderer.on(channel, listener);
  },
};

contextBridge.exposeInMainWorld('clarifyOkr', api);
```

**Step 2: Verify**

```bash
pnpm run typecheck
pnpm run build:main
```

**Step 3: Commit**

```bash
git add app/main/src/bootstrap/preload.mts
git commit -m "security(preload): add IPC channel whitelist validation"
```

---

### Task 1.3: Add Zod Schemas for LLM Request Types

**Files:**

- Modify: `packages/contracts/src/validators/clarify-to-okr.validator.ts`
- Modify: `packages/contracts/src/index.ts`

**Step 1: Add request schemas**

```typescript
// Add to packages/contracts/src/validators/clarify-to-okr.validator.ts

export const llmTurnSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const llmContextSchema = z.object({
  turns: z.array(llmTurnSchema),
});

export const llmLastChoiceSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});

export const llmNextQuestionRequestSchema = z.object({
  context: llmContextSchema,
  lastChoice: llmLastChoiceSchema,
});

export const llmDraftRequestSchema = z.object({
  context: llmContextSchema.optional(),
});

export type LlmTurn = z.infer<typeof llmTurnSchema>;
export type LlmContext = z.infer<typeof llmContextSchema>;
export type LlmLastChoice = z.infer<typeof llmLastChoiceSchema>;
export type LlmNextQuestionRequest = z.infer<typeof llmNextQuestionRequestSchema>;
export type LlmDraftRequest = z.infer<typeof llmDraftRequestSchema>;
```

**Step 2: Export from index**

```typescript
// Add to packages/contracts/src/index.ts
export {
  llmTurnSchema,
  llmContextSchema,
  llmLastChoiceSchema,
  llmNextQuestionRequestSchema,
  llmDraftRequestSchema,
  type LlmTurn,
  type LlmContext,
  type LlmLastChoice,
  type LlmNextQuestionRequest,
  type LlmDraftRequest,
} from './validators/clarify-to-okr.validator.js';
```

**Step 3: Build and verify**

```bash
pnpm run build:contracts
pnpm run typecheck
```

**Step 4: Commit**

```bash
git add packages/contracts/src/validators/clarify-to-okr.validator.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add Zod schemas for LLM request types"
```

---

### Task 1.4: Use safeParse in ClarificationController for LLM Handlers

**Files:**

- Modify: `app/main/src/windows/clarification-controller.ts`

**Step 1: Import new schemas**

```typescript
// Add to imports in clarification-controller.ts
import {
  llmNextQuestionRequestSchema,
  llmDraftRequestSchema,
  type LlmNextQuestionRequest,
  type LlmDraftRequest,
} from '@clarityokr/contracts';
```

**Step 2: Update LLM_NEXT_QUESTION handler (around line 196)**

Replace:

```typescript
const body = payload as LlmNextQuestionRequest;
```

With:

```typescript
const parseResult = llmNextQuestionRequestSchema.safeParse(payload);
if (!parseResult.success) {
  throw new Error(`Invalid LLM next question request: ${parseResult.error.message}`);
}
const body = parseResult.data;
```

**Step 3: Update LLM_GENERATE_DRAFT handler (around line 220)**

Replace:

```typescript
const body = payload as OkrDraftRequest;
```

With:

```typescript
const parseResult = llmDraftRequestSchema.safeParse(payload);
if (!parseResult.success) {
  throw new Error(`Invalid LLM draft request: ${parseResult.error.message}`);
}
const body = parseResult.data;
```

**Step 4: Remove unused type imports**

Remove `LlmNextQuestionRequest` and `OkrDraftRequest` imports from `../main/ipc.llm.js` if no longer needed.

**Step 5: Verify**

```bash
pnpm run typecheck
```

**Step 6: Commit**

```bash
git add app/main/src/windows/clarification-controller.ts
git commit -m "fix(validation): use Zod safeParse for LLM request validation"
```

---

## Phase 2: P1 Architecture Fixes

### Task 2.1: Add Dependency Injection to ClarificationController

**Files:**

- Modify: `app/main/src/windows/clarification-controller.ts`
- Modify: `app/main/src/main.ts`

**Step 1: Update ClarificationController constructor**

```typescript
// In clarification-controller.ts, replace constructor

export interface ClarificationControllerDeps {
  sessionRepository: SessionRepository;
  okrRepository: OkrRepository;
  actionLogWriter: ActionLogWriter;
  stickyWindowManager: StickyWindowManager;
  llmService: LlmIntegrationService;
  okrBuilder: OkrBuilderService;
  elect?: typeof electron;
}

export class ClarificationController {
  private readonly agent: ClarificationAgent = new StaticPromptAgent();

  constructor(private readonly deps: ClarificationControllerDeps) {
    this.registerHandlers();
  }

  private get llm(): LlmIntegrationService {
    return this.deps.llmService;
  }

  private get okrBuilder(): OkrBuilderService {
    return this.deps.okrBuilder;
  }

  private get sessionRepository(): SessionRepository {
    return this.deps.sessionRepository;
  }

  private get okrRepository(): OkrRepository {
    return this.deps.okrRepository;
  }

  private get actionLogWriter(): ActionLogWriter {
    return this.deps.actionLogWriter;
  }

  private get stickyWindowManager(): StickyWindowManager {
    return this.deps.stickyWindowManager;
  }

  private get elect(): typeof electron {
    return this.deps.elect ?? electron;
  }

  // ... rest of class unchanged
}
```

**Step 2: Update main.ts to wire dependencies**

```typescript
// In main.ts, update ClarificationController instantiation

const llmService = new LlmIntegrationService();
const okrBuilder = new OkrBuilderService();

new ClarificationController({
  sessionRepository,
  okrRepository,
  actionLogWriter,
  stickyWindowManager,
  llmService,
  okrBuilder,
});
```

**Step 3: Remove direct instantiation from controller**

Remove these lines from ClarificationController:

```typescript
private readonly llm = new LlmIntegrationService();
private readonly okrBuilder = new OkrBuilderService();
```

**Step 4: Verify**

```bash
pnpm run typecheck
```

**Step 5: Commit**

```bash
git add app/main/src/windows/clarification-controller.ts app/main/src/main.ts
git commit -m "refactor(main): add dependency injection to ClarificationController"
```

---

### Task 2.2: Create Shared Window Bridge Utility

**Files:**

- Create: `app/renderer/src/app/shared/bridge.ts`
- Modify: `app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts`
- Modify: `app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts`

**Step 1: Create shared bridge utility**

```typescript
// app/renderer/src/app/shared/bridge.ts
import type { ClarifyOkrApi } from './ipc-channel.tokens';

export function getClarityBridge(): ClarifyOkrApi {
  const bridge = (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
  if (!bridge) {
    throw new Error('ClarityOKR IPC bridge is not available. Ensure preload script is loaded.');
  }
  return bridge;
}

export function getClarityBridgeOrUndefined(): ClarifyOkrApi | undefined {
  return (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
}
```

**Step 2: Update clarification-orchestrator.service.ts**

Replace the `bridgeOrUndefined()` method with import:

```typescript
import { getClarityBridgeOrUndefined } from '../../shared/bridge.js';

// Replace bridgeOrUndefined() calls with getClarityBridgeOrUndefined()
// Remove the private bridgeOrUndefined() method
```

**Step 3: Update okr-sticky-gateway.service.ts**

```typescript
import { getClarityBridge, getClarityBridgeOrUndefined } from '../../shared/bridge.js';

// Replace bridgeOrUndefined() calls with getClarityBridgeOrUndefined()
// Replace ensureBridge() to use getClarityBridge()
// Remove private bridge methods
```

**Step 4: Verify**

```bash
pnpm run typecheck
```

**Step 5: Commit**

```bash
git add app/renderer/src/app/shared/bridge.ts
git add app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts
git add app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts
git commit -m "refactor(renderer): extract shared bridge utility"
```

---

### Task 2.3: Remove File-Level ESLint Disables

**Files:**

- Modify: `app/renderer/src/app/clarification/services/clarification-orchestrator.service.ts`
- Modify: `app/renderer/src/app/clarification/services/llm-gateway.service.ts`

**Step 1: Remove file-level disable in clarification-orchestrator.service.ts**

Remove the line:

```typescript
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
```

**Step 2: Remove file-level disable in llm-gateway.service.ts**

Remove the line:

```typescript
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
```

**Step 3: Fix any remaining type issues**

Run lint and fix any remaining issues:

```bash
pnpm run lint
```

If there are issues, add inline disables with explanations:

```typescript
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- IPC payload is validated at boundary
```

**Step 4: Verify**

```bash
pnpm run typecheck
pnpm run lint
```

**Step 5: Commit**

```bash
git add -A
git commit -m "fix(lint): remove file-level eslint-disables"
```

---

## Phase 3: P2 Code Quality Fixes

### Task 3.1: Externalize ClarificationWizard Template and Styles

**Files:**

- Create: `app/renderer/src/app/clarification/components/clarification-wizard.component.html`
- Create: `app/renderer/src/app/clarification/components/clarification-wizard.component.scss`
- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`

**Step 1: Extract template to HTML file**

Create `clarification-wizard.component.html` with the current inline template content (remove the backticks).

**Step 2: Extract styles to SCSS file**

Create `clarification-wizard.component.scss` with the current inline styles (convert to proper SCSS).

**Step 3: Update component decorator**

```typescript
@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './clarification-wizard.component.html',
  styleUrls: ['./clarification-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

**Step 4: Verify**

```bash
pnpm run typecheck
pnpm run build:renderer
```

**Step 5: Commit**

```bash
git add app/renderer/src/app/clarification/components/
git commit -m "refactor(angular): externalize ClarificationWizard template and styles"
```

---

### Task 3.2: Add JSDoc to Contracts

**Files:**

- Modify: `packages/contracts/src/clarify-to-okr.contract.ts`

**Step 1: Add JSDoc to key interfaces**

Add documentation comments to interfaces:

```typescript
/** Current status of a clarification session */
export type ClarificationStatus = 'collecting' | 'ready' | 'completed';

/**
 * A single option presented to the user during clarification.
 */
export interface ClarificationOption {
  /** Unique identifier for this option */
  id: string;
  /** Display text shown to the user */
  label: string;
  /** Optional additional context */
  description?: string;
  /** Category tag for grouping (e.g., 'dimension', 'detail') */
  scopeTag: string;
}

// Continue for other key interfaces...
```

**Step 2: Commit**

```bash
git add packages/contracts/src/clarify-to-okr.contract.ts
git commit -m "docs(contracts): add JSDoc documentation to key interfaces"
```

---

## Final Integration

### Task F1: Run Full Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:local
```

### Task F2: Create Summary Commit

```bash
git add -A
git commit -m "fix: address all critical code review issues

- Move IPC channels to @clarityokr/contracts for SSOT
- Add channel whitelist validation to preload
- Add Zod schemas for LLM request types
- Use safeParse for graceful error handling
- Add dependency injection to ClarificationController
- Extract shared bridge utility
- Remove file-level eslint-disables
- Externalize inline templates/styles
- Add JSDoc to contracts"
```
