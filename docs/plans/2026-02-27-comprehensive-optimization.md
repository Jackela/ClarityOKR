# ClarityOKR Comprehensive Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor ClarityOKR to eliminate technical debt, establish a design system, fix type safety issues, and complete missing features.

**Architecture:**

- Extract shared persistence utilities into a single module
- Split the monolithic ClarificationController into focused services
- Create CSS design tokens and shared component styles
- Fix TypeScript strict mode violations across the codebase
- Complete User Story 2 (sticky window) and User Story 3 (editing)

**Tech Stack:** TypeScript 5.4 (strict), Angular 17 (standalone), Electron 30, Zod, @ngrx/component-store, SCSS

---

## Execution Strategy: Parallel Streams

This plan is organized into **5 parallel streams** that can be executed independently by different subagents:

| Stream | Focus Area            | Dependencies | Estimated Tasks |
| ------ | --------------------- | ------------ | --------------- |
| A      | Persistence Layer     | None         | 4 tasks         |
| B      | Main Process Refactor | Stream A     | 5 tasks         |
| C      | Renderer Type Safety  | None         | 4 tasks         |
| D      | Design System         | None         | 5 tasks         |
| E      | Angular Improvements  | Stream D     | 4 tasks         |

**Execution Order:**

1. Start Streams A, C, D in parallel (no dependencies)
2. Once A completes, start Stream B
3. Once D completes, start Stream E
4. Final integration and testing

---

## Stream A: Persistence Layer Refactoring

### Task A1: Extract Shared Persistence Utilities

**Files:**

- Create: `app/main/src/persistence/utils.ts`
- Test: `tests/unit/persistence/utils.spec.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/persistence/utils.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ensureDataDir, readJson, writeJson } from '../../../app/main/src/persistence/utils.js';

const TEST_DIR = join(process.cwd(), 'data-test-utils');

describe('persistence utils', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('ensureDataDir creates directory if not exists', async () => {
    await ensureDataDir(TEST_DIR);
    const stat = await fs.stat(TEST_DIR);
    expect(stat.isDirectory()).toBe(true);
  });

  it('readJson returns null for non-existent file', async () => {
    const result = await readJson<{ foo: string }>(join(TEST_DIR, 'missing.json'));
    expect(result).toBeNull();
  });

  it('writeJson and readJson round-trip correctly', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'test.json');
    const data = { name: 'test', count: 42 };
    await writeJson(filePath, data);
    const result = await readJson<typeof data>(filePath);
    expect(result).toEqual(data);
  });

  it('readJson returns null for empty file', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'empty.json');
    await fs.writeFile(filePath, '', 'utf-8');
    const result = await readJson<{ foo: string }>(filePath);
    expect(result).toBeNull();
  });

  it('readJson returns null for invalid JSON', async () => {
    await ensureDataDir(TEST_DIR);
    const filePath = join(TEST_DIR, 'invalid.json');
    await fs.writeFile(filePath, 'not valid json', 'utf-8');
    const result = await readJson<{ foo: string }>(filePath);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/utils.spec.ts
```

Expected: FAIL with "cannot find module"

**Step 3: Write minimal implementation**

```typescript
// app/main/src/persistence/utils.ts
import { promises as fs } from 'node:fs';

export async function ensureDataDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export async function writeJson<T>(file: string, value: T): Promise<void> {
  const payload = JSON.stringify(value, null, 2);
  await fs.writeFile(file, payload, 'utf-8');
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/utils.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/main/src/persistence/utils.ts tests/unit/persistence/utils.spec.ts
git commit -m "refactor(persistence): extract shared utilities"
```

---

### Task A2: Refactor SessionRepository to Use Shared Utils

**Files:**

- Modify: `app/main/src/persistence/session-repository.ts`
- Test: `tests/unit/persistence/session-repository.spec.ts` (update imports)

**Step 1: Verify existing tests pass**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/
```

Expected: PASS (or note current state)

**Step 2: Update session-repository.ts**

```typescript
// app/main/src/persistence/session-repository.ts
import { join } from 'node:path';

import type { ClarificationSession, OKRDocument, UserActionLogEntry } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const SESSION_FILE = join(DATA_DIR, 'clarification-session.json');
const OKR_FILE = join(DATA_DIR, 'okr-document.json');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

export interface PersistedState {
  session: ClarificationSession | null;
  okr: OKRDocument | null;
  actions: UserActionLogEntry[];
}

export class SessionRepository {
  async load(): Promise<PersistedState> {
    await ensureDataDir(DATA_DIR);

    const [session, okr, actions] = await Promise.all([
      readJson<ClarificationSession>(SESSION_FILE),
      readJson<OKRDocument>(OKR_FILE),
      readJson<UserActionLogEntry[]>(ACTION_LOG_FILE),
    ]);

    return {
      session,
      okr,
      actions: actions ?? [],
    };
  }

  async saveSession(session: ClarificationSession | null): Promise<void> {
    await ensureDataDir(DATA_DIR);

    if (session) {
      await writeJson(SESSION_FILE, session);
    } else {
      const { promises: fs } = await import('node:fs');
      await fs.rm(SESSION_FILE, { force: true });
    }
  }

