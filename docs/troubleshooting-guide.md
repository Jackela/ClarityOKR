# ClarityOKR 故障排除指南

本文档帮助用户诊断和解决 ClarityOKR 的常见问题。

## 快速诊断

### 检查应用状态

```bash
# 查看应用日志
tail -f ~/.config/clarityokr/logs/main.log

# 检查数据目录
ls -la ~/ClarityOKR/data/

# 查看进程
ps aux | grep clarityokr
```

## 常见问题

### 1. 应用无法启动

**症状**: 双击应用图标无反应或立即崩溃

**可能原因和解决方案**:

#### 数据文件损坏

```bash
# 检查数据文件完整性
cat ~/ClarityOKR/data/clarification-session.json | jq .

# 如果有语法错误，尝试从备份恢复
ls -la ~/ClarityOKR/data/*.backup.*

# 恢复最近的备份（替换 filename 为实际文件名）
cp ~/ClarityOKR/data/filename.backup.YYYY-MM-DDTHH-MM-SS.mmmZ.json \
   ~/ClarityOKR/data/filename.json
```

#### 权限问题

```bash
# Linux/macOS
chmod -R 755 ~/ClarityOKR/data/
chown -R $(whoami) ~/ClarityOKR/data/

# Windows（以管理员身份运行 PowerShell）
takeown /F "$env:USERPROFILE\ClarityOKR\data" /R
icacls "$env:USERPROFILE\ClarityOKR\data" /grant "$env:USERNAME:F" /T
```

### 2. 数据丢失或会话消失

**症状**: 之前的澄清会话或 OKR 文档不见了

**诊断步骤**:

1. **检查数据目录**

   ```bash
   ls -la ~/ClarityOKR/data/
   ```

2. **查看恢复报告**

   ```bash
   cat ~/ClarityOKR/data/.recovery-report.json
   ```

3. **检查备份文件**
   ```bash
   ls -la ~/ClarityOKR/data/*.backup.*
   ```

**恢复步骤**:

```bash
# 1. 停止应用
pkill -f clarityokr

# 2. 备份当前状态
cp -r ~/ClarityOKR/data ~/ClarityOKR/data.backup.$(date +%Y%m%d_%H%M%S)

# 3. 从备份恢复
cp ~/ClarityOKR/data/clarification-session.backup.YYYY-MM-DDTHH-MM-SS.mmmZ.json \
   ~/ClarityOKR/data/clarification-session.json

# 4. 重启应用
```

### 3. 写入缓慢或卡顿

**症状**: 保存会话或 OKR 时出现明显延迟

**可能原因**:

#### 磁盘空间不足

```bash
# 检查磁盘空间
df -h ~/ClarityOKR/data/

# 清理旧备份（保留最近的3个）
cd ~/ClarityOKR/data/
ls -t *.backup.* | tail -n +4 | xargs rm -f
```

#### 文件系统问题

```bash
# 检查文件系统错误
# macOS
fsck -fy

# Linux
sudo fsck /dev/sda1

# Windows
chkdsk C: /f
```

### 4. 自动恢复失败

**症状**: 应用提示"数据恢复失败"

**手动恢复步骤**:

```bash
# 1. 停止应用
# 2. 进入数据目录
cd ~/ClarityOKR/data/

# 3. 列出所有备份
ls -lt *.backup.*

# 4. 尝试恢复最近的备份
# 对每个损坏的文件执行：
cp clarification-session.backup.最新时间戳.json clarification-session.json

# 5. 如果最近的备份也损坏，尝试次新的
cp clarification-session.backup.次新时间戳.json clarification-session.json

# 6. 验证 JSON 格式
jq . clarification-session.json

# 7. 重启应用
```

### 5. CI/CD 构建失败

**症状**: GitHub Actions 工作流失败

#### 测试覆盖率低于 80%

```bash
# 本地运行测试并生成覆盖率报告
pnpm run test:unit --coverage

# 查看覆盖率报告
cat coverage/lcov-report/index.html

# 检查未覆盖的代码
# 打开 coverage/lcov-report/index.html 在浏览器中查看
```

#### npm audit 安全扫描失败

