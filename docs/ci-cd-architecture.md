# ClarityOKR CI/CD 架构文档

本文档描述 ClarityOKR 的持续集成和持续部署架构。

## CI/CD 概览

```
┌────────────────────────────────────────────────────────────────┐
│                     GitHub Actions Pipeline                     │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Push/PR    │───▶│  build-and-  │───▶│     E2E      │     │
│  │              │    │    test      │    │    Tests     │     │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘     │
│                             │                    │              │
│                    ┌────────▼────────┐   ┌──────▼───────┐     │
│                    │  Lint • Build   │   │  Playwright  │     │
│                    │  Typecheck      │   │  Electron    │     │
│                    │  Unit Tests     │   │              │     │
│                    │  Coverage Gate  │   └──────────────┘     │
│                    │  npm audit      │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │  Build Release  │                          │
│                    │  (if main/tag)  │                          │
│                    │                 │                          │
│                    │  ┌───────────┐  │                          │
│                    │  │  Linux    │  │                          │
│                    │  │  Windows  │  │                          │
│                    │  │  macOS    │  │                          │
│                    │  └───────────┘  │                          │
│                    └─────────────────┘                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## 工作流详解

### 1. build-and-test 任务

**触发条件**: 所有 push 和 pull_request

**执行步骤**:

1. **Checkout** - 检出代码
2. **Setup Node.js** - 设置 Node.js 20.x
3. **Setup pnpm** - 设置 pnpm 9.x
4. **Cache** - 缓存依赖以加速构建
5. **npm audit** - 安全扫描
6. **Build contracts** - 构建合约包
7. **Lint** - 代码风格检查
8. **Typecheck** - TypeScript 类型检查
9. **Build** - 完整构建
10. **Unit tests with coverage** - 单元测试和覆盖率
11. **Coverage gate** - 覆盖率门禁（合并覆盖率按 main 基线向下取整，且不低于 80%）
12. **Component tests** - 组件测试
13. **Integration tests** - 集成测试
14. **Upload artifacts** - 上传构建产物（保留30天）

### 2. E2E 任务

**触发条件**: build-and-test 成功后

**执行步骤**:

1. 下载构建产物
2. 安装 Playwright 浏览器
3. 安装 Electron 系统依赖（Linux）
4. 运行 E2E 测试
5. 失败时上传 trace 文件

### 3. build-release 任务

**触发条件**: main 分支或版本标签

**矩阵构建**:

- Ubuntu (Linux)
- Windows
- macOS

**执行步骤**:

1. 构建应用
2. 代码签名（如果配置了证书）
3. 生成安装包
4. 上传产物

### Windows 原生模块工具链

`windows-latest` 当前只提供 Visual Studio 2026（内部版本 18，路径多为 `C:\Program Files\Microsoft Visual Studio\18\Enterprise`），没有 VS 2022。pnpm 9 自带 node-gyp 10.3.1，无法识别 v18，会在从源码编译原生模块时报 `unknown version "undefined"` / `Visual Studio 2017 or newer` 找不到。better-sqlite3 12 在 `pnpm install` 时还能走 Node 的 prebuild，所以这条问题在 main 上被掩盖；12 针对 Electron 的编译走的是 `@electron/rebuild` 自带的 node-gyp 12.4.0，因此还能过。better-sqlite3 13 没有 prebuild，`pnpm install` 必须在 Windows 上现场编译，#159 就是因此在 Install dependencies 失败的。

处理方式（CI 的 `Build Release Artifacts` Windows 作业和 Release 工作流的 Windows 作业都会做）：

1. 运行 `scripts/setup-windows-native-build.ps1`：安装 node-gyp 12.x（必须 ≥12.1.0，该版本起才识别 VS 2026），并把 `npm_config_node_gyp` 指到这份 `node-gyp.js`。pnpm 只有在这个变量未设置时才会改用自带的 10.3.1。
2. 不再设置 `npm_package_config_node_gyp_msvs_version=2022`（或任何强制 2022 的 `msvs_version` / `GYP_MSVS_VERSION`）。镜像上没有 2022，强制指定只会让检测失败。
3. 用 vswhere（需要 C++ 工具集）以及 `18` / `2026` / `2022` 路径确认已安装 Visual Studio；找不到则让该步骤失败，而不是只打 warning 后继续。

不要把 Windows 作业改成 `windows-2022` 来回避这个问题（镜像退役后还会再出现），也不要为此下调、跳过或把任何检查改成可选；`CI Status` 仍只汇总 Lint/Typecheck/Unit/Component/Integration、E2E 和 Coverage Report。本地 Windows 开发环境如果同样是 VS 2026 + pnpm 9，也可以运行同一脚本，见 CONTRIBUTING 与 quickstart。

Release 工作流（`.github/workflows/release.yml`）的 Windows 作业同样运行该脚本，且不得削弱其中的 vswhere 等检查。唯一例外：`workflow_dispatch` 且 `upload=false`（dry run）时，如果检出的旧 tag 里没有 `scripts/setup-windows-native-build.ps1`，则跳过该步骤，并由 bash 步骤在日志和 Job Summary 写入「旧 tag，已跳过 Windows 工具链脚本」（保证 UTF-8；脚本存在时仍走原来的 PowerShell 调用）。tag 推送，或 `upload=true`（`upload` 未提供时视为 true）时，缺少该脚本必须失败。

## 安全扫描

### npm audit 策略

```yaml
# 严重漏洞：立即失败
if [ "$CRITICAL_VULNS" -gt 0 ]; then
  exit 1
