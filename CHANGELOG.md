# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 待定

导入与备份、KR 进度趋势、应用内提醒，以及更好懂的错误提示（v0.2.0 之后合并的 PR #58–#94）。

### Added

- 导入单个 OKR：历史页「导入…」，导入前提示与已有 OKR 的冲突，导入后带「新导入」标签（#49，PR #66 #67）
- 全部备份与从备份恢复：「⋯」菜单「全部备份…」；导入备份前可预览，重复的 OKR 可逐条或一次性决定（#50，PR #71 #72）
- KR 进度趋势：每条 KR 可查看进度随时间的变化（#53，PR #76 #77）
- 应用内提醒：KR 长时间没更新、季度该复盘时，在主窗口给出提醒，可点「去复盘」直接打开复盘页（#54，PR #84 #86）
- 从主窗口点「去复盘」时，如果便签窗里有没保存的复盘草稿，会先问你要不要放弃（#54，PR #86）

### Changed

- 导入出错时的提示改为大白话，不再出现技术代码；导入的 OKR 超过 10 条 KR 时会说明原因（#69，PR #70 #83）
- 文件不是 JSON、版本不支持时提示改为大白话，并说明「数据没有任何改动。」；备份里没有 OKR 时改为普通提示，不再按错误显示（#85，PR #87）
- 询问是否放弃修改的对话框，默认选中「继续编辑」，按回车不会误丢修改（#85，PR #87）
- 文件太大时的提示不再显示文件的实际大小：「这个文件超过 5 MB，只能导入 5 MB 以内的文件。」（#89，PR #92）
- 备份文件太大时的提示：「这个备份文件超过 50 MB，只能导入 50 MB 以内的备份。」备份上限为 50 MB（#50 #93，PR #80 #94）

### Fixed

- 从主窗口点「去复盘」新开便签窗时，有时停在便签页而不是复盘页；现在会可靠地打开复盘页。若复盘页始终打不开，提醒条会显示「复盘页没能打开，请再试一次」（#88，PR #90）
- 深色模式下主窗口结果区背景和边框过亮（PR #90）
- 正好 5 MB 的文件、正好 50 MB 的备份现在可以导入（#89 #93，PR #92 #94）
- 没有配置 AI 服务时应用也能正常启动（PR #75）
- 进度趋势图只有一个点时，时间标签对齐到点的正下方（#53，PR #80 #81）
- 重新生成时的占位行与原来的 KR 行一样高，不再跳动（#40，PR #59）
- 读屏与键盘：无托盘时「隐藏」按钮不再读出多余说明；锁定的下拉选择不再被空格 / 方向键改动（#39 #42，PR #58）
- 用键盘在面板里移动时，聚焦的项目不再被顶部进度条挡住（#41，PR #62）

### Removed

- 不再使用的旧「重新生成」接口（#48，PR #61）

### Internal

- 「去复盘」时便签窗有未保存的复盘草稿会先询问——补充端到端测试与截图（#54，PR #91）
- 推送版本 tag 时自动构建三平台安装包并附到 Release（#44，PR #73）；打包失败时 CI 会报错（#78，PR #79）
- 一条命令运行本地端到端测试（#55，PR #65）
- 依赖精简（#51，PR #63）
- CHANGELOG 合并重复的 0.2.0 段落（#43，PR #60）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
- Windows 注销 / 关机时不会询问未保存的修改，没保存的内容会丢失（仍然如此，未实测）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名
- 确认对话框里按钮文字不统一（有的写「放弃」，有的写「放弃修改」），尚未修复

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