  async saveOKRDocument(document: OKRDocument | null): Promise<void> {
    await ensureDataDir(DATA_DIR);

    if (document) {
      await writeJson(OKR_FILE, document);
    } else {
      const { promises: fs } = await import('node:fs');
      await fs.rm(OKR_FILE, { force: true });
    }
  }

  async appendActionLog(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(DATA_DIR);

    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async replaceActionLog(entries: UserActionLogEntry[]): Promise<void> {
    await ensureDataDir(DATA_DIR);
    await writeJson(ACTION_LOG_FILE, entries);
  }
}
```

**Step 3: Run tests to verify**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/
```

Expected: PASS

**Step 4: Commit**

```bash
git add app/main/src/persistence/session-repository.ts
git commit -m "refactor(persistence): session-repository uses shared utils"
```

---

### Task A3: Refactor OkrRepository to Use Shared Utils

**Files:**

- Modify: `app/main/src/persistence/okr-repository.ts`

**Step 1: Update okr-repository.ts**

```typescript
// app/main/src/persistence/okr-repository.ts
import { join } from 'node:path';

import type { OKRDocument } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const OKR_FILE = join(DATA_DIR, 'okr-document.json');

export class OkrRepository {
  async loadLatest(): Promise<OKRDocument | null> {
    await ensureDataDir(DATA_DIR);
    return readJson<OKRDocument>(OKR_FILE);
  }

  async save(document: OKRDocument): Promise<void> {
    await ensureDataDir(DATA_DIR);
    await writeJson(OKR_FILE, document);
  }
}
```

**Step 2: Run tests to verify**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/
```

Expected: PASS

**Step 3: Commit**

```bash
git add app/main/src/persistence/okr-repository.ts
git commit -m "refactor(persistence): okr-repository uses shared utils"
```

---

### Task A4: Refactor ActionLogWriter to Use Shared Utils

**Files:**

- Modify: `app/main/src/persistence/action-log-writer.ts`

**Step 1: Update action-log-writer.ts**

```typescript
// app/main/src/persistence/action-log-writer.ts
import { join } from 'node:path';

import type { UserActionLogEntry } from '@clarityokr/contracts';

import { ensureDataDir, readJson, writeJson } from './utils.js';

const DATA_DIR = join(process.cwd(), 'data');
const ACTION_LOG_FILE = join(DATA_DIR, 'action-log.json');

export class ActionLogWriter {
  async append(entry: UserActionLogEntry): Promise<void> {
    await ensureDataDir(DATA_DIR);
    const current = (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
    current.push(entry);
    await writeJson(ACTION_LOG_FILE, current);
  }

  async all(): Promise<UserActionLogEntry[]> {
    await ensureDataDir(DATA_DIR);
    return (await readJson<UserActionLogEntry[]>(ACTION_LOG_FILE)) ?? [];
  }
}
```

**Step 2: Run tests to verify**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/persistence/
pnpm run typecheck
pnpm run lint
```

Expected: All PASS

**Step 3: Commit**

```bash
git add app/main/src/persistence/action-log-writer.ts
git commit -m "refactor(persistence): action-log-writer uses shared utils"
```

---

## Stream B: Main Process Refactoring (Depends on Stream A)

### Task B1: Extract LLM Response Types to Contracts

**Files:**

- Modify: `packages/contracts/src/clarify-to-okr.contract.ts`
- Modify: `packages/contracts/src/validators/clarify-to-okr.validator.ts`
- Test: `tests/unit/contracts/llm-types.spec.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/contracts/llm-types.spec.ts
import { describe, it, expect } from 'vitest';
import {
  LlmQuestionOptionSchema,
  LlmNextQuestionResponseSchema,
  LlmKeyResultSchema,
  LlmObjectiveSchema,
  LlmDraftResponseSchema,
} from '@clarityokr/contracts';

describe('LLM response types', () => {
  it('validates LlmQuestionOption', () => {
    const valid = { id: 'q1', label: 'Option 1', value: 'opt1' };
    expect(() => LlmQuestionOptionSchema.parse(valid)).not.toThrow();
  });

  it('validates LlmNextQuestionResponse', () => {
    const valid = {
      question: {
        id: 'q1',
        text: 'What is your goal?',
        options: [{ id: 'o1', label: 'Efficiency' }],
      },
    };
    expect(() => LlmNextQuestionResponseSchema.parse(valid)).not.toThrow();
  });

  it('validates LlmDraftResponse', () => {
    const valid = {
      draft: {
        objectives: [
          {
            id: 'obj1',
            title: 'Improve efficiency',
            keyResults: [
              {
                id: 'kr1',
                statement: 'Reduce processing time',
                target: 50,
                measurement: 'percent',
              },
            ],
          },
        ],
      },
    };
    expect(() => LlmDraftResponseSchema.parse(valid)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/contracts/llm-types.spec.ts
```

Expected: FAIL

**Step 3: Add types to contracts**

```typescript
// Add to packages/contracts/src/clarify-to-okr.contract.ts

// LLM API Response Types
export interface LlmQuestionOption {
  id: string;
  label: string;
  value?: string;
}

export interface LlmQuestion {
  id: string;
  text: string;
  options: LlmQuestionOption[];
}

export interface LlmNextQuestionResponse {
  question: LlmQuestion;
}

export interface LlmKeyResult {
  id?: string;
  statement?: string;
  target?: number | string;
  measurement?: string;
}

export interface LlmObjective {
  id?: string;
  title?: string;
  description?: string;
  keyResults?: LlmKeyResult[];
}

export interface LlmDraft {
  objectives?: LlmObjective[];
}

export interface LlmDraftResponse {
  draft?: LlmDraft;
}
```

```typescript
// Add to packages/contracts/src/validators/clarify-to-okr.validator.ts

export const LlmQuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().optional(),
});

export const LlmQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(LlmQuestionOptionSchema),
});

export const LlmNextQuestionResponseSchema = z.object({
  question: LlmQuestionSchema,
});

export const LlmKeyResultSchema = z.object({
  id: z.string().optional(),
  statement: z.string().optional(),
  target: z.union([z.number(), z.string()]).optional(),
  measurement: z.string().optional(),
});

export const LlmObjectiveSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  keyResults: z.array(LlmKeyResultSchema).optional(),
});

export const LlmDraftSchema = z.object({
  objectives: z.array(LlmObjectiveSchema).optional(),
});

export const LlmDraftResponseSchema = z.object({
  draft: LlmDraftSchema.optional(),
});
```

**Step 4: Run tests**

```bash
pnpm run build:contracts
pnpm --filter @clarityokr/tests-unit run test tests/unit/contracts/llm-types.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/contracts/src/clarify-to-okr.contract.ts packages/contracts/src/validators/clarify-to-okr.validator.ts tests/unit/contracts/llm-types.spec.ts
git commit -m "feat(contracts): add LLM response type definitions"
```

---

### Task B2: Create LlmIntegrationService

**Files:**

- Create: `app/main/src/services/llm-integration.service.ts`
- Test: `tests/unit/services/llm-integration.service.spec.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/services/llm-integration.service.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LlmIntegrationService } from '../../../app/main/src/services/llm-integration.service.js';
import type { LlmNextQuestionResponse, LlmDraftResponse } from '@clarityokr/contracts';

describe('LlmIntegrationService', () => {
  let service: LlmIntegrationService;
  const mockFetch = vi.fn();

  beforeEach(() => {
    service = new LlmIntegrationService({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com',
      model: 'test-model',
      timeoutMs: 1000,
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('getNextQuestion returns validated response', async () => {
    const mockResponse: LlmNextQuestionResponse = {
      question: {
        id: 'q1',
        text: 'Test question?',
        options: [{ id: 'o1', label: 'Option 1' }],
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await service.getNextQuestion(
      { turns: [] },
      { questionId: 'init', optionId: 'test' },
    );
    expect(result.question.id).toBe('q1');
  });

  it('generateDraft returns validated response', async () => {
    const mockResponse: LlmDraftResponse = {
      draft: {
        objectives: [
          {
            id: 'obj1',
            title: 'Test Objective',
            keyResults: [],
          },
        ],
      },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await service.generateDraft({ turns: [] });
    expect(result.draft?.objectives?.[0]?.title).toBe('Test Objective');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      service.getNextQuestion({ turns: [] }, { questionId: 'init', optionId: 'test' }),
    ).rejects.toThrow('LLM request failed');
  });

  it('throws on timeout', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    await expect(
      service.getNextQuestion({ turns: [] }, { questionId: 'init', optionId: 'test' }),
    ).rejects.toThrow('timed out');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/services/llm-integration.service.spec.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// app/main/src/services/llm-integration.service.ts
import {
  LlmNextQuestionResponseSchema,
  LlmDraftResponseSchema,
  type LlmNextQuestionResponse,
  type LlmDraftResponse,
} from '@clarityokr/contracts';

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface ClarificationContext {
  turns: Array<{ questionId: string; optionId: string; timestamp: string }>;
}

export interface LastChoice {
  questionId: string;
  optionId: string;
}

export class LlmIntegrationService {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly headers: HeadersInit;

  constructor(config: LlmConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    };
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    validate: (data: unknown) => { success: boolean; data?: T },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      const parsed = validate(data);

      if (!parsed.success) {
        // Single retry on validation failure
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(body),
        });

        if (!retryResponse.ok) {
          throw new Error(`LLM request failed: ${retryResponse.status}`);
        }

        const retryData = await retryResponse.json();
        const retryParsed = validate(retryData);

        if (!retryParsed.success) {
          throw new Error('LLM response invalid after repair attempt');
        }

        return retryParsed.data as T;
      }

      return parsed.data as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Promise<LlmNextQuestionResponse> {
    const payload = { context, lastChoice, model: this.model, type: 'next-question' };
    return this.postJson('/v1/responses', payload, (data) =>
      LlmNextQuestionResponseSchema.safeParse(data),
    );
  }

  async generateDraft(context: ClarificationContext): Promise<LlmDraftResponse> {
    const payload = { context, model: this.model, type: 'okr-draft' };
    return this.postJson('/v1/responses', payload, (data) =>
      LlmDraftResponseSchema.safeParse(data),
    );
  }
}
```

**Step 4: Run tests**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/services/llm-integration.service.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/main/src/services/llm-integration.service.ts tests/unit/services/llm-integration.service.spec.ts
git commit -m "refactor(main): create LlmIntegrationService with proper types"
```

---

### Task B3: Create OkrBuilderService

**Files:**

- Create: `app/main/src/services/okr-builder.service.ts`
- Test: `tests/unit/services/okr-builder.service.spec.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/services/okr-builder.service.spec.ts
import { describe, it, expect } from 'vitest';
import { OkrBuilderService } from '../../../app/main/src/services/okr-builder.service.js';
import type { ClarificationSession, LlmDraftResponse } from '@clarityokr/contracts';

describe('OkrBuilderService', () => {
  const service = new OkrBuilderService();

  it('builds OKR from session with default values', () => {
    const session: ClarificationSession = {
      id: 'session-1',
      initialIntent: '提高效率',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
      steps: [],
      selectedOptionIds: ['scope', 'metric'],
      confidence: 0.9,
    };

    const okr = service.buildFromSession(session, '提高团队工作效率');

    expect(okr.sourceSessionId).toBe('session-1');
    expect(okr.objective).toContain('提高团队工作效率');
    expect(okr.keyResults.length).toBeGreaterThanOrEqual(2);
    expect(okr.regenerationPolicy).toBe('append');
    expect(okr.manualEdits).toEqual([]);
  });

  it('builds OKR from LLM draft response', () => {
    const llmResponse: LlmDraftResponse = {
      draft: {
        objectives: [
          {
            id: 'obj1',
            title: '提升产品质量',
            keyResults: [
              { id: 'kr1', statement: '减少缺陷数量', target: 50, measurement: 'percent' },
              { id: 'kr2', statement: '提高测试覆盖率', target: 80, measurement: 'percent' },
            ],
          },
        ],
      },
    };

    const session: ClarificationSession = {
      id: 'session-2',
      initialIntent: 'quality',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
      steps: [],
      selectedOptionIds: [],
      confidence: 0.8,
    };

    const okr = service.buildFromLlmDraft(llmResponse, session);

    expect(okr.objective).toBe('提升产品质量');
    expect(okr.keyResults.length).toBe(2);
    expect(okr.keyResults[0].statement).toBe('减少缺陷数量');
    expect(okr.keyResults[0].successMetric).toBe('50 percent');
  });

  it('handles empty LLM draft gracefully', () => {
    const llmResponse: LlmDraftResponse = { draft: { objectives: [] } };
    const session: ClarificationSession = {
      id: 'session-3',
      initialIntent: 'test',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
      steps: [],
      selectedOptionIds: [],
      confidence: 0.5,
    };

    expect(() => service.buildFromLlmDraft(llmResponse, session)).toThrow('missing objectives');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/services/okr-builder.service.spec.ts
```

Expected: FAIL

**Step 3: Write implementation**

```typescript
// app/main/src/services/okr-builder.service.ts
import { randomUUID } from 'node:crypto';
import type {
  ClarificationSession,
  KeyResult,
  OKRDocument,
  LlmDraftResponse,
} from '@clarityokr/contracts';

export class OkrBuilderService {
  buildFromSession(session: ClarificationSession, intentSummary: string): OKRDocument {
    const generatedAt = new Date().toISOString();
    const objective = `围绕"${intentSummary}"提升执行成效`;
    const keyResults = this.createDefaultKeyResults(intentSummary);

    return {
      id: randomUUID(),
      objective,
      keyResults,
      sourceSessionId: session.id,
      generatedAt,
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: [],
    } satisfies OKRDocument;
  }

  buildFromLlmDraft(draft: LlmDraftResponse, session: ClarificationSession): OKRDocument {
    const firstObjective = draft.draft?.objectives?.[0];

    if (!firstObjective) {
      throw new Error('LLM draft response missing objectives.');
    }

    const keyResults: KeyResult[] = (firstObjective.keyResults ?? []).slice(0, 5).map((kr) => ({
      id: kr.id ?? randomUUID(),
      statement: kr.statement ?? '',
      successMetric: this.buildSuccessMetric(kr.target, kr.measurement),
      owner: undefined,
    }));

    return {
      id: randomUUID(),
      objective: firstObjective.title ?? firstObjective.description ?? '自动生成的目标',
      keyResults,
      sourceSessionId: session.id,
      generatedAt: new Date().toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: [],
    } satisfies OKRDocument;
  }

  private buildSuccessMetric(target: unknown, measurement: string | undefined): string | undefined {
    if (typeof target === 'undefined' || typeof measurement !== 'string') {
      return undefined;
    }
    return `${String(target)} ${measurement}`;
  }

  private createDefaultKeyResults(intentSummary: string): KeyResult[] {
    return [
      {
        id: randomUUID(),
        statement: `为"${intentSummary}"设定可衡量的流程节奏`,
        successMetric: '每周复盘 1 次',
        owner: '团队负责人',
      },
      {
        id: randomUUID(),
        statement: `建立 ${intentSummary} 成果指标追踪`,
        successMetric: '关键指标提升 15%',
        owner: undefined,
      },
    ];
  }
}
```

**Step 4: Run tests**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/services/okr-builder.service.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/main/src/services/okr-builder.service.ts tests/unit/services/okr-builder.service.spec.ts
git commit -m "refactor(main): extract OkrBuilderService"
```

---

### Task B4: Refactor ClarificationController to Use New Services

**Files:**

- Modify: `app/main/src/windows/clarification-controller.ts`

**Step 1: Verify current tests pass**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/main/
```

**Step 2: Update ClarificationController**

```typescript
// app/main/src/windows/clarification-controller.ts
import { randomUUID } from 'node:crypto';

import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  clarificationSessionSchema,
  generateOKRRequestSchema,
  generateOKRResponseSchema,
} from '@clarityokr/contracts';
import type {
  ClarificationPrompt,
  ClarificationSession,
  OKRDocument,
  UserActionLogEntry,
} from '@clarityokr/contracts';

import electron, { type IpcMainEvent } from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { getLlmConfig } from '../env.js';
import { LlmIntegrationService } from '../services/llm-integration.service.js';
import { OkrBuilderService } from '../services/okr-builder.service.js';
import { ActionLogWriter } from '../persistence/action-log-writer.js';
import { OkrRepository } from '../persistence/okr-repository.js';
import { SessionRepository } from '../persistence/session-repository.js';
import { StickyWindowManager } from './sticky-window-manager.js';

export class ClarificationController {
  private readonly llmService: LlmIntegrationService;
  private readonly okrBuilder: OkrBuilderService;

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    private readonly actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    private readonly elect: typeof electron = electron,
  ) {
    const config = getLlmConfig();
    this.llmService = new LlmIntegrationService({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com',
      model: config.model || 'gpt-4o-mini',
      timeoutMs: 5000,
    });
    this.okrBuilder = new OkrBuilderService();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.registerClarificationPromptHandler();
    this.registerClarificationRespondHandler();
    this.registerOkrGenerateHandler();
    this.registerStickyReopenHandler();
    this.registerOkrLatestHandler();
    this.registerLlmNextQuestionHandler();
    this.registerLlmGenerateDraftHandler();
  }

  private registerClarificationPromptHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.CLARIFICATION_PROMPT, async (_event, payload) => {
      const request = clarificationPromptRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();

      const now = new Date().toISOString();
      const persistedSession =
        persisted.session && persisted.session.id === request.sessionId
          ? clarificationSessionSchema.parse(persisted.session)
          : null;

      const session: ClarificationSession = persistedSession ?? {
        id: request.sessionId,
        initialIntent: request.intent,
        status: 'collecting',
        createdAt: now,
        updatedAt: now,
        steps: [],
        selectedOptionIds: [],
        confidence: 0,
        pendingQuestionId: null,
      };

      const data = await this.llmService.getNextQuestion(
        { turns: [] },
        { questionId: 'init', optionId: request.intent },
      );

      const nextPrompt: ClarificationPrompt = {
        id: data.question.id,
        sequence: 0,
        question: data.question.text,
        context: 'LLM generated',
        options: data.question.options.map((o) => ({
          id: o.id,
          label: o.label,
          description: undefined,
          scopeTag: 'llm',
        })),
      };

      session.steps = [...session.steps, nextPrompt];
      session.pendingQuestionId = nextPrompt.id;
      session.updatedAt = new Date().toISOString();

      await this.sessionRepository.saveSession(session);
      void this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: null,
        payloadSummary: `prompt:${nextPrompt.id}`,
      });

      return clarificationPromptResponseSchema.parse({ prompt: nextPrompt });
    });
  }

