# Comprehensive Codebase Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve code quality through integration tests, E2E tests, performance benchmarks, refactoring, and documentation

**Architecture:**

- Add integration tests for main process persistence layer using temporary directories
- Add E2E tests for error scenarios using Playwright's Electron support
- Add performance benchmarks using Node's performance API
- Refactor duplicate code into shared utilities
- Create architecture documentation with diagrams

**Tech Stack:** TypeScript, Jest, Playwright, Node.js performance API, Mermaid diagrams

---

## Task 1: Integration Tests for Persistence Layer (HIGH PRIORITY)

### Task 1.1: SessionRepository Integration Tests

**Files:**

- Create: `tests/integration/specs/persistence/session-repository.spec.ts`
- Modify: `app/main/src/persistence/session-repository.ts`

**Steps:**

1. Write failing test for save/load session persistence
2. Run test - expect FAIL (constructor doesn't accept directory param)
3. Refactor SessionRepository to accept directory parameter
4. Run test - expect PASS
5. Commit

### Task 1.2: OkrRepository Integration Tests

**Files:**

- Create: `tests/integration/specs/persistence/okr-repository.spec.ts`
- Modify: `app/main/src/persistence/okr-repository.ts`

**Steps:**

1. Write failing test for save/load OKR
2. Run test - expect FAIL
3. Refactor OkrRepository to accept directory parameter
4. Run test - expect PASS
5. Commit

### Task 1.3: ActionLogWriter Integration Tests

**Files:**

- Create: `tests/integration/specs/persistence/action-log-writer.spec.ts`
- Modify: `app/main/src/persistence/action-log-writer.ts`

**Steps:**

1. Write failing test for append entries
2. Run test - expect FAIL
3. Refactor ActionLogWriter to accept directory parameter
4. Run test - expect PASS
5. Commit

---

## Task 2: E2E Tests for Error Scenarios (HIGH PRIORITY)

### Task 2.1: Network Error Recovery Test

**Files:**

- Create: `tests/e2e/specs/error-handling/network-errors.spec.ts`
- Modify: `app/renderer/src/app/clarification/components/clarification-wizard.component.*`

**Steps:**

1. Write failing test for network unreachable scenario
2. Run test - expect FAIL (error UI not implemented)
3. Add error handling UI with retry button
4. Run test - expect PASS
5. Commit

### Task 2.2: Invalid LLM Response Test

**Files:**

- Create: `tests/e2e/specs/error-handling/invalid-responses.spec.ts`
- Modify: `app/main/src/windows/clarification-controller.ts`

**Steps:**

1. Write failing test for malformed JSON response
2. Run test - expect FAIL
3. Add validation error handling in main process
4. Run test - expect PASS
5. Commit

---

## Task 3: Performance Benchmarks (MEDIUM PRIORITY)

### Task 3.1: Persistence Performance Benchmarks

**Files:**

- Create: `tests/performance/benchmarks/persistence.bench.ts`
- Create: `app/main/src/persistence/utils.ts`
- Modify: `package.json` (add benchmark script)

**Steps:**

1. Write benchmark tests for save/load operations
2. Add benchmark script to package.json
3. Run benchmark - establish baseline
4. Create shared persistence utilities
5. Run benchmark - verify performance
6. Commit

---

## Task 4: Refactor Legacy Code (MEDIUM PRIORITY)

### Task 4.1: Extract Shared Persistence Utilities

**Files:**

- Modify: `app/main/src/persistence/session-repository.ts`
- Modify: `app/main/src/persistence/okr-repository.ts`
- Modify: `app/main/src/persistence/action-log-writer.ts`
- Uses: `app/main/src/persistence/utils.ts` (created in Task 3)

**Steps:**

1. Verify utils.ts exists from Task 3
2. Refactor SessionRepository to use utilities
3. Run tests - expect PASS
4. Refactor OkrRepository to use utilities
5. Run tests - expect PASS
6. Refactor ActionLogWriter to use utilities
7. Run all persistence tests
8. Commit

### Task 4.2: Remove StaticPromptAgent Dead Code

**Files:**

- Modify: `app/main/src/windows/clarification-controller.ts`

**Steps:**

1. Find StaticPromptAgent usage with grep
2. Remove unused imports and references
3. Run all tests
4. Commit

---

## Task 5: Architecture Documentation (MEDIUM PRIORITY)

### Task 5.1: Create Architecture Diagram

**Files:**

- Create: `docs/architecture.md`

**Content:**

- System overview with Mermaid diagram
- Process architecture (main vs renderer)
- Data flow diagrams
- Technology stack table
- File structure
- Key design decisions

**Steps:**

1. Create architecture.md with diagrams
2. Commit

### Task 5.2: Create Troubleshooting Guide

**Files:**

- Create: `docs/troubleshooting.md`

**Content:**

- Common issues and solutions
- Debug tips
- How to enable logging
- How to run single tests
- How to check IPC messages

**Steps:**

1. Create troubleshooting.md
2. Commit

---

## Execution Priority

**Phase 1 (P1 - High Priority):**

1. Task 1.1-1.3: Integration tests for persistence
2. Task 2.1-2.2: E2E tests for error scenarios

**Phase 2 (P2 - Medium Priority):** 3. Task 3.1: Performance benchmarks 4. Task 4.1-4.2: Refactoring 5. Task 5.1-5.2: Documentation

**Total Estimated Effort:** 4-6 hours
**Dependencies:** None - tasks can proceed in order
**Testing:** TDD approach - write tests first
