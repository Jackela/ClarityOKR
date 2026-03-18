# ClarityOKR 原子持久化架构文档

本文档详细描述 ClarityOKR 的原子持久化系统架构。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    ClarityOKR Application                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Session         │  │ OKR             │  │ Action Log  │  │
│  │ Repository      │  │ Repository      │  │ Writer      │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘  │
│           │                    │                   │         │
│           └────────────────────┼───────────────────┘         │
│                                │                              │
│                    ┌───────────▼───────────┐                 │
│                    │   Utility Functions    │                 │
│                    │   (readJson/writeJson) │                 │
│                    └───────────┬───────────┘                 │
│                                │                              │
│           ┌────────────────────┼───────────────────┐          │
│           │                    │                   │          │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼──────┐  │
│  │ Atomic          │  │ Crash           │  │ Persistence  │  │
│  │ Persistence     │  │ Recovery        │  │ Metrics      │  │
│  │ Service         │  │ Service         │  │              │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┘  │
│           │                    │                              │
│           └────────────────────┼───────────────────┐          │
│                                │                   │          │
│                    ┌───────────▼───────────┐       │          │
│                    │    File System        │       │          │
│                    │                       │       │          │
│  data/             │   *.json              │   *.backup.*     │
│  ├── clarification-│   *.tmp               │                  │
│  │   session.json  └───────────────────────┘                  │
│  ├── okr-document.json                                       │
│  ├── action-log.json                                         │
│  └── multi-sessions.json                                     │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. AtomicPersistenceService

**职责**：实现原子写入操作

**关键特性**：

- **原子写入**：通过 write-to-temp-then-rename 模式
- **数据校验**：使用 SHA-256 校验和验证完整性
- **自动备份**：每次写入自动创建备份
- **备份轮转**：保留最后3个备份版本

**写入流程**：

```
1. 检查现有文件 → 创建备份
2. 写入临时文件 (.tmp)
3. 计算校验和
4. 原子重命名（rename）
5. 验证写入
```

**读取流程**：

```
1. 读取主文件
2. 验证校验和
3. 如果失败 → 尝试从备份恢复
4. 返回数据
```

### 2. CrashRecoveryService

**职责**：应用启动时执行数据完整性检查和恢复

**恢复流程**：

```
1. 清理孤立临时文件
2. 检查所有数据文件完整性
3. 自动从备份恢复损坏文件
4. 生成恢复报告
```

### 3. Utility Functions

**readJson()**: 读取JSON文件，自动处理校验和验证和备份恢复
**writeJson()**: 写入JSON文件，使用原子写入模式

## 数据格式

### 存储格式

```typescript
interface StoredData<T> {
  checksum: string; // SHA-256 校验和
  timestamp: string; // ISO 8601 时间戳
  data: T; // 实际数据
}
```

### 校验和计算

```typescript
const jsonData = JSON.stringify(data, null, 2);
const checksum = createHash('sha256').update(jsonData).digest('hex');
```

### 备份命名

```
{filename}.backup.{timestamp}.json

示例：
clarification-session.backup.2026-03-18T10-30-00-000Z.json
```

## 可靠性指标

### 持久化指标

| 指标             | 描述         | 目标     |
| ---------------- | ------------ | -------- |
| writeLatency     | 平均写入延迟 | < 10ms   |
| writeErrors      | 写入错误数   | 0        |
| readErrors       | 读取错误数   | 0        |
| checksumFailures | 校验失败数   | 0        |
| recoveryCount    | 恢复次数     | 0 (正常) |
| backupCount      | 备份创建数   | 持续增长 |

### 可靠性目标

- **MTBF** (平均无故障时间): > 8,760 小时 (1年)
- **数据丢失**: 0
- **RTO** (恢复时间目标): < 5 秒
- **RPO** (恢复点目标): 0 (零数据丢失)

## 故障场景处理

### 场景 1: 写入过程中崩溃

**检测**：启动时扫描 `.tmp` 文件
**处理**：

1. 检查临时文件完整性
2. 如果有效，重命名为正式文件
3. 如果无效，删除临时文件

### 场景 2: 主文件损坏

**检测**：读取时校验和验证失败
**处理**：

1. 尝试从备份恢复
2. 验证备份完整性
3. 恢复最近的有效备份

### 场景 3: 所有备份都损坏

**检测**：所有备份校验失败
**处理**：

1. 记录错误日志
2. 启动空数据状态
3. 提示用户手动恢复

## 性能考虑

### 写入性能

- **开销**：校验和计算增加约 1-2ms
- **备份复制**：额外约 5-10ms（SSD）
- **总体影响**：单次写入增加约 10ms

### 读取性能

- **正常读取**：与直接读取相同
- **恢复读取**：增加约 50-100ms（取决于备份大小）

### 优化策略

1. **批量写入**：合并多次写入操作
2. **异步备份**：非关键数据可异步备份
3. **压缩**：大数据文件使用压缩存储

## 监控和告警

### 关键指标监控

```typescript
const metrics = atomicPersistence.getMetrics();

if (metrics.writeErrors > 0) {
  // 发送告警
}

if (metrics.recoveryCount > 0) {
  // 记录警告
}
```

### 健康检查

```typescript
const isHealthy = await recoveryService.isDataHealthy();
```

## 配置选项

### 备份配置

```typescript
const persistence = new AtomicPersistenceService({
  backupRetentionCount: 3, // 保留备份数量
  enableCompression: true, // 启用压缩
  compressionLevel: 6, // 压缩级别
});
```

### 恢复配置

```typescript
const recovery = new CrashRecoveryService(dataDir, {
  autoRecover: true, // 自动恢复
  strictMode: false, // 严格模式
  dataFiles: [
    // 要检查的文件列表
    'clarification-session.json',
    'okr-document.json',
  ],
});
```

## 最佳实践

### 1. 错误处理

```typescript
try {
  const result = await writeJson(filePath, data);
  if (!result.success) {
    // 处理写入失败
    console.error('Write failed:', result.error);
  }
} catch (error) {
  // 处理意外错误
  console.error('Unexpected error:', error);
}
```

### 2. 启动检查

```typescript
// 在应用启动时执行
const report = await recoveryService.performRecovery();
if (!report.success) {
  // 处理恢复失败
}
```

### 3. 定期监控

```typescript
// 定期检查持久化指标
const metrics = atomicPersistence.getMetrics();
console.log('Write latency:', metrics.writeLatency);
console.log('Error count:', metrics.writeErrors + metrics.readErrors);
```

## 安全考虑

### 数据加密

- 在写入前对敏感数据进行加密
- 备份文件同样需要加密
- 使用系统密钥链存储加密密钥

### 访问控制

- 数据目录限制访问权限
- 备份文件与主文件同权限
- 定期审计文件访问日志

## 未来改进

1. **增量备份**：只备份变化的部分
2. **云端同步**：将备份同步到云端存储
3. **版本控制**：保留更多历史版本
4. **智能压缩**：自动检测并压缩旧备份