  private registerClarificationRespondHandler(): void {
    this.elect.ipcMain.on(IPCChannels.CLARIFICATION_RESPOND, (event, payload) => {
      void this.handleResponse(event, payload);
    });
  }

  private registerOkrGenerateHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.OKR_GENERATE, async (_event, payload) => {
      const request = generateOKRRequestSchema.parse(payload);
      const persisted = await this.sessionRepository.load();
      const sessionCandidate = persisted.session;

      if (!sessionCandidate || sessionCandidate.id !== request.sessionId) {
        throw new Error('No active session found for OKR generation.');
      }

      const session = clarificationSessionSchema.parse(sessionCandidate);
      const okr = this.okrBuilder.buildFromSession(session, request.intentSummary);

      session.status = 'completed';
      session.updatedAt = okr.generatedAt;
      session.pendingQuestionId = null;
      session.confidence = Math.max(session.confidence, 0.9);

      await this.sessionRepository.saveSession(session);
      await this.okrRepository.save(okr);
      await this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: okr.id,
        payloadSummary: `okr:${okr.id}`,
      });
      await this.stickyWindowManager.open(okr);

      return generateOKRResponseSchema.parse({ okr, session });
    });
  }

  private registerStickyReopenHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }
      await this.stickyWindowManager.open(okr);
      return { success: true };
    });
  }

  private registerOkrLatestHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });
  }

  private registerLlmNextQuestionHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.LLM_NEXT_QUESTION, async (_event, payload) => {
      const body = payload as {
        context: { turns: Array<{ questionId: string; optionId: string; timestamp: string }> };
        lastChoice: { questionId: string; optionId: string };
      };
      const data = await this.llmService.getNextQuestion(body.context, body.lastChoice);

      const persisted = await this.sessionRepository.load();
      if (!persisted.session) {
        return data;
      }

      const session = clarificationSessionSchema.parse(persisted.session);
      const sequence = session.steps.length;
      const prompt: ClarificationPrompt = {
        id: data.question.id,
        sequence,
        question: data.question.text,
        context: 'LLM generated',
        options: data.question.options.map((o) => ({
          id: o.id,
          label: o.label,
          description: undefined,
          scopeTag: 'llm',
        })),
      };

      session.steps.push(prompt);
      session.pendingQuestionId = prompt.id;
      session.updatedAt = new Date().toISOString();
      await this.sessionRepository.saveSession(session);

      this.elect.webContents
        .getAllWebContents()
        .forEach((wc) => wc.send(IPCChannels.CLARIFICATION_PROMPT, { prompt }));

      return data;
    });
  }

  private registerLlmGenerateDraftHandler(): void {
    this.elect.ipcMain.handle(IPCChannels.LLM_GENERATE_DRAFT, async (_event, payload) => {
      const body = payload as {
        context?: { turns: Array<{ questionId: string; optionId: string; timestamp: string }> };
      };
      const persisted = await this.sessionRepository.load();
      const session = persisted.session
        ? clarificationSessionSchema.parse(persisted.session)
        : null;

      if (!session) {
        throw new Error('No active session found for LLM draft generation.');
      }

      const context = body.context ?? {
        turns: session.steps.map((p) => ({
          questionId: p.id,
          optionId: 'unknown',
          timestamp: new Date().toISOString(),
        })),
      };

      const llmDraft = await this.llmService.generateDraft(context);
      const okr = this.okrBuilder.buildFromLlmDraft(llmDraft, session);

      await this.okrRepository.save(okr);

      const response = generateOKRResponseSchema.parse({ okr, session });
      this.elect.webContents
        .getAllWebContents()
        .forEach((wc) => wc.send(IPCChannels.OKR_GENERATE, response));

      return response;
    });
  }

  private async handleResponse(event: IpcMainEvent, payload: unknown): Promise<void> {
    const response = clarificationOptionSelectionSchema.parse(payload);
    const persisted = await this.sessionRepository.load();

    if (!persisted.session) {
      throw new Error('Cannot record selection without an active clarification session.');
    }

    const session = clarificationSessionSchema.parse(persisted.session);
    session.selectedOptionIds = [...session.selectedOptionIds, response.optionId];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();

    await this.sessionRepository.saveSession(session);
    void this.logAction({
      actionType: 'edit',
      sessionId: session.id,
      okrId: null,
      payloadSummary: `selected:${response.optionId}`,
    });
  }

  private async logAction(entry: Omit<UserActionLogEntry, 'id' | 'occurredAt'>): Promise<void> {
    const action: UserActionLogEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...entry,
    };
    await this.actionLogWriter.append(action);
  }
}
```

**Step 3: Run tests**

```bash
pnpm --filter @clarityokr/tests-unit run test tests/unit/main/
pnpm run typecheck
```

Expected: PASS

**Step 4: Commit**

```bash
git add app/main/src/windows/clarification-controller.ts
git commit -m "refactor(main): simplify ClarificationController using extracted services"
```

---

### Task B5: Remove Duplicate Renderer OkrAgentService

**Files:**

- Delete: `app/renderer/src/app/clarification/services/okr-agent.service.ts`
- Modify: Any files importing from it (update to use IPC)

**Step 1: Find all imports of the renderer OkrAgentService**

```bash
grep -r "okr-agent.service" app/renderer/src/
```

**Step 2: Update LlmGatewayService to not use the duplicate**

The `LlmGatewayService` should already be using IPC. Remove the renderer-side OkrAgentService.

**Step 3: Delete the duplicate file**

```bash
rm app/renderer/src/app/clarification/services/okr-agent.service.ts
```

**Step 4: Run tests and typecheck**

```bash
pnpm run typecheck
pnpm run lint
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(renderer): remove duplicate OkrAgentService"
```

---

## Stream C: Renderer Type Safety

### Task C1: Fix Type Assertions in AppComponent

**Files:**

- Modify: `app/renderer/src/app/app.component.ts`

**Step 1: Remove file-level eslint-disable**

Remove the line:

```typescript
/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-redundant-type-constituents */
```

**Step 2: Fix type assertions**

The store selectors already return properly typed Observables. Remove unnecessary casts:

```typescript
// Before
this.currentPrompt$ = this.store.currentPrompt$ as Observable<ClarificationPrompt | null>;

