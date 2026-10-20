# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-10-20

导入 / 备份、KR 进度趋势、应用内提醒，以及一批大白话错误提示与可访问性修复（v0.2.0 之后合并的 PR #58–#94）。标「[维护]」的条目是仓库维护，与产品功能无关。

> **未实测**：托盘、Dock、⌘Q 相关行为（托盘菜单「显示便签 / 退出」、macOS Dock 唤回、⌘Q 退出确认、无托盘时隐藏最后一个窗口即退出）本版本仅有自动化测试覆盖，**未在真机上手动验证**，标记为「未实测」。

### Added

- 导入单个 OKR（JSON）（#49，PR #65 #66 #67）：主进程校验、冲突检测、一次性令牌、事务写入；历史页「导入…」入口、冲突 / 确认 / 错误对话框、「新导入」标签
- 全部备份与备份导入（#50，PR #71 #72 #80）：「⋯」菜单「全部备份…」、主进程全量备份导出、备份导入预览（重复项逐条 / 批量处理）；备份文件上限 50 MB
- KR 进度趋势面板（#53，PR #76 #77 #80 #81）：进度历史通道与有效记录纯函数、趋势面板、单点时间标签居中
- 应用内提醒（#84，PR #84 #86）：KR 长期未更新、季度复盘提醒；主窗口结果面板中的提醒条与「去复盘」
- 「去复盘」只在新便签窗准备好后送达；5 秒未就绪静默重试一次，仍失败时在提醒条显示「复盘页没能打开，请再试一次」（#88，PR #90）
- 从主窗口「去复盘」时，便签窗有未保存的复盘草稿会先确认再离开（#54 P1，PR #91）
- [维护] 推送 `v*` tag 构建三平台安装包并附到 Release（#44，PR #73）
- [维护] 一条命令跑本地 e2e：系统分配 mock 端口、自动构建与原生模块 ABI 切换（#55，PR #65）

### Changed

- 导入校验错误改为大白话（结构化错误码 + 统一文案文件）（#69，PR #83）；超过 10 条 KR 时用大白话拒绝，新导入 / 对话框会关闭旧 Toast（PR #70）
- 导入文件错误（不是 JSON、版本不支持、空备份）改为大白话，错误对话框注明「数据没有任何改动。」；空备份改为信息对话框（#85，PR #87）
- 确认对话框默认焦点落在安全按钮（如「继续编辑」）并显示焦点环，回车不会误丢修改（#85，PR #87）
- 导入大小上限统一为一个常量（5 MB），超限文案不再显示文件实际大小：「这个文件超过 5 MB，只能导入 5 MB 以内的文件。」（#89，PR #92）
- 备份大小上限统一为 `BACKUP_MAX_MB`（50 MB），文案：「这个备份文件超过 50 MB，只能导入 50 MB 以内的备份。」（#93，PR #94）
- [维护] `load-nyc-config` 改用 js-yaml 4，移除 argparse 1 / sprintf-js（#51，PR #63）

### Fixed

- 启动时不再要求 `LLM_API_KEY`，LLM 配置在使用时读取（PR #75）
- 重新生成骨架保持 KR 行尺寸：单条分隔线、高度一致（#40，PR #59）
- 无托盘时「隐藏」按钮去掉 `aria-describedby`；锁定的弹出选择框吞掉空格 / 方向键（#39 #42，PR #58）
- 面板 `scroll-padding-top` 为进度条与焦点环留出空间（#41，PR #62）
- 深色模式下主窗口结果面板使用深色变量（PR #90）
- 正好 5 MB / 50 MB 的文件可以导入，多 1 字节才提示超限（#89 #93，PR #92 #94）
- [维护] Electron 打包失败时 CI 任务失败（#78，PR #79）

### Removed

- 不再使用的旧重新生成通道 `clarityokr:okr:regenerate`（overwrite / append）及其主进程处理、渲染端 `OkrStickyService.regenerate()`（#48，PR #61）
- [维护] 合并 CHANGELOG 中重复的 0.2.0 段落（#43，PR #60）

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

[unreleased]: https://github.com/Jackela/ClarityOKR/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Jackela/ClarityOKR/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Jackela/ClarityOKR/releases/tag/v0.2.0
