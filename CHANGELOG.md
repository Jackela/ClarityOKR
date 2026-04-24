# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- MIT License
- GitHub issue and PR templates
- Branch protection rules for `main`
- Code of Conduct

### Changed
- CI workflow: opt-in to Node.js 24 for GitHub Actions ahead of deprecation
- Coverage report job: fixed artifact paths and threshold checking

### Fixed
- Session ID consistency in AppComponent (single session ID across operations)
- Hardcoded Chinese text replaced with English in okr-sticky service
- Removed no-op `finalize()` operators from LLM gateway services
- Draft handler now uses actual `selectedOptionId` instead of `'unknown'`
- Wizard progress total dynamically adjusts based on session length
- Removed unused `IpcLlmGateway` dependency from AppComponent

### Removed
- Deprecated `DatabaseService` (221 lines) and migrated all repositories to `ConnectionManager`
- Mock LLM gateway from production source (486 lines, tests use `__mocks__/` version)
- Test-mode from production builds via dynamic import (~680 lines excluded)

## [0.1.0] - 2025-04-24

### Added
- Initial release of ClarityOKR desktop assistant
- Electron + Angular stack with strict TypeScript (ESM-only)
- Clarification wizard with state machine for OKR generation
- Sticky note window for OKR visualization
- SQLite persistence layer with migration support
- LLM integration with circuit breaker and caching
- Secure IPC communication via contextBridge
- Comprehensive test suite (unit, component, integration, E2E)
- CI/CD pipeline with multi-platform builds

[unreleased]: https://github.com/Jackela/ClarityOKR/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Jackela/ClarityOKR/releases/tag/v0.1.0