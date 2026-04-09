# Test Organization Audit Report

**Date:** 2026-04-08  
**Auditor:** Sisyphus-Junior  
**Scope:** `/mnt/d/Code/ClarityOKR/tests/` directory

---

## Executive Summary

The test organization in the ClarityOKR project has **5 significant inconsistencies** that need to be addressed. These issues span directory structure, file naming conventions, and mock organization.

---

## 1. Component Tests in Wrong Location (HIGH PRIORITY)

**Expected:**

- Per `tests/AGENTS.md`: "Component tests (`*.test.ts`) live alongside components in `app/renderer/`"
- File pattern: `*.test.ts`

**Actual:**

- Component tests exist in `tests/component/` directory
- 2 files found:
  - `tests/component/okr-sticky/okr-sticky.component.spec.ts`
  - `tests/component/okr-sticky/okr-editing.component.spec.ts`
- Uses `.spec.ts` extension instead of `.test.ts`

**Inconsistency:**
Component tests are centralized in `tests/component/` with `.spec.ts` naming, but should be:

1. Co-located with components in `app/renderer/`
2. Named with `.test.ts` extension

**Evidence:**

- AGENTS.md states: "❌ NEVER co-locate unit/integration tests with source - Exception: Component tests (`*.test.ts`) live alongside components in `app/renderer/`"
- However, proper `.test.ts` files DO exist in `app/renderer/` (9 files found)

---

## 2. Unit Tests Directory Structure Mismatch (MEDIUM PRIORITY)

**Expected:**

- Per `tests/AGENTS.md` structure diagram:
  ```
  tests/unit/
  ├── jest.config.cjs
  ├── tsconfig.json
  └── src/                # Unit tests for main process
  ```

**Actual:**

- Unit tests are located directly in `tests/unit/` subdirectories, not in a `src/` folder:
  ```
  tests/unit/
  ├── __mocks__/
  ├── clarification/
  ├── controllers/
  ├── lib/
  ├── main/
  ├── okr-sticky/
  ├── persistence/
  ├── services/
  ├── telemetry/
  └── windows/
  ```

**Inconsistency:**
The AGENTS.md documents a `src/` subdirectory that doesn't exist in practice.

---

## 3. Mock File Extension Inconsistency (MEDIUM PRIORITY)

**Expected:**

- All mock files should use TypeScript (`.ts`) extension for consistency

**Actual:**

- Found a `.cjs` file in mocks directory:
  - `tests/unit/__mocks__/angular-renderer/app/okr-sticky/stores/edit-mode.store.cjs`
- All other 11 mock files use `.ts` extension

**Inconsistency:**
One mock file uses CommonJS format while all others use TypeScript.

---

## 4. Integration Tests Have Mocks (LOW PRIORITY)

**Expected:**

- Per `tests/AGENTS.md`: "Unit: `tests/unit/__mocks__/`"
- No mention of mocks in integration tests

**Actual:**

- Found mock file in integration directory:
  - `tests/integration/__mocks__/electron.ts`

**Inconsistency:**
Integration tests have their own mocks directory, which may indicate:

- Duplicate mock code
- Unclear separation of concerns
- Need for documentation update

---

## 5. Debug Test Files in E2E Specs (LOW PRIORITY)

**Observation:**

- E2E specs directory contains a `debug/` subdirectory with 6 files:
  - `timing-analysis.spec.ts`
  - `super-debug.spec.ts`
  - `shadow-dom-check.spec.ts`
  - `selector-strategies.spec.ts`
  - `error-flow-debug.spec.ts`
  - `dom-investigation.spec.ts`

**Question:**
Are these actual tests or development/debugging utilities? If they're not meant to run in CI, they should be:

- Moved to a `helpers/` or `tools/` directory
- Excluded from test runs via configuration
- Documented as debug utilities

---

## Summary of Required Fixes

| #   | Issue                             | Priority | Action Required                                                                                                           |
| --- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Component tests in wrong location | HIGH     | Move `tests/component/` files to appropriate locations in `app/renderer/` OR update AGENTS.md to reflect actual structure |
| 2   | Component test naming             | HIGH     | Rename `*.spec.ts` to `*.test.ts` in component tests OR update AGENTS.md                                                  |
| 3   | Unit tests structure              | MEDIUM   | Either create `src/` subdirectory and move tests, OR update AGENTS.md documentation                                       |
| 4   | Mock file extension               | MEDIUM   | Convert `edit-mode.store.cjs` to TypeScript OR document why CJS is needed                                                 |
| 5   | Integration mocks                 | LOW      | Document integration mock strategy OR move mocks to shared location                                                       |
| 6   | Debug specs                       | LOW      | Determine if debug specs should be excluded from CI or moved                                                              |

---

## Appendix: Test File Inventory

### Unit Tests (`.spec.ts`) - 14 files

Located in: `tests/unit/`

### Integration Tests (`.spec.ts`) - 21 files

Located in: `tests/integration/specs/`

### E2E Tests (`.spec.ts`) - 18 files

Located in: `tests/e2e/specs/`

### Component Tests (`.test.ts`) - 9 files (CORRECT)

Located in: `app/renderer/` alongside components

### Component Tests (`.spec.ts`) - 2 files (INCORRECT)

Located in: `tests/component/okr-sticky/` (should be `.test.ts` in `app/renderer/`)

---

**End of Report**
