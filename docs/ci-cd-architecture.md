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
11. **Coverage gate (80%)** - 覆盖率门禁
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

- **总体覆盖率**: ≥ 80%
- **关键模块**: ≥ 90%

### 检查流程

```bash
# 生成覆盖率报告
pnpm run test:unit --coverage

# 提取覆盖率百分比
COVERAGE=$(cat coverage/lcov-report/index.html | grep -oP 'data-value="\K[0-9.]+(?=%)' | head -1)

# 门禁检查
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
  echo "❌ Coverage is below 80% threshold!"
  exit 1
fi
```

### 查看覆盖率报告

```bash
# 生成 HTML 报告
pnpm run test:unit --coverage

# 在浏览器中查看
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
