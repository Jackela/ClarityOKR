# ClarityOKR 数据迁移指南

本文档描述了从旧版 JSON 存储迁移到新版原子持久化存储的过程。

## 概述

ClarityOKR 已升级为使用原子持久化存储系统，提供：

- **原子写入**：通过 write-to-temp-then-rename 模式确保数据完整性
- **自动备份**：每次写入自动创建备份（保留最后3个版本）
- **崩溃恢复**：自动检测并恢复因崩溃中断的写入操作
- **数据校验**：使用 SHA-256 校验和验证数据完整性

## 迁移步骤

### 自动迁移（推荐）

应用在启动时会自动执行数据迁移：

1. **启动应用**：正常启动 ClarityOKR
2. **自动检测**：系统会自动检测旧版 JSON 文件格式
3. **格式升级**：旧版数据会被自动重写为带校验和的新格式
4. **创建备份**：迁移前会自动创建完整数据备份

### 手动迁移

如果需要手动控制迁移过程：

```typescript
import { createCrashRecoveryService } from './app/main/src/persistence/crash-recovery.service.js';

const recoveryService = createCrashRecoveryService('./data');

// 执行完整恢复流程
const report = await recoveryService.performRecovery();
console.log('迁移报告:', report);

// 检查数据完整性
const isHealthy = await recoveryService.isDataHealthy();
console.log('数据完整性:', isHealthy);
```

## 数据格式变化

### 旧格式

```json
{
  "id": "session-123",
  "status": "completed",
  "answers": [...]
}
```

### 新格式

```json
{
  "checksum": "abc123...",
  "timestamp": "2026-03-18T10:30:00.000Z",
  "data": {
    "id": "session-123",
    "status": "completed",
    "answers": [...]
  }
}
```

## 备份策略

- **备份数量**：每个数据文件保留最多3个备份版本
- **备份命名**：`{filename}.backup.{timestamp}.json`
- **备份位置**：与数据文件同目录
- **自动轮转**：超出3个的旧备份自动删除

## 故障排除

### 数据文件损坏

如果主数据文件损坏，系统会自动：

1. 尝试从备份恢复
2. 验证备份完整性
3. 恢复成功后重写主文件

### 临时文件残留

如果应用崩溃导致临时文件残留：

1. 启动时自动检测 `.tmp` 文件
2. 尝试从临时文件恢复数据
3. 清理无效临时文件

### 手动恢复

```bash
# 查看备份文件
ls -la data/*.backup.*

# 手动复制备份
# Linux/macOS
cp data/session.backup.2026-03-18T10-30-00-000Z.json data/session.json

# Windows
copy data\session.backup.2026-03-18T10-30-00-000Z.json data\session.json
```

## 验证迁移

### 检查迁移状态

```bash
# 查看持久化指标
cat data/.persistence-metrics.json

# 检查备份文件
ls -la data/*.backup.* | wc -l
```

### 测试数据写入

1. 创建新的澄清会话
2. 检查数据文件是否包含校验和字段
3. 验证备份文件已创建

## 回滚计划

如果需要回滚到旧版本：

1. 停止应用
2. 从备份目录恢复旧格式文件
3. 删除新格式文件中的校验和包装
4. 重新启动应用

## 支持

遇到迁移问题？请：

1. 查看崩溃恢复报告：`data/.recovery-report.json`
2. 检查应用日志中的迁移相关信息
3. 提交 Issue 到 GitHub 仓库

## 变更日志

- **v0.1.0**: 引入原子持久化存储系统
- **v0.1.1**: 添加自动崩溃恢复机制
- **v0.1.2**: 优化备份轮转策略