fi

# 高危漏洞：最多允许5个
if [ "$HIGH_VULNS" -gt 5 ]; then
  exit 1
fi
```

### 安全最佳实践

1. **定期更新依赖**

   ```bash
   pnpm update
   pnpm audit --fix
   ```

2. **锁定文件版本**
   - 使用 `pnpm-lock.yaml`
   - CI 中使用 `--frozen-lockfile`

3. **最小权限原则**
   - GitHub Actions token 使用最小权限
   - Secrets 仅在需要时暴露

## 代码签名配置

### Windows 代码签名

**需要的 Secrets**:

- `WINDOWS_CERTIFICATE` - Base64 编码的 P12 证书
- `WINDOWS_CERTIFICATE_PASSWORD` - 证书密码

**配置步骤**:

1. 从证书颁发机构获取代码签名证书
2. 导出为 .p12 格式
3. 转换为 base64:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.p12"))
   ```
4. 添加到 GitHub Secrets

### macOS 代码签名和公证

**需要的 Secrets**:

- `MACOS_CERTIFICATE` - Base64 编码的 P12 证书
- `MACOS_CERTIFICATE_PASSWORD` - 证书密码
- `KEYCHAIN_PASSWORD` - 临时钥匙串密码
- `APPLE_ID` - Apple ID
- `APPLE_APP_SPECIFIC_PASSWORD` - 应用专用密码
- `APPLE_TEAM_ID` - Apple Team ID

**配置步骤**:

1. 加入 Apple Developer Program ($99/年)
2. 创建 Developer ID Application 证书
3. 下载并导出为 .p12 格式
4. 生成应用专用密码
5. 将所有信息添加到 GitHub Secrets

## 覆盖率门禁

### 目标

合并后的产品源码覆盖率（Jest unit / component / integration，再加上映射回源码的 Electron E2E）必须达到或超过以下门槛。门槛来自 main `b5a6567` 的实测值向下取整，且永远不低于 80%：

| 指标 | 实测（main `b5a6567`） | 门槛 |
| --- | ---: | ---: |
| statements | 92.36% | 92% |
| branches | 86.13% | 86% |
| functions | 92.18% | 92% |
| lines | 93.62% | 93% |

目录级更高门槛（`app/main/src/lifecycle/**`、`app/main/src/persistence/okr-store/**`、`packages/contracts/**`）本轮未设，跟踪见 issue #151。