// After
this.currentPrompt$ = this.store.currentPrompt$;
```

**Step 3: Fix unsafe type access in onGenerate**

```typescript
// Before
const first = (payload as { draft?: { objectives?: Array<{ title?: string }> } })?.draft
  ?.objectives?.[0];

// After - use proper type from contracts
import { type LlmDraftResponse } from '@clarityokr/contracts';

const response = payload as LlmDraftResponse;
const first = response.draft?.objectives?.[0];
```

**Step 4: Run typecheck**

```bash
pnpm run typecheck
pnpm run lint
```

**Step 5: Commit**

```bash
git add app/renderer/src/app/app.component.ts
git commit -m "fix(types): remove unsafe type assertions in AppComponent"
```

---

### Task C2: Fix OkrStickyGatewayService Type Safety

**Files:**

- Modify: `app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts`

**Step 1: Remove file-level eslint-disable**

**Step 2: Fix all the `as` casts and `unknown` types**

The service should use proper types from contracts for all IPC payloads.

**Step 3: Run typecheck**

```bash
pnpm run typecheck
pnpm run lint
```

**Step 4: Commit**

```bash
git add app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts
git commit -m "fix(types): remove unsafe types in OkrStickyGatewayService"
```

---

### Task C3: Create Shared Window Type Declarations

**Files:**

- Modify: `app/renderer/src/app/shared/window.d.ts`

**Step 1: Ensure proper typing for the bridge**

```typescript
// app/renderer/src/app/shared/window.d.ts
import type { ClarifyOkrApi } from './ipc-channel.tokens';