```bash
# 本地运行安全扫描
pnpm audit

# 自动修复可修复的漏洞
pnpm audit --fix

# 查看详细信息
pnpm audit --json

# 如果无法自动修复，需要手动更新依赖
# 1. 检查 package.json 中的依赖版本
# 2. 更新到修复版本
# 3. 重新运行 pnpm install
```

#### 构建步骤失败

```bash
# 本地执行完整构建流程
pnpm run clean
pnpm run build:contracts
pnpm run build:main
pnpm run build:renderer
pnpm run lint
pnpm run typecheck
pnpm run test
```

### 6. 代码签名问题

**症状**: Windows 提示"无法验证发布者"或 macOS 提示应用已损坏

#### Windows 代码签名

```powershell
# 检查证书是否配置
echo $env:WINDOWS_CERTIFICATE

# 如果未配置，需要：
# 1. 获取代码签名证书
# 2. 转换为 base64：
#    [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.p12"))
# 3. 添加到 GitHub Secrets: WINDOWS_CERTIFICATE
# 4. 添加密码到 GitHub Secrets: WINDOWS_CERTIFICATE_PASSWORD
```

#### macOS 代码签名和公证

```bash
# 检查证书是否配置
echo $MACOS_CERTIFICATE

# 如果未配置，需要：
# 1. 加入 Apple Developer Program
# 2. 创建 Developer ID Application 证书
# 3. 导出为 .p12 格式
# 4. 转换为 base64：
#    base64 -i certificate.p12
# 5. 添加到 GitHub Secrets: MACOS_CERTIFICATE
# 6. 添加密码到 GitHub Secrets: MACOS_CERTIFICATE_PASSWORD
# 7. 添加 Apple ID 和 App 专用密码到 Secrets
```

### 7. E2E 测试失败

**症状**: Playwright E2E 测试失败

```bash
# 本地运行 E2E 测试
pnpm run test:e2e

# 带调试信息运行
DEBUG=pw:api pnpm run test:e2e

# 查看测试报告
open tests/e2e/test-results/index.html

# 如果失败，检查：
# 1. Electron 是否正确安装
# 2. 构建是否成功完成
# 3. 显示环境是否可用（Linux 需要 Xvfb）
```

## 日志分析

### 日志位置

```
Linux/macOS: ~/.config/clarityokr/logs/
Windows: %APPDATA%\clarityokr\logs\
```

### 关键日志文件

- `main.log` - 主进程日志
- `renderer.log` - 渲染进程日志
- `recovery.log` - 崩溃恢复日志
- `.recovery-report.json` - 恢复报告

### 日志级别

```typescript
ERROR   - 严重错误，需要立即处理
WARN    - 警告，可能需要注意
INFO    - 一般信息
DEBUG   - 调试信息（仅在开发模式）
```

## 性能调优

### 减少备份数量

如果磁盘空间有限：

```typescript
// 修改 atomic-persistence.service.ts
private readonly backupRetentionCount = 2; // 改为 2
```

### 禁用校验和（不推荐）

仅在极端性能要求下：

```typescript
// 修改 writeJson 函数
// 注释掉校验和相关代码
```

## 联系支持

如果以上步骤无法解决问题：

1. **收集诊断信息**

   ```bash
   # 创建诊断报告
   tar -czf clarityokr-diagnostics.tar.gz \
     ~/ClarityOKR/data/*.json \
     ~/.config/clarityokr/logs/
   ```

2. **提交 Issue**
   - 访问：https://github.com/anomalyco/ClarityOKR/issues
   - 描述：问题症状、重现步骤、已尝试的解决方案
   - 附件：诊断报告（注意删除敏感信息）

3. **紧急恢复**
   - 如果数据非常重要且无法恢复
   - 联系开发团队获取专业支持

## 预防措施

### 定期备份

```bash
# 创建每日备份脚本
echo '#!/bin/bash' > ~/backup-clarityokr.sh
echo 'cp -r ~/ClarityOKR/data ~/Backups/clarityokr-$(date +%Y%m%d)' >> ~/backup-clarityokr.sh
chmod +x ~/backup-clarityokr.sh

# 添加到 cron（每天凌晨 2 点执行）
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-clarityokr.sh") | crontab -
```

### 监控磁盘空间

```bash
# 设置磁盘空间告警
# 当磁盘空间低于 1GB 时提醒
```

### 保持更新

- 定期更新到最新版本
- 关注安全公告
- 及时应用安全补丁
