# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- 将 Angular 从 21 升到 22：框架包 21.2.26 → 22.2.6，`@angular/cli` / `@angular/build` 21.2.30 → 22.2.7；TypeScript 5.9.3 → 6.0.3（Angular 22 要求 ≥6.0 <6.1）。继续通过已有的 `provideZoneChangeDetection()` 保留 ZoneJS 变更检测；官方 `change-detection-eager` 迁移给未声明策略的两个生产组件加上 `ChangeDetectionStrategy.Eager`，以保持 v22 之前的默认检查行为（v22 默认改为 OnPush）。为满足 peer，将 `@ngrx/component-store` 21.1.1 → 22.0.1。未改 Electron / Playwright / prettier / typescript-eslint / Jest，也未使用 pnpm.overrides（[#52](https://github.com/Jackela/ClarityOKR/issues/52) PR3）
- 将 Angular 从 20 LTS 升到 21 LTS：框架包 20.3.34 → 21.2.26，`@angular/cli` / `@angular/build` 20.3.42 → 21.2.30；通过 `provideZoneChangeDetection()` 保留现有 ZoneJS 变更检测。为满足 peer，将 `@ngrx/component-store` 20.1.0 → 21.1.1，将 `jest-preset-angular` 升到 17.0.3，并把工作区 Jest 升到 30（jsdom 26）。未改 Electron / Playwright / prettier / typescript-eslint，也未使用 pnpm.overrides（[#52](https://github.com/Jackela/ClarityOKR/issues/52) PR2）
- 仅测试：复盘保存挂起的 E2E 改走测试模式钩子 `__clarityokrE2E.armReviewSaveHold`，不再替换 Electron 内部 `_invokeHandlers`（[#57](https://github.com/Jackela/ClarityOKR/issues/57)）
- 删除旧的整份 OKR 重新生成路径：去掉 `OkrRegenerationService` 的 regenerate 方法、`StickyWindowManager` 的对应方法，以及已无生产调用方的请求 schema；视图模型与持久化映射不再读写该字段。现有库或导入文档里若仍带有该字段，`okrDocumentSchema`（zod object 默认 strip）会丢弃未知键并继续解析，不会失败（[#64](https://github.com/Jackela/ClarityOKR/issues/64)）

- 仅开发与构建：去掉 `qs` 的 pnpm override；锁文件仍解析到 6.16.1（≥ 6.16.1 / GHSA-6pq8-jhm2-2vcw）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)，[#114](https://github.com/Jackela/ClarityOKR/issues/114)）
- 仅开发与构建：去掉 `js-yaml@3`、`js-yaml@4` 和 `@istanbuljs/load-nyc-config>js-yaml` 的 pnpm override；锁文件仍解析到 js-yaml 4.3.2（≥ 3.15.2 / ≥ 4.3.2 / GHSA-2883-xcg3-v3hh）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）
- 仅开发与构建：因 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 已于 2026-10-23 撤回，去掉原先 must-keep 的 `braces` vendor patch（`file:vendor/braces`）与 pnpm override；锁文件改回上游 braces 3.0.3（仍覆盖 [GHSA-grv7-fg5c-xmjg](https://github.com/advisories/GHSA-grv7-fg5c-xmjg)）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)，[#128](https://github.com/Jackela/ClarityOKR/issues/128)）

## [0.3.3] - 2026-11-13

### Fixed

- 导入对话框「版本不支持」正文与 #85 定稿对齐：「最新版」改为「当前版本的」；读不出版本号时改为「这个文件的版本无法识别」（[#112](https://github.com/Jackela/ClarityOKR/issues/112)）
- 澄清向导进度计数：答第 k 题时显示「问题 k / …」，不再多算 1；进度条按已回答题数占比；「可以生成」屏不渲染题号行、进度条满格绿色上移到题号位置（[#123](https://github.com/Jackela/ClarityOKR/issues/123)）
- 坏掉的向导草稿回退只记一条 `wizard-draft-fallback`：显示恢复条、点「恢复」、再启动都不再重复写（[#124](https://github.com/Jackela/ClarityOKR/issues/124)）

### Internal

- 仅开发与构建：在 `@angular/cli` / `@angular/build` 20.3.42 之后，去掉 `@modelcontextprotocol/sdk`、`vite@7`、`zod@4` 的 pnpm override；锁文件仍解析到 SDK 1.32.1、vite 7.3.7，应用内 zod 仍为 4.6.7（CLI 副本 4.6.6 ≥ 4.6.6）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）
- 仅开发与构建：`@angular/cli` / `@angular/build`（及随之的 devkit / schematics）20.3.39 → 20.3.42；框架包仍为 20.3.34，overrides 未改（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）
- 仅开发与构建：锁文件将 `@hono/node-server` 从 2.1.4 升到 2.1.8，修复 GHSA-qv5m-9pm6-hqp3 / GHSA-jpvv-r467-5p4w；不打包进安装包（[#132](https://github.com/Jackela/ClarityOKR/issues/132)）
- 仅开发与构建：去掉 `undici@6` / `undici@7` 的 pnpm override；锁文件仍解析到 ≥ 6.29.1 / ≥ 7.30.1，审计保持干净（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）
- 仅开发与构建：去掉 `tar` / `handlebars` 的 pnpm override；锁文件仍解析到 ≥ 7.5.21 / ≥ 4.7.10，审计无新增 findings（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名

## [0.3.2] - 2026-11-06

### Fixed

- Windows 注销 / 关机时，向导、文字编辑和复盘里没保存的内容会写成草稿，不会直接丢掉（[#110](https://github.com/Jackela/ClarityOKR/issues/110)）
- 下次启动时，有草稿的窗口会显示「恢复 / 放弃」条，可把上次没保存的内容恢复回来（[#115](https://github.com/Jackela/ClarityOKR/pull/115)）
- 只改了目标文字、或新加了关键结果时，注销或关机后也能在下次启动时恢复（[#117](https://github.com/Jackela/ClarityOKR/issues/117)）
- 注销或关机后，新建 OKR 向导会恢复到离开时的那一步，已经回答的澄清问题原样保留，不会重新调用模型（[#116](https://github.com/Jackela/ClarityOKR/issues/116)）

### Internal

- 仅 CI：GitHub Actions 升到 Node 24 运行时，Linux runner 固定为 ubuntu-24.04，对已安装的应用没有影响（[#111](https://github.com/Jackela/ClarityOKR/issues/111)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名

## [0.3.1] - 2026-10-28

### Security

- Electron 升到 44.9.3，修复 eMudhra 中间证书问题：被泄露的 eMudhra 中间证书签发的证书不再被信任，连接 AI 服务时不会被冒充（#102）
- zod 升到 4.6.7，修复超长输入导致内存耗尽：收到异常大的数据时应用不会因内存耗尽而崩溃（#102）

### Changed

- 单独的放弃按钮统一叫「放弃修改」：放弃未保存的文字修改时的确认按钮由「放弃」改为「放弃修改」，与复盘离开确认、进度保存失败行一致；「放弃并退出」「放弃并重启」不变（#104）
- 备份文件太大时的提示改短：「这个备份超过 50 MB 的上限，无法导入。」（#104）
- 文件太大时的提示改短：「这个文件超过 5 MB 的上限，无法导入。」（#105）

### Internal

- 仅开发与构建工具：fast-uri 升到 3.1.9、ip-address 升到 10.7.5（Dependabot 公告 #262–#266）；两者不打包进安装包，对已安装的应用没有影响（#106）
- 移除 4 个不再需要的 pnpm override：node-forge、shell-quote、piscina@4、body-parser@2，依赖版本没有变化（#109）
- qs 通过 pnpm override 固定到 ^6.16.1，修复 GHSA-6pq8-jhm2-2vcw；qs 只经 @angular/cli 引入，仅用于开发，不打包进安装包。另有一条 low 级别的 deepmerge 公告目前没有修复版本，在 #107 跟踪（#113）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
- Windows 注销 / 关机时不会询问未保存的修改，没保存的内容会丢失（仍然如此，未实测）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名

## [0.3.0] - 2026-10-21

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

[unreleased]: https://github.com/Jackela/ClarityOKR/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/Jackela/ClarityOKR/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Jackela/ClarityOKR/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Jackela/ClarityOKR/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Jackela/ClarityOKR/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Jackela/ClarityOKR/releases/tag/v0.2.0
