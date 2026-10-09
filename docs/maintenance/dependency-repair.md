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
- Atomic backup paths match filenames literally; rapid writes use exclusive copies instead of overwriting a same-millisecond snapshot. Recovery skips corrupt newer backups and selects the newest intact snapshot. Both persisted and expected checksums must match.
- Encrypted session writes propagate disk failure and reject missing encryption configuration. JSON-to-SQLite migration commits records and its marker in one transaction, rolls back partial failures, and leaves unreadable data eligible for retry. A formerly invalid idempotence fixture now verifies an actual imported row.
- Production credential persistence requires OS encryption. Explicit CI/E2E fallback uses a reproducible test key, including the actual `E2E_TEST=1` launcher convention. Credential tests isolate path providers and use only synthetic data. Custom error-template retry keeps its component context.

## Reproduce validation

```sh
pnpm install --frozen-lockfile
pnpm run test:audit
pnpm run test:dependency-security
pnpm run audit:security
pnpm run lint
pnpm run typecheck
pnpm run build:ci
pnpm run test:coverage
# Optional separate production-build E2E verification:
pnpm run rebuild:electron
pnpm run test:e2e:ci
# Restore the host ABI before running Node tests again:
pnpm run rebuild:node
```

The security command writes `audit-report.json` and a JSON summary. All high/critical advisories, inconsistent counts, invalid reports, and command/network failures block the gate. No advisory/title exceptions remain. CI always uses the frozen lock.

The clean lock was resolved from workspace manifests in an isolated directory because pnpm 9's incremental resolver retained an obsolete Vitest optional peer. There are no Vitest or tinypool packages in the repaired lock. Node 24 frozen installation succeeds. Existing local proxy routing was used only on affected download subprocesses; TLS verification and global network settings were preserved.

## Security evidence and remaining upstream boundary

The main baseline `b2e257a65afb79a54bc2696145d79cbba992bc75` and initial PR head `dec82380f39ae2ccb23f33590aa82d9c0fe0ba13` each reproduced **10 critical / 99 high**. Published-version upgrades alone left **0 critical / 1 high / 1 moderate**. The controlled source repair now reports **0 critical / 0 high / 1 moderate**, under the same strict gate.

