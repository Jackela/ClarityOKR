# Implementation Plan: Clarify-to-OKR Desktop Flow

**Branch**: `001-clarify-okr-flow` | **Date**: 2025-10-31 | **Spec**: [Clarify-to-OKR Desktop Flow](./spec.md)
**Input**: Feature specification from `/specs/001-clarify-okr-flow/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. Consult the command documentation for execution workflow details.

## Summary

Deliver an Electron-based desktop assistant that guides users from a vague goal through a button-driven clarification interview, generates an Objective with Key Results, and surfaces the OKR in an always-on-top sticky note. The workflow must persist locally between launches, support manual editing, regenerate on demand, and expose clipboard export while keeping contracts and documentation aligned with the shared TypeScript interface package.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`), Node.js 20.x runtime, Angular 17 renderer, Electron 30 main process  
**Primary Dependencies**: Electron IPC + contextBridge, Angular 17 w/ RxJS 7, Zustand-like lightweight state manager (`@ngrx/component-store`), `zod` for runtime validation, Playwright for Electron E2E tests  
**Storage**: Local JSON persistence in OS-specific `appData/ClarityOKR` folder managed via typed repository wrapper around Node `fs/promises`  
**Testing**: Jest + ts-jest for unit tests, Angular TestBed for component tests, Playwright Electron runner for end-to-end interview + sticky window scenarios  
**Target Platform**: Desktop (macOS Sonoma 14+, Windows 11) with mouse/keyboard interaction
**Project Type**: Desktop (Electron shell with Angular renderer)  
**Performance Goals**: Clarification prompt renders within 150ms of agent response; sticky window opens within 300ms of OKR generation; clipboard operation completes in <100ms  
**Constraints**: Must remain offline-capable; OKR note always-on-top; manual edits must persist locally; no dynamic `require()` usage in renderer or preload  
**Scale/Scope**: Single-user session per desktop instance; support up to 20 clarification steps and OKRs with up to 10 Key Results without degradation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Stack Compliance**: ✅ Electron main/renderer + Angular 17 + Node 20 with TypeScript `strict: true` and pure ESM module pipeline.  
- **Architecture Discipline**: ✅ SOLID responsibilities defined for agent orchestrator, state repositories, and view models within Clarification and OKR bounded contexts; fail-fast validation enforced via `zod` schemas.  
- **Test-First Readiness**: ✅ Feature scenarios mapped to Jest + Playwright specs to be authored prior to implementation; clarification interview BDD stories enumerated.  
- **SSOT Alignment**: ✅ Shared `@clarityokr/contracts` package extended with Clarification and OKR interfaces; renderer + main process consume single source.  
- **Documentation Coverage**: ✅ Every public service (agent orchestrator, persistence repo, window service) scheduled for full JSDoc updates alongside code changes.
- **Post-Phase 1 Re-evaluation**: ✅ Design artifacts (data model, contracts, quickstart) confirm assumptions and keep all gates satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
app/
├── main/                 # Electron main process (TypeScript, ESM)
│   ├── bootstrap/
│   ├── windows/
│   └── persistence/
└── renderer/             # Angular application
    ├── src/app/
    │   ├── clarification/
    │   ├── okr-sticky/
    │   └── shared/
    └── src/environments/

packages/
└── contracts/            # @clarityokr/contracts shared interfaces

tests/
├── unit/
├── component/
└── e2e/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: Adopt single Electron + Angular project with shared contracts (`app/main`, `app/renderer`, `packages/contracts`) and dedicated test directories (`tests/unit`, `tests/component`, `tests/e2e`) to keep SOLID responsibilities separated across bounded contexts.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
