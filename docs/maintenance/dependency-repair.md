# Dependency and desktop compatibility repair

This candidate removes obsolete tooling, upgrades the supported runtime, and repairs failures exposed by running the actual Electron application. It is not merged or released. `package.json` and `pnpm-lock.yaml` own dependency versions; `.github/workflows/ci.yml` owns CI gates; the linked specifications own product behavior.

## Scope and authority

- Node 24 LTS (`.nvmrc` 24.19.0), TypeScript 5.9.3, Angular 20.3.33, Angular CLI/build 20.3.39, Electron 44.7.0.
- Renderer tests remain Jest. Unused Vitest/Analog dependencies, configuration, setup, and Karma target are removed. Angular's application builder replaces the obsolete webpack builder.
- Security overrides pin published tar 7.5.21, shell-quote 1.9.0, handlebars 4.7.10, piscina 4.9.4 on major 4, and patched JS-YAML majors 3/4.
- Product version remains 0.1.0. Shared IPC contracts gain a validated `OKR_UPDATE` allowlist entry for editable fields; server-owned identity, timestamps, and edit history are preserved. Existing regenerate/clipboard channels are connected to their real services.
- The five previously deleted Codex runtime records stay absent; prompt templates remain source. Historical credential contents were not read or copied.

## Actual compatibility fixes

- Angular output stays at `app/renderer/dist/index.html`, matching Electron. Strict DI discovers missing runtime injection tokens. Default Chinese translations are available synchronously on first render.
- The sandboxed preload is bundled as CommonJS (`preload.cjs`). Electron SQLite modules are rebuilt for its ABI; host Node tests use the host ABI. Missing database parent directories are created, and each E2E test/worker gets an isolated database.
- Each loaded renderer document receives a fresh random 192-bit style nonce, matched to Angular's `ngCspNonce`. Script policy, context isolation, web security, and sandbox remain strict. There is no `unsafe-inline` allowance.
- Next-question IPC responses use the shared `{ prompt }` envelope; recorded selections retain their validated prompt ID and the latest selected option reaches the LLM. Network retry preserves the session and choices.
- Existing edit components and store now drive the visible sticky note. Saving persists only editable fields and broadcasts persisted content. Regeneration validates its actual LLM envelope, fetches a fresh draft, and preserves the manually edited objective. Copying uses the main-process system clipboard and persisted document.
- Sticky titles survive renderer page-title updates. Without an OKR the app offers no reopen action. Responsive E2E mocks obey the real clarification/draft schemas and ignore ancestor/descendant containment when checking overlap.
- HTTP mocks belong to test/worker fixtures. CI selects actual functional specs, with zero retries. The placeholder assertion is deleted; screenshot review tasks remain separate. Normal Playwright actionability is enforced; helpers never enable a disabled button.

## Reproduce validation

```sh
pnpm install --frozen-lockfile
pnpm run test:audit
pnpm run audit:security
pnpm run lint
pnpm run typecheck
pnpm run build:ci
pnpm run test:coverage
pnpm run rebuild:electron
pnpm run test:e2e:ci
# Restore the host ABI before running Node tests again:
pnpm run rebuild:node
```

The security command writes `audit-report.json` and a JSON summary. All high/critical advisories, inconsistent counts, invalid reports, and command/network failures block the gate. No advisory/title exceptions remain. CI always uses the frozen lock.

The clean lock was resolved from workspace manifests in an isolated directory because pnpm 9's incremental resolver retained an obsolete Vitest optional peer. There are no Vitest or tinypool packages in the repaired lock. Node 24 frozen installation succeeds. Existing local proxy routing was used only on affected download subprocesses; TLS verification and global network settings were preserved.

## Security evidence and remaining upstream boundary

The main baseline `b2e257a65afb79a54bc2696145d79cbba992bc75` and initial PR head `dec82380f39ae2ccb23f33590aa82d9c0fe0ba13` each reproduced **10 critical / 99 high**. The repaired lock reports **0 critical / 1 high / 1 moderate**.

The remaining high finding is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), braces <=3.0.3. The published patched-version field is `None`; [upstream issue #70](https://github.com/micromatch/braces/issues/70) has no official fix commit. The active Jest chain is:

```text
jest-environment-jsdom / jest-preset-angular
  Jest fake timers / message utilities
    micromatch 4.0.8
      braces 3.0.3
```

There is no existing repository patch mechanism. A local implementation could require an independent security/compatibility review and still would not resolve the version-based advisory. No version is falsified and no advisory is ignored. This remains an independent mandatory audit failure.

The moderate [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) also has no published patch. Its active chain is Jest coverage tooling, JS-YAML 3, argparse 1, sprintf-js 1.0.3. The audit threshold is unchanged and this severity is recorded.

## Coverage evidence and remaining test boundary

The previous unit coverage reported `Unknown% (0/0)` because source globs pointed outside its scan roots. CI also printed a coverage-success message without checking a percentage. The repair measures the same complete main/renderer source set in unit, component, and integration tests, merges their actual Istanbul hits, then enforces all four original **80%** thresholds. Missing or empty reports and zero denominators fail. Only tests, declarations, and Jest setup files are excluded; product source remains in scope.

Latest local assertions: **496 unit, 158 component, 63 integration** pass. Merged statements **38.20%**, branches **32.26%**, functions **36.74%**, lines **39.61%** fail the 80% gate. New tests exercise actual renderer IPC/state behavior, session-preserving recovery, canonical regeneration, persistence protections, database directory creation, and nonce safety. Existing mock-based unit assertions are not substituted for coverage of their product implementations.

Existing builds do not emit JavaScript source maps (main only emits declaration maps, renderer disables source maps). Raw Electron/Chromium bundle coverage cannot be reported as TypeScript source coverage. Adding actual E2E coverage requires a dedicated test build, main/renderer collection, verified source-map conversion, and cross-job aggregation; that infrastructure is not currently implemented. Remaining uncovered product behavior needs further real tests before the gate passes.

## Check status

Lint and typecheck pass. Build, three audit failure-path tests, and all **23 real Electron E2E tests** pass on Node 24 / Electron 44.7.0, with zero retries (3.2 minutes). The initial pushed repair head also builds successfully on GitHub Linux, macOS, and Windows; strict audit fails, required CI Status fails, and dependent E2E/coverage jobs are skipped. Real Electron functional validation and fresh GitHub checks are recorded against the final candidate in the machine-readable repair record; remote success must not be inferred from a local build. Required CI remains blocked by the unpatched braces advisory and the measured coverage deficit. No merge or release is authorized by these results.

## Primary sources

- [Angular version compatibility](https://angular.dev/reference/versions)
- [Angular application builder migration](https://angular.dev/tools/cli/build-system-migration)
- [Angular CSP nonce guidance](https://v20.angular.dev/best-practices/security)
- [Electron protocol handling](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron net.fetch forwarding](https://www.electronjs.org/docs/latest/api/net/)
- [node-gyp supported configuration](https://github.com/nodejs/node-gyp)
- [Electron 44.7.0 release](https://github.com/electron/electron/releases/tag/v44.7.0)

The local evidence JSON contains source URLs, candidate SHA, actual check conclusions, and remaining blockers. Authentication material and real session contents are not evidence artifacts.