declare global {
  interface Window {
    clarifyOkr?: ClarifyOkrApi;
  }
}

export {};
```

**Step 2: Run typecheck**

```bash
pnpm run typecheck
```

**Step 3: Commit**

```bash
git add app/renderer/src/app/shared/window.d.ts
git commit -m "fix(types): proper window augmentation for IPC bridge"
```

---

### Task C4: Run Full Typecheck and Fix Remaining Issues

**Step 1: Run strict typecheck**

```bash
pnpm run typecheck
pnpm run lint
```

**Step 2: Fix any remaining issues**

Address each error individually until all pass.

**Step 3: Commit**

```bash
git add -A
git commit -m "fix(types): resolve all remaining type safety issues"
```

---

## Stream D: Design System

### Task D1: Create CSS Design Tokens

**Files:**

- Create: `app/renderer/src/styles/_tokens.scss`

**Step 1: Create the tokens file**

```scss
// app/renderer/src/styles/_tokens.scss

:root {
  // Colors - Primary
  --color-primary: #2563eb;
  --color-primary-dark: #1d4ed8;
  --color-primary-darker: #4338ca;
  --color-primary-light: rgba(37, 99, 235, 0.12);
  --color-primary-lighter: rgba(37, 99, 235, 0.06);

  // Colors - Text
  --color-text: #0f172a;
  --color-text-muted: rgba(15, 23, 42, 0.75);
  --color-text-light: rgba(30, 41, 59, 0.7);

  // Colors - Semantic
  --color-error: #b91c1c;
  --color-success: #0f766e;
  --color-purple: #4c1d95;
  --color-purple-light: rgba(79, 70, 229, 0.08);
  --color-purple-border: rgba(79, 70, 229, 0.25);

  // Colors - Background
  --color-bg: #f3f4ff;
  --color-bg-card: #ffffff;
  --color-bg-gradient-start: #f3f4ff;
  --color-bg-gradient-end: #ffffff;

  // Border Radius
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 0.85rem;
  --radius-xl: 1.25rem;
  --radius-full: 999px;

  // Shadows
  --shadow-card: 0 24px 48px rgba(15, 23, 42, 0.08);
  --shadow-button-hover: 0 12px 24px rgba(37, 99, 235, 0.2);
  --shadow-option-hover: 0 8px 16px rgba(37, 99, 235, 0.1);

  // Spacing
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 0.75rem;
  --spacing-lg: 1rem;
  --spacing-xl: 1.5rem;
  --spacing-2xl: 2rem;
  --spacing-3xl: 2.5rem;

  // Typography
  --font-family:
    'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --font-size-sm: 0.75rem;
  --font-size-base: 0.9rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 2rem;
}
```

**Step 2: Update angular.json to include the tokens**

```json
// In app/renderer/angular.json, add to styles:
"styles": [
  "src/styles/_tokens.scss",
  "src/styles.css"
]
```

**Step 3: Commit**

```bash
git add app/renderer/src/styles/_tokens.scss app/renderer/angular.json
git commit -m "feat(styles): add CSS design tokens"
```

---

### Task D2: Create Shared Component Styles

**Files:**

- Create: `app/renderer/src/styles/_components.scss`

**Step 1: Create shared component styles**

```scss
// app/renderer/src/styles/_components.scss