The unpatched upstream finding is [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), braces <=3.0.3. The published patched-version field is `None`; [upstream issue #70](https://github.com/micromatch/braces/issues/70) has no official fix commit. The active Jest chain is:

```text
jest-environment-jsdom / jest-preset-angular
  Jest fake timers / message utilities
    micromatch 4.0.8
      braces override: file:vendor/braces (@clarityokr/braces 0.0.0)
```

The private MIT source copy is identified explicitly as a local package, not a published upstream fix. [SOURCE.md](../../vendor/braces/SOURCE.md), its JSON manifest, complete patch, original PoC, and normal semantic oracle own its evidence. All six upstream API entry points retain ordinary semantics below fixed depth/AST/result/text/range bounds. Numeric endpoints and steps are checked before allocation or iteration. Independent review on 2026-10-09 confirmed the recorded scope and rechecked the initially discovered unsafe-integer bypass. All **15 installed-package security regressions**, including **732 normal semantic comparisons**, pass; the actual Jest/micromatch chain resolves the guarded code. No advisory is ignored and no upstream version is falsified.

The moderate [sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) also has no published patch. Its active chain is Jest coverage tooling, JS-YAML 3, argparse 1, sprintf-js 1.0.3. The audit threshold is unchanged and this severity is recorded.

## Coverage evidence and remaining test boundary

The previous unit coverage reported `Unknown% (0/0)` because source globs pointed outside its scan roots. CI also printed a coverage-success message without checking a percentage. The repair measures the complete main/renderer source set across unit, component, integration, and real Electron executions, then enforces all four original **80%** thresholds. Missing or empty reports and zero denominators fail. Only tests, declarations, and Jest setup files are excluded; product source remains in scope.

Latest complete pipeline: **514 unit, 176 component, 72 integration** and **23/23 real instrumented Electron tests** pass. The desktop suite uses zero retries and completed in **4.9 minutes**, mapping actual execution to **73 product TypeScript files**. Combined coverage is statements **64.59%**, branches **57.82%**, functions **61.75%**, lines **70.56%**; the 80% gate correctly fails. The earlier measurement was statements **52.04%**, branches **45.79%**, functions **51.00%**, lines **54.86%**. Existing mock-based assertions do not stand in for coverage of their product implementations.

`build:coverage` creates separate `dist-coverage` output for TypeScript main, CommonJS sandboxed preload, and Angular AOT renderer with maps and embedded source contents. It verifies mapped product contents against SHA-256 and records the complete product-source and instrumented-output fingerprints. Instrumentation uses `globalThis` without evaluation through `Function`, preserving script CSP. Real E2E teardown captures main counters and each product window's main-world and isolated-world-999 counters. Temporary focus windows have no product source and are not coverage inputs.

`coverage:remap:e2e` requires a capture from every successful functional test, with no skipped, failed, flaky, or retried tests. It rejects changed source or output hashes, converts real counters through their input source maps, and admits only original product TypeScript paths. A deliberate stale-source recheck rejected old coverage after a product fix. Third-party and bundle paths are not percentages. The final merge retains zero-hit files from the same full Jest source collection. CI collects Jest layers first, then runs the real instrumented Electron suite and the combined gate; required CI Status also requires the final coverage report job to succeed.

| Actual regression                          | Observed failure before repair                                                        | Validation after repair                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Backup ordering, punctuation and integrity | Four failing file-based assertions; a rapid-write retention check also lost a version | Seven new assertions and existing atomic/recovery suites pass                 |
| Encrypted session lifecycle                | Disk failure and absent encryption still resolved as saved                            | Five lifecycle tests plus existing session tests pass with real AES and files |
| Credential storage                         | Production selected disposable fallback; E2E flag `1` was unrecognized                | Five isolated actual implementation tests pass                                |
| Migration atomicity                        | Partial/corrupt import was marked completed                                           | Four transaction/retry tests and corrected existing migration tests pass      |
| Custom error fallback                      | Real template retry click left the component in error state                           | Four renderer error-routing/UI tests pass; six main recovery tests pass       |

Remaining uncovered product behavior still requires real tests before the 80% gate passes. Validation status and candidate hashes belong to the machine-readable repair record, rather than inferred completion from these commands.

## Check status

Lint, typecheck and production build pass. Dependency regressions and strict audit pass. The first pushed runtime repair built successfully on GitHub Linux, macOS, and Windows while the old braces audit still failed. Those results remain evidence for that head, rather than current-head CI success. Fresh local/remote conclusions and final merged coverage are recorded against each candidate in JSON. The remaining required gate is actual full-source 80% coverage. No merge or release is authorized by partial validation.

## Primary sources

- [Angular version compatibility](https://angular.dev/reference/versions)
- [Angular application builder migration](https://angular.dev/tools/cli/build-system-migration)
- [Angular CSP nonce guidance](https://v20.angular.dev/best-practices/security)
- [Electron protocol handling](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron net.fetch forwarding](https://www.electronjs.org/docs/latest/api/net/)
- [node-gyp supported configuration](https://github.com/nodejs/node-gyp)
- [Electron 44.7.0 release](https://github.com/electron/electron/releases/tag/v44.7.0)
- [Istanbul input source-map instrumentation](https://github.com/istanbuljs/istanbuljs/blob/main/packages/istanbul-lib-instrument/api.md)
- [Electron isolated-world execution](https://www.electronjs.org/docs/latest/api/web-contents#contentsexecutejavascriptinisolatedworldworldid-scripts-usergesture)

The local evidence JSON contains source URLs, candidate SHA, actual check conclusions, and remaining blockers. Authentication material and real session contents are not evidence artifacts.
