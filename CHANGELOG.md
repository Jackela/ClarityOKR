# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- 不再使用的旧重新生成通道 `clarityokr:okr:regenerate`（overwrite / append）及其主进程处理、渲染端 `OkrStickyService.regenerate()`（#48）

## [0.2.0] - 2026-10-15

闭环 OKR：从「生成」扩展到「执行 → 记录进度 → 复盘 → 找回 / 导出 → 重新生成」（PR #28–#36）。数据层重做，旧库不迁移。标「[维护]」的条目是 0.1.0 之后的仓库维护与零散修复，与闭环功能无关。

### Added

- 闭环数据模型 schema v1（#28）：`objectives` / `key_results` / 只追加的 `progress_entries` / 复盘表；`PRAGMA user_version` 版本化迁移；季度周期、四种 KR 状态、0–100 进度；文字上限按字形簇计数（目标 / KR / 度量 200，复盘每段 2000）
- 闭环 IPC 通道（#30）：列表、打开、置顶、季度、写进度 / 撤回 / 修改这次、复盘读写、导出（Markdown + JSON `schemaVersion: 1`）与「在文件夹中显示」，全部白名单 + 主进程校验 + 统一 `IpcResult`
- 便签窗页签外壳（#31）：「便签 / 复盘 / 历史」，进度行内编辑、状态菜单、撤回 / 修改这次、整体进度、季度选择、唯一置顶、历史列表与搜索、已移除 KR 区
- 复盘页签与文字编辑（#32）：复盘快照、三段文字、离开确认；文字编辑模式（撤销 / 重做、度量编辑、字数计数）；添加 KR（最多 10 条）；通用确认对话框与 Toast
- 导出（#33）：顶栏「导出 ▾」菜单、导出结果 Toast（复制路径、在文件夹中显示、错误分类）、「复制为 Markdown」
- 存储与重启提示（#34）：旧库一次性通知、数据无法保存提示（临时库 / 内存库常驻条）、重启两步确认、新建 OKR 确认、未保存状态上报
- 发布闸门（#35）：系统托盘、单实例（再次启动唤回便签）、「隐藏」按钮与「窗口始终在最前」、应用菜单「显示便签」（Ctrl/⌘+Shift+K）、退出确认（菜单 / 托盘 / ⌘Q 同一规则，合并两个窗口的未保存状态）、关闭窗口改为隐藏
- 重新生成（#36）：「重新生成 ▾」菜单（选中的 / 全部）、选择模式、确认对话框、生成中进度与骨架、结果提示条（含「查看已移除」）、失败提示条与重试、「新增」标签；新 IPC `clarityokr:okr:regenerate-krs`
- 无托盘时（Windows / Linux）隐藏或关闭最后一个可见窗口即退出，提示文字与无障碍名称同步说明（#36）
- [维护] MIT License
- [维护] GitHub issue and PR templates
- [维护] Branch protection rules for `main`
- [维护] Code of Conduct

### Changed

- 持久化改用规范化 `OkrStore`，数据库位于 Electron `userData`；重新生成按 KR id 匹配，保留进度与状态，未命中的旧 KR 标记为已移除（#29）
- 退出 / 重启确认的回答绑定 `requestId`，过期回答被拒；未保存上报只对暂时性错误重试，最多 5 次（#36）
- 文字校验与主进程共用同一套字形簇计数（#32）
- [维护] CI workflow: opt-in to Node.js 24 for GitHub Actions ahead of deprecation
- [维护] Coverage report job: fixed artifact paths and threshold checking

### Fixed

- [维护] Session ID consistency in AppComponent (single session ID across operations)
- [维护] Hardcoded Chinese text replaced with English in okr-sticky service
- [维护] Removed no-op `finalize()` operators from LLM gateway services
- [维护] Draft handler now uses actual `selectedOptionId` instead of `'unknown'`
- [维护] Wizard progress total dynamically adjusts based on session length
- [维护] Removed unused `IpcLlmGateway` dependency from AppComponent

### Removed

- 旧 `okr_documents` 存储模型与 overwrite / append 两种重新生成按钮；KR 的 `owner` 字段（#29、#32、#36）
- [维护] Deprecated `DatabaseService` (221 lines) and migrated all repositories to `ConnectionManager`
- [维护] Mock LLM gateway from production source (486 lines, tests use `__mocks__/` version)
- [维护] Test-mode from production builds via dynamic import (~680 lines excluded)

### Breaking

- 旧版数据库不迁移：首次启动时被改名备份到 `backups/*.db.bak`，并显示一次性通知

### Known limitations

- 托盘、macOS Dock、⌘Q、Windows 注销 / 关机行为尚未在真机上测试
- Windows 注销 / 关机时不弹未保存确认，未保存的编辑会丢失
- Windows / Linux 没有托盘图标时，关闭最后一个窗口会直接退出应用

## 0.1.0 - 2025-04-24

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

[unreleased]: https://github.com/Jackela/ClarityOKR/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Jackela/ClarityOKR/releases/tag/v0.2.0
