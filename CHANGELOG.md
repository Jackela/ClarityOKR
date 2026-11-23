# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- 将主进程依赖 `dotenv` 从 16.6.1 升到 18.0.10。17 / 18 的变化（默认打印注入日志、日志改到 stderr、移除 `.env.vault` 与 preload、新增 CLI）都只在调用 `config()` / `dotenv/config` 时生效；本仓库源码、脚本与构建配置均未加载 dotenv，打包后的主进程不引用它，应用行为不变（[#192](https://github.com/Jackela/ClarityOKR/pull/192)）
- 将主进程依赖 `opossum` 从 9.0.0 升到 10.0.0。10.0 唯一的破坏性变更是不再支持 Node 20（`engines` 为 `^26 || ^24 || ^22`）；应用运行在 Electron 45 内置的 Node.js 24.22.3，CI 用 Node 24。npm 包内 `index.js` 与 `lib/` 和 9.0.0 逐字相同，只改了 `engines` 与开发依赖；`LlmCircuitBreaker` 用到的构造参数（`timeout` / `resetTimeout` / `errorThresholdPercentage` / `rollingCountTimeout` / `rollingCountBuckets` / `name`）、事件（`open` / `halfOpen` / `close` / `fallback`）与 `fire` / `open` / `close` / `fallback` / `stats` 均未改动，行为不变（[#191](https://github.com/Jackela/ClarityOKR/pull/191)）
- 将主进程开发依赖 `@types/better-sqlite3` 从 7.6.13 升到 9.6.0。DefinitelyTyped 仅调整了版本号与最低 TypeScript（5.1 → 5.6），`index.d.ts` 与 7.6.13 逐字相同；better-sqlite3 13 不自带类型，仍用这份声明，类型检查通过。仅类型，无运行时改动（[#190](https://github.com/Jackela/ClarityOKR/pull/190)）
- 仅 E2E：主窗客户区固定为 **1200×771**，主窗设计截图（`shot()`，`IMPL_SHOTS_DIR`；以及 CI 每次上传的 S3§12 截图 `S3_12_SHOTS_DIR`）因此尺寸与排版稳定。主窗是带框的 1200×800 外框窗口，Linux 下标题栏由 Chromium 按 GTK 标题字体绘制，CI 上有时 29px、有时 27px，客户区于是在 1200×771 与 1200×773 之间跳动，根组件 `min-height: 100vh` 跟着变，底部操作栏下移 2px、居中对话框和滚动后的画面偏 1–2px。现在每次启动后（fixtures、`launchElectronApp`、两个 spec 里的重启）用 `setContentSize(1200, 771)` 设定客户区并等待 `innerWidth/innerHeight` 生效；截图时断言客户区与 PNG 都是 1200×771，否则用例失败。无框便签截图照旧按窗口实际尺寸。生产代码与应用自身的窗口尺寸不变（[#146](https://github.com/Jackela/ClarityOKR/issues/146)）

## [0.3.7] - 2026-11-21

### Changed

- 随安装包提供的 Electron 从 44.11.4 升到 **45.4.1**（Chromium 152 → 156.0.8078.100，V8 15.2 → 15.6，内置 Node.js 24.22.3 不变）。应用功能与界面不变；44 张设计截图对比无回归（[#186](https://github.com/Jackela/ClarityOKR/pull/186)，[#154](https://github.com/Jackela/ClarityOKR/issues/154)）

### Internal

- 将 Electron 从 44.11.4 升到 45.4.1（主版本；Chromium 152 → 156.0.8078.100，V8 15.2 → 15.6，内置 Node.js 24.22.3 不变，NODE_MODULE_VERSION 149 → 150）。对照 45.0 Breaking Changes：两个窗口均为 `sandbox: true`，打包后的 `preload.cjs` 只 `require("electron")`，没有 `Buffer` / `setImmediate` / `clearImmediate` / `events` / `timers` / `url`；不用 `window.open`、`contentTracing`、桌面捕获、扩展、`setLoginItemSettings`；asar 内无 `fs.open` 写入。同步 `safeStorage` 在 45 弃用（46 删除），主路径已在 [#185](https://github.com/Jackela/ClarityOKR/pull/185) 迁到 async，仅 async 解密失败时的兼容回退仍调用同步解密，45 下只会有弃用警告。better-sqlite3 13（N-API）在 45 上从源码编译、无需代码改动。README 版本徽章与 Dependabot 注释同步更新（[#154](https://github.com/Jackela/ClarityOKR/issues/154)）
- 仅 E2E：测试模式钩子 `__clarityokrE2E.openSticky` 先 `setImmediate` 让出一次事件循环再读库。Playwright 的 `electronApp.evaluate` 经 Node inspector 下发，V8 可在主进程其他 JS 的中断点上执行它；better-sqlite3 13 起行对象由 JS row factory 在语句仍在执行时构造，于是该钩子可能在另一条查询中途重入并抛出「This database connection is busy executing a query」（`draft-restore.spec.ts` 的 session-end 用例在 main 上本地 3/8 失败，加此修复后 12/12 通过）。生产路径不经过 inspector，不受影响
- 将渲染进程测试用的 `jsdom` 从 26.1.0 升到 31.0.1（[#175](https://github.com/Jackela/ClarityOKR/pull/175)）
- 将 Electron `safeStorage` 的同步 API（`isEncryptionAvailable` / `encryptString` / `decryptString`，9 处调用）迁到 Electron 44 已提供的异步 API（`isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`）。官方说明旧同步密文可用 async 解密；若 async 解密失败则回退到仍可用的同步解密（覆盖 KDE/KWallet 上已知的密钥条目不一致问题），并仅在 async 重新加密成功后才替换磁盘上的密文，失败时保留原密文（[#154](https://github.com/Jackela/ClarityOKR/issues/154)）
- 将测试包里的 `cross-env` 从 7.0.3 升到 10.1.0（unit / integration / performance 用于设置 `NODE_OPTIONS`）（[#174](https://github.com/Jackela/ClarityOKR/pull/174)）
- 将 better-sqlite3 从 12.11.1 升到 13.2.0（改为 node-addon-api / N-API；包内不再走 prebuild-install，需在各平台从源码编译）。应用只用 constructor、pragma、exec、prepare、transaction、close，未调用 unsafeMode（13.2.0 起对已关闭连接调用会抛错）。补了用 12.11.1 经 ConnectionManager / OkrStore 真实 schema 路径生成的库文件在 13 下打开、读取旧行、写入再重开仍能读到的集成测试（[#180](https://github.com/Jackela/ClarityOKR/pull/180)，取代 [#159](https://github.com/Jackela/ClarityOKR/pull/159)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
  - Electron 45 安装包：Linux AppImage 已在 Xvfb 下启动冒烟（主窗口加载、数据库建立）；Windows / macOS 安装后首次启动未实测（跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名


## [0.3.6] - 2026-11-21

### Security

- 将随安装包提供的 Electron 从 44.11.3 升到 44.11.4。Chromium 152.0.7977.169 与 V8 15.2.124.45 未变；内置 Node.js 从 24.22.2 升到 24.22.3，带上 2026-11-11 Node.js 安全发布中的补丁（High：CVE-2026-123863、CVE-2026-123864、CVE-2026-123865、CVE-2026-123866、CVE-2026-123872、CVE-2026-123874、CVE-2026-126051；另有 Medium/Low 项，见 [Node.js 24.22.3](https://nodejs.org/en/blog/release/v24.22.3)）（[#179](https://github.com/Jackela/ClarityOKR/pull/179)）

### Internal

- 修正 Release dry run 在旧 tag 上跳过 Windows 工具链时，日志与 Job Summary 中「旧 tag，已跳过 Windows 工具链脚本」的编码：缺脚本时改由 bash 步骤写出该句（UTF-8）；脚本存在时仍用原来的 PowerShell 步骤调用 `setup-windows-native-build.ps1`，不改变脚本内检查（[#184](https://github.com/Jackela/ClarityOKR/pull/184)）
- Release 工作流的 Windows 工具链步骤：仅在 `workflow_dispatch` 且 `upload=false`（dry run）、同时检出树没有 `scripts/setup-windows-native-build.ps1` 时跳过，并在日志与 Job Summary 写入「旧 tag，已跳过 Windows 工具链脚本」；正式发版（tag 推送，或 `upload` 为 true / 未提供）缺少该脚本则失败。未改脚本内的 vswhere 等检查（[#182](https://github.com/Jackela/ClarityOKR/pull/182)）
- 将 `istanbul-lib-source-maps` 从 4.0.1 升到 5.0.6（覆盖率收集用的 source map 库；行为应与 4.x 一致）（[#173](https://github.com/Jackela/ClarityOKR/pull/173)）
- Windows CI 与 Release 在安装依赖前改用 node-gyp ≥12.1.0（不再强制 msvs_version=2022），以便在 windows-latest 的 Visual Studio 2026（v18）上从源码编译原生模块；pnpm 9 自带的 10.3.1 无法识别该版本（为 better-sqlite3 13 / Electron 45 做准备）（[#154](https://github.com/Jackela/ClarityOKR/issues/154)、[#159](https://github.com/Jackela/ClarityOKR/pull/159)）
- Dependabot 忽略 `@types/node` 的 semver-major（运行时为 Node 24：CI 与 release 的 `NODE_VERSION` 为 24、`.nvmrc` 为 24.19.0、Electron 44.11.3 内置 Node 24.22.2；类型定义主版本需与运行时对齐，因此关闭将 24.19.1 升到 26.6.6 的 [#172](https://github.com/Jackela/ClarityOKR/pull/172)；minor 与 patch 仍会开 PR）
- Dependabot 忽略 nock 的 semver-major（integration 在 nock 15 上 jest SIGSEGV，推迟；minor 与 patch 仍会开 PR）（[#170](https://github.com/Jackela/ClarityOKR/issues/170)）
- 仅测试：`reminders.spec.ts` 对「去复盘」交接次数的计数改走测试模式钩子 `__clarityokrE2E.resetTakeReviewCount` / `getTakeReviewCount`，不再替换 Electron 内部 `_invokeHandlers`（[#144](https://github.com/Jackela/ClarityOKR/issues/144)）
- 将 `eslint-config-prettier` 从 9.1.2 升到 10.1.8。`eslint --print-config`（生产 `main.ts`、secure-storage 生产文件、renderer 组件、单测 spec）只新增 180 条 `@stylistic/*` 规则且全部为 off/0，既有规则与其他配置项无差异（[#160](https://github.com/Jackela/ClarityOKR/pull/160)）
- 开发依赖组升级：`@playwright/test` 1.64.1 → 1.65.0，`@typescript-eslint/eslint-plugin` / `parser` 8.71.2 → 8.72.2，`electron-builder` 26.15.3 → 26.18.0，prettier 3.9.10 → 3.10.1，rimraf 6.1.3 → 6.1.4，esbuild 0.28.1 → 0.28.2，`baseline-browser-mapping` 2.11.28 → 2.11.37。minimatch 告警（GHSA-g3hv-75wg-m249，Dependabot #270）未解除：`@typescript-eslint/typescript-estree`、`app-builder-lib`、`test-exclude`、`glob` 仍解析到 minimatch 10.2.6 / 9.0.9（见 [#130](https://github.com/Jackela/ClarityOKR/issues/130)）（[#158](https://github.com/Jackela/ClarityOKR/pull/158)）
- 将 `zone.js` 从 0.15.1 升到 0.16.3（production-dependencies 组，含事件监听与 `__proto__` 键加固等修复）（[#157](https://github.com/Jackela/ClarityOKR/pull/157)）
- 拆分澄清状态机：把 reducer、effects、selectors 抽到独立文件，拆后每个文件 ≤ 400 行；行为与公开 API 不变，原模块路径继续导出（[#47](https://github.com/Jackela/ClarityOKR/issues/47)）
- 拆分便签组件：模板移到 `.html`，把重新生成区（菜单 / 提示条 / 选择底栏）和已移除区抽成子组件，拆后每个文件 ≤ 400 行；DOM 结构、class、test id 与样式封装保持不变（[#47](https://github.com/Jackela/ClarityOKR/issues/47)）
- 生产代码将 `@typescript-eslint/no-non-null-assertion` 升为 `error`，并用局部绑定替换 `KrRegenerationService` 中仅有的一处 `!`；清掉该规则与 `@typescript-eslint/no-unused-vars` 的既有 warning。测试目录（`tests/**`、`*.spec.ts`、`*.test.ts`）对该断言规则关闭；`no-unused-vars` 增加与已有 `argsIgnorePattern` 配套的 `varsIgnorePattern: '^_'`（[#46](https://github.com/Jackela/ClarityOKR/issues/46)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名


## [0.3.5] - 2026-11-16

### Security

- 本版本将随安装包提供的 Electron 升到 44.11.3（44.9.3 → 44.11.3，当前 44.x 最新补丁），带上该系列的 Chromium 与 Node.js 安全补丁（[#52](https://github.com/Jackela/ClarityOKR/issues/52)）

### Internal

- 增加 Dependabot version updates 配置（`.github/dependabot.yml`）：每周检查 npm（pnpm 工作区）和 GitHub Actions；生产/开发依赖的 minor 与 patch 分组开 PR，major 单独开 PR；`open-pull-requests-limit` 为 5；忽略 Electron 主版本（45 见 [#154](https://github.com/Jackela/ClarityOKR/issues/154)）。#114 的 qs 安全更新失败是传递依赖无法升到修复版本，不由本 version-updates 配置触发；当前锁文件已无 qs。未改仓库的 Dependabot 安全更新设置（[#52](https://github.com/Jackela/ClarityOKR/issues/52)、[#114](https://github.com/Jackela/ClarityOKR/issues/114)）
- 将 Electron 从 44.9.3 升到 44.11.3（npm 上当前 44.x 的最新补丁）。未改 Electron 45（跟踪见 [#154](https://github.com/Jackela/ClarityOKR/issues/154)）（[#52](https://github.com/Jackela/ClarityOKR/issues/52)）
- 以 main `b5a6567` 的合并覆盖率为基线（语句 92.36%、分支 86.13%、函数 92.18%、行 93.62%），将覆盖率门槛改为向下取整且不低于 80%：语句 92%、分支 86%、函数 92%、行 93%。Coverage Report 在 Job Summary 里写出当前值、门槛和差值；低于门槛时该任务失败。目录级门槛见 [#151](https://github.com/Jackela/ClarityOKR/issues/151)（[#56](https://github.com/Jackela/ClarityOKR/issues/56)）
- 将 Playwright、typescript-eslint、prettier、ts-jest 升到当前次版本的最新补丁：`@playwright/test` / `playwright` / `playwright-core` 1.64.0 → 1.64.1，`@typescript-eslint/eslint-plugin` 与 `parser`（及其同版本套件）8.71.1 → 8.71.2，prettier 3.9.9 → 3.9.10，ts-jest 29.4.14 → 29.4.15。Electron 保持 44.9.3（已是 44.9 的最新补丁）。`@types/get-port` 已在 [#65](https://github.com/Jackela/ClarityOKR/pull/65) 随 `get-port` 一并移除，本分支再次确认锁文件与依赖树中均不存在（[#52](https://github.com/Jackela/ClarityOKR/issues/52) PR1）
- N38：500 个 OKR 导出测得 3.41 MB（3,576,701 字节）；往返导入后数据一致（[#82](https://github.com/Jackela/ClarityOKR/issues/82)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名

## [0.3.4] - 2026-11-14

### Internal

- 将 Angular 从 21 升到 22：框架包 21.2.26 → 22.2.6，`@angular/cli` / `@angular/build` 21.2.30 → 22.2.7；TypeScript 5.9.3 → 6.0.3（Angular 22 要求 ≥6.0 <6.1）。继续通过已有的 `provideZoneChangeDetection()` 保留 ZoneJS 变更检测。v22 将未声明策略的组件默认改为 `OnPush`；官方 `change-detection-eager` 迁移给 `AppComponent` 和 `ErrorBoundaryComponent`（仅有的两个未声明策略的生产组件）加上 `ChangeDetectionStrategy.Eager`，其余 35 个生产组件本来就是 `OnPush`，测试夹具里的 host 组件也显式钉了 Eager，以保持 v22 之前的默认检查行为。为满足 peer，将 `@ngrx/component-store` 21.1.1 → 22.0.1。未改 Electron / Playwright / prettier / typescript-eslint / Jest，也未使用 pnpm.overrides（[#52](https://github.com/Jackela/ClarityOKR/issues/52) PR3）
- 将 Angular 从 20 LTS 升到 21 LTS：框架包 20.3.34 → 21.2.26，`@angular/cli` / `@angular/build` 20.3.42 → 21.2.30；通过 `provideZoneChangeDetection()` 保留现有 ZoneJS 变更检测。为满足 peer，将 `@ngrx/component-store` 20.1.0 → 21.1.1，将 `jest-preset-angular` 升到 17.0.3，并把工作区 Jest 升到 30（jsdom 26）。未改 Electron / Playwright / prettier / typescript-eslint，也未使用 pnpm.overrides（[#52](https://github.com/Jackela/ClarityOKR/issues/52) PR2）
- 仅测试：复盘保存挂起的 E2E 改走测试模式钩子 `__clarityokrE2E.armReviewSaveHold`，不再替换 Electron 内部 `_invokeHandlers`（[#57](https://github.com/Jackela/ClarityOKR/issues/57)）
- 删除旧的整份 OKR 重新生成路径：去掉 `OkrRegenerationService` 的 regenerate 方法、`StickyWindowManager` 的对应方法，以及已无生产调用方的请求 schema；视图模型与持久化映射不再读写该字段。现有库或导入文档里若仍带有该字段，`okrDocumentSchema`（zod object 默认 strip）会丢弃未知键并继续解析，不会失败（[#64](https://github.com/Jackela/ClarityOKR/issues/64)）

- 仅开发与构建：去掉 `qs` 的 pnpm override；锁文件仍解析到 6.16.1（≥ 6.16.1 / GHSA-6pq8-jhm2-2vcw）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)，[#114](https://github.com/Jackela/ClarityOKR/issues/114)）
- 仅开发与构建：去掉 `js-yaml@3`、`js-yaml@4` 和 `@istanbuljs/load-nyc-config>js-yaml` 的 pnpm override；锁文件仍解析到 js-yaml 4.3.2（≥ 3.15.2 / ≥ 4.3.2 / GHSA-2883-xcg3-v3hh）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)）
- 仅开发与构建：因 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 已于 2026-10-23 撤回，去掉原先 must-keep 的 `braces` vendor patch（`file:vendor/braces`）与 pnpm override；锁文件改回上游 braces 3.0.3（仍覆盖 [GHSA-grv7-fg5c-xmjg](https://github.com/advisories/GHSA-grv7-fg5c-xmjg)）（[#107](https://github.com/Jackela/ClarityOKR/issues/107)，[#128](https://github.com/Jackela/ClarityOKR/issues/128)）

### Known issues

- 「未实测」：以下行为只有自动化测试，尚未在真机上手动验证
  - 系统托盘（菜单「显示便签 / 退出」、点击唤回）：macOS、Windows、Linux 均未实测
  - Dock 唤回便签：macOS 未实测
  - ⌘Q 退出确认（含未保存修改的合并提示）：macOS 未实测
  - Windows 注销 / 关机时保存草稿并在下次启动提供恢复（#110，跟踪 #45）
- Windows / Linux 上无法创建托盘图标时，关闭或隐藏最后一个可见窗口会直接退出应用（按钮提示里有说明）
- macOS 安装包未签名

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

[unreleased]: https://github.com/Jackela/ClarityOKR/compare/v0.3.7...HEAD
[0.3.7]: https://github.com/Jackela/ClarityOKR/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/Jackela/ClarityOKR/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/Jackela/ClarityOKR/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/Jackela/ClarityOKR/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/Jackela/ClarityOKR/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Jackela/ClarityOKR/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Jackela/ClarityOKR/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Jackela/ClarityOKR/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Jackela/ClarityOKR/releases/tag/v0.2.0