### 检查流程

CI 的 Coverage Report 任务会核对 `coverage/coverage-summary.json`，并在 GitHub Job Summary 中写出 metric / current / threshold / delta。本地等价命令：

```bash
# 完整合并覆盖率（含 E2E）并执行门槛检查
pnpm run test:coverage

# 已有合并报告时，只跑门槛检查
pnpm run coverage:check
```

低于任一门槛时，`coverage:check` 与 Coverage Report 任务失败。

### 调整门槛的规则

覆盖率门槛用于防止覆盖率回退。因缺少测试而无法通过门禁的 PR 必须补测试，不得下调门槛。下调任一门槛须向协调助手（项目协调人）报告，除非下调的理由是明确删除了死代码。

### 查看覆盖率报告

```bash
pnpm run test:coverage
open coverage/lcov-report/index.html
```

## 构建产物

### 保留策略

| 产物类型          | 保留时间 | 说明           |
| ----------------- | -------- | -------------- |
| 构建产物          | 30 天    | 开发调试使用   |
| 发布包            | 90 天    | 可下载的安装包 |
| 覆盖率报告        | 30 天    | 历史趋势分析   |
| Playwright traces | 7 天     | 仅失败时保留   |

### 产物下载

```bash
# 从 GitHub Actions 下载
gh run download --name build-artifacts

# 从发布页面下载
curl -L -o clarityokr.dmg https://github.com/anomalyco/ClarityOKR/releases/latest/download/ClarityOKR.dmg
```

## 故障排除

### CI 构建失败

#### 依赖安装失败

```bash
# 清除缓存并重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

#### 类型检查失败

```bash
# 本地复现
pnpm run typecheck

# 检查 tsconfig.json 配置
```

#### 测试失败

```bash
# 本地运行测试
pnpm run test

# 查看详细输出
DEBUG=* pnpm run test
```

### 安全扫描失败

```bash
# 本地运行扫描
pnpm audit

# 尝试自动修复
pnpm audit --fix

# 查看详细信息
pnpm audit --json | jq '.advisories'
```

### 代码签名失败

1. **检查 Secrets 配置**
   - 确认所有必需的 Secrets 已设置
   - 验证 base64 编码正确

2. **检查证书有效性**
   - 确认证书未过期
   - 确认证书权限正确

3. **查看详细日志**
   ```bash
   # 在 CI 中添加调试信息
   echo "Certificate configured: $([ -n "$WINDOWS_CERTIFICATE" ] && echo 'YES' || echo 'NO')"
   ```

## 性能优化

### 缓存策略

1. **pnpm 缓存**
   - 缓存 pnpm store
   - 基于 lock 文件哈希

2. **Playwright 浏览器缓存**
   - 缓存浏览器二进制文件
   - 减少安装时间

3. **构建缓存**
   - 增量构建
   - 避免重复编译

### 并行执行

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
  fail-fast: false
```

## 监控和告警

### CI 状态监控

- **GitHub Actions 状态页面**: 监控工作流运行状态
- **Slack 集成**: 失败时发送通知
- **邮件通知**: 关键失败发送邮件

### 指标收集

- **构建时间**: 监控构建性能趋势
- **测试通过率**: 跟踪测试稳定性
- **安全漏洞**: 监控漏洞数量趋势

## 最佳实践

### 1. 分支保护

- 要求 PR 通过 CI 检查
- 要求代码审查
- 禁止直接推送到 main

### 2. 提交信息规范

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试
ci: CI/CD相关
chore: 其他
```

### 3. 版本发布

1. 更新 CHANGELOG.md
2. 打版本标签: `git tag v1.2.3`
3. 推送到远程: `git push origin v1.2.3`
4. GitHub Actions 自动构建发布包

## 相关文档

- [故障排除指南](./troubleshooting-guide.md)
- [原子持久化架构](./atomic-persistence.md)
- [数据迁移指南](./migration/data-storage-migration.md)
