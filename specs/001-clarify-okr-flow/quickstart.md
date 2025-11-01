# Quickstart – Clarify-to-OKR Desktop Flow

## Prerequisites
- Node.js 20.x with npm 10+
- pnpm 9.x (preferred workspace manager)
- macOS Sonoma 14+ or Windows 11 test workstation

## Install & Bootstrap
```bash
pnpm install
pnpm run build:contracts   # tsc build for @clarityokr/contracts
pnpm run build:renderer    # Angular build with strict TS config
pnpm run build:main        # Electron main process build
```

## Develop
```bash
pnpm run dev   # Starts Electron with hot-reload renderer + main process
```

## Test (TDD/BDD Loop)
```bash
pnpm run test:unit         # Jest unit + component store specs
pnpm run test:component    # Angular TestBed behavioral specs
pnpm run test:e2e          # Playwright Electron BDD scenarios
```

## Generate OKR Flow
1. Launch dev app (`pnpm run dev`).
2. Enter a vague intent and follow button prompts until “生成 OKR” is enabled.
3. Click “生成 OKR” to open the sticky note; verify always-on-top behavior.
4. Enter edit mode, adjust Objective/Key Results, save, and test “重新生成” policies.
5. Use “复制到剪贴板” and paste into a doc to confirm markdown structure.

## Persistence Check
- Close the application and relaunch from the same build target.
- Confirm the previous ClarificationSession and OKRDocument reload automatically.

## Lint & Type Safety
```bash
pnpm run lint
pnpm run typecheck
```

## Packaging Smoke Test
```bash
pnpm run package:dev   # Electron Forge or equivalent packaging task
```

> Ensure all documentation updates (JSDoc + README sections) are applied before requesting review.