// Buttons
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md) 1.75rem;
  border-radius: var(--radius-full);
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;

  &:disabled {
    background: var(--color-primary-lighter);
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  &:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-button-hover);
  }
}

.btn-primary {
  @extend .btn;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-darker) 100%);
  color: #fff;
}

.btn-secondary {
  @extend .btn;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  padding: var(--spacing-sm) var(--spacing-lg);

  &:hover {
    background: rgba(37, 99, 235, 0.2);
  }
}

// Cards
.card {
  background: var(--color-bg-card);
  border-radius: var(--radius-xl);
  padding: 1.75rem;
  box-shadow: var(--shadow-card);
}

// Badges
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-lg);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.badge--muted {
  background: rgba(100, 116, 139, 0.12);
  color: var(--color-text);
}

.badge--purple {
  background: rgba(76, 29, 149, 0.1);
  color: var(--color-purple);
}

// Inputs
.input {
  padding: 0.9rem var(--spacing-lg);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(37, 99, 235, 0.25);
  font-size: var(--font-size-md);
  background-color: var(--color-primary-lighter);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;

  &:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.65);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  }
}
```

**Step 2: Commit**

```bash
git add app/renderer/src/styles/_components.scss
git commit -m "feat(styles): add shared component styles"
```

---

### Task D3: Update AppComponent to Use Design Tokens

**Files:**

- Modify: `app/renderer/src/app/app.component.ts` (inline styles)

**Step 1: Replace hardcoded values with CSS variables**

Update the inline styles to use the design tokens instead of hardcoded colors/spacing.

**Step 2: Run the app to verify visual consistency**

```bash
pnpm run dev
```

**Step 3: Commit**

```bash
git add app/renderer/src/app/app.component.ts
git commit -m "refactor(styles): use design tokens in AppComponent"
```

---

### Task D4: Update OkrStickyNoteComponent to Use Design Tokens

**Files:**

- Modify: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.scss`

**Step 1: Replace hardcoded values**

Update all hardcoded colors and spacing to use CSS variables.

**Step 2: Commit**

```bash
git add app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.scss
git commit -m "refactor(styles): use design tokens in OkrStickyNoteComponent"
```

---

### Task D5: Update ClarificationWizardComponent to Use Design Tokens

**Files:**

- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.ts` (inline styles)

**Step 1: Replace hardcoded values**

**Step 2: Commit**

```bash
git add app/renderer/src/app/clarification/components/clarification-wizard.component.ts
git commit -m "refactor(styles): use design tokens in ClarificationWizardComponent"
```

---

## Stream E: Angular Improvements (Depends on Stream D)

### Task E1: Extract AppComponent Template and Styles

**Files:**

- Create: `app/renderer/src/app/app.component.html`
- Create: `app/renderer/src/app/app.component.scss`
- Modify: `app/renderer/src/app/app.component.ts`

**Step 1: Extract template to app.component.html**

Move the inline template content to the external file.

**Step 2: Extract styles to app.component.scss**

Move the inline styles to the external file.

**Step 3: Update component decorator**

```typescript
@Component({
  selector: 'clarityokr-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

**Step 4: Run tests**

```bash
pnpm run test:component
```

**Step 5: Commit**

```bash
git add app/renderer/src/app/app.component.html app/renderer/src/app/app.component.scss app/renderer/src/app/app.component.ts
git commit -m "refactor(angular): extract AppComponent template and styles"
```

---

### Task E2: Add OnPush Change Detection to All Components

**Files:**

- Modify: `app/renderer/src/app/app.component.ts`
- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`
- Modify: `app/renderer/src/app/okr-sticky/components/okr-sticky-note.component.ts`

**Step 1: Add changeDetection to each component**

```typescript
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  // ...
  changeDetection: ChangeDetectionStrategy.OnPush
})
```

**Step 2: Run tests to verify no regressions**

```bash
pnpm run test:component
```

**Step 3: Commit**

```bash
git add -A
git commit -m "perf(angular): add OnPush change detection to all components"
```

---

### Task E3: Convert OkrStickyGatewayService to Use ComponentStore

**Files:**

- Create: `app/renderer/src/app/okr-sticky/state/okr-sticky.store.ts`
- Modify: `app/renderer/src/app/okr-sticky/services/okr-sticky-gateway.service.ts`

**Step 1: Create OkrStickyStore**

```typescript
// app/renderer/src/app/okr-sticky/state/okr-sticky.store.ts
import { Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import type { OkrStickyViewModel } from '../services/okr-projection.service';

export interface OkrStickyState {
  viewModel: OkrStickyViewModel | null;
}

const initialState: OkrStickyState = {
  viewModel: null,
};

@Injectable({ providedIn: 'root' })
export class OkrStickyStore extends ComponentStore<OkrStickyState> {
  readonly viewModel$ = this.select((state) => state.viewModel);
  readonly hasStickyNote$ = this.select((state) => state.viewModel !== null);

  constructor() {
    super(initialState);
  }

  readonly setViewModel = this.updater((state, viewModel: OkrStickyViewModel | null) => ({
    ...state,
    viewModel,
  }));

  readonly addKeyResult = this.updater((state, newKr: OkrStickyViewModel['keyResults'][0]) => {
    if (!state.viewModel) return state;
    return {
      ...state,
      viewModel: {
        ...state.viewModel,
        keyResults: [...state.viewModel.keyResults, newKr],
      },
    };
  });
}
```

**Step 2: Update gateway service to use store**

**Step 3: Run tests**

```bash
pnpm run test:component
```

**Step 4: Commit**

```bash
git add app/renderer/src/app/okr-sticky/
git commit -m "refactor(state): use ComponentStore in OkrStickyGateway"
```

---

### Task E4: Add Progress Indicator to Clarification Wizard

**Files:**

- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.ts`
- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.html` (if extracted)

**Step 1: Add step counter input**

```typescript
@Input() currentStep = 0;
@Input() totalSteps = 5;
```

**Step 2: Add progress indicator to template**

```html
<div class="progress-indicator" *ngIf="totalSteps > 0">
  <span class="progress-text">步骤 {{ currentStep + 1 }} / {{ totalSteps }}</span>
  <div class="progress-bar">
    <div class="progress-fill" [style.width.%]="((currentStep + 1) / totalSteps) * 100"></div>
  </div>
</div>
```

**Step 3: Add styles for progress indicator**

**Step 4: Commit**

```bash
git add app/renderer/src/app/clarification/components/
git commit -m "feat(ui): add progress indicator to clarification wizard"
```

---

## Final Integration

### Task F1: Run Full Test Suite

```bash
pnpm run test:local
pnpm run lint
pnpm run typecheck
pnpm run build
```

### Task F2: Run E2E Tests

```bash
pnpm run test:e2e
```

### Task F3: Create Summary Commit

```bash
git add -A
git commit -m "refactor: comprehensive optimization complete

- Extract shared persistence utilities
- Split ClarificationController into focused services
- Add LLM response types to contracts
- Fix all TypeScript strict mode violations
- Create CSS design tokens and shared components
- Add OnPush change detection to all components
- Convert OkrStickyGateway to use ComponentStore
- Add progress indicator to clarification wizard"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2026-02-27-comprehensive-optimization.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
