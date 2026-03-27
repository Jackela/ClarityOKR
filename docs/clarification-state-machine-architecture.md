# Clarification状态管理架构设计

## 架构目标

解决双轨制状态管理问题，统一为单一数据源架构。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ClarificationStateMachine                        │
│                     (单一数据源 / 状态机)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      Core State                                │ │
│  │  signal<ClarificationState>(_state)                           │ │
│  │  - workflowState                                               │ │
│  │  - currentPrompt                                               │ │
│  │  - selections                                                  │ │
│  │  - isLoading                                                   │ │
│  │  - error                                                       │ │
│  │  - ...                                                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↓                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      Reducer                                   │ │
│  │  - 纯函数处理所有状态转换                                       │ │
│  │  - 验证状态转换合法性                                           │ │
│  │  - 计算派生值 (isReadyToGenerate)                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↓                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   Derived Signals                              │ │
│  │  computed(() => ...)                                          │ │
│  │  - currentPrompt                                               │ │
│  │  - isReadyToGenerate                                           │ │
│  │  - selectionCount                                              │ │
│  │  - hasError                                                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│              SyncClarificationState (适配器层)                       │
│              - 向后兼容                                              │
│              - 委托所有调用到StateMachine                            │
└─────────────────────────────────────────────────────────────────────┘
```

## 设计原则

### 1. 单一数据源 (Single Source of Truth)

所有状态存储在一个 `signal<ClarificationState>` 中，避免多个状态源导致的不一致。

```typescript
private readonly _state = signal<ClarificationState>(INITIAL_STATE);
```

### 2. Reducer模式

所有状态转换通过纯函数Reducer处理，确保可预测性和可测试性。

```typescript
private reducer(state: ClarificationState, action: StateAction): ClarificationState {
  switch (action.type) {
    case 'START':
      return { ...state, workflowState: 'loading', isLoading: true };
    // ...
  }
}
```

### 3. 状态转换验证

明确定义有效转换，防止非法状态变更。

```typescript
const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error', 'generating'],
  prompting: ['loading', 'ready', 'error', 'generating'],
  ready: ['generating', 'loading', 'error'],
  generating: ['completed', 'error'],
  completed: ['idle'],
  error: ['idle', 'loading', 'prompting'],
};
```

### 4. Signals派生

计算属性使用 `computed()` 创建，自动响应状态变化。

```typescript
readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);
readonly selectionCount = computed(() => Object.keys(this._state().selections).length);
```

### 5. 向后兼容

通过适配器模式，旧API可以继续工作，平滑迁移。

## 状态转换图

```
                    ┌─────────────────────────────────────┐
                    │             idle                    │
                    │  (初始状态)                          │
                    └──────────────┬──────────────────────┘
                                   │ start(intent)
                                   ▼
                    ┌─────────────────────────────────────┐
         ┌─────────│           loading                   │
         │         │  (加载中)                            │
         │         └──────────────┬──────────────────────┘
         │                        │ setPrompt()
         │                        ▼
         │         ┌─────────────────────────────────────┐
         │         │          prompting                  │
         │         │  (显示澄清提示)                       │
         │         └──────────────┬──────────────────────┘
         │                        │ recordSelection()
         │                        │ (count >= 1)
         │                        ▼
         │         ┌─────────────────────────────────────┐
         │         │            ready                    │
         │         │  (可生成OKR)                         │
         │         └──────────────┬──────────────────────┘
         │                        │ setGenerating()
         │                        ▼
         │         ┌─────────────────────────────────────┐
         │         │          generating                 │
         │         │  (生成OKR中)                         │
         │         └──────────────┬──────────────────────┘
         │                        │ setCompleted()
         │                        ▼
         │         ┌─────────────────────────────────────┐
         │         │          completed                  │
         │         │  (完成)                              │
         │         └──────────────┬──────────────────────┘
         │                        │ reset()
         └────────────────────────┘

    ╔═══════════════════════════════════════════════════════════╗
    ║                      error 状态                            ║
    ║  - 可从 loading/prompting/ready/generating 进入            ║
    ║  - 可转换到 idle/loading/prompting                         ║
    ╚═══════════════════════════════════════════════════════════╝
```

## API设计

### 核心方法

| 方法                          | 描述     | 触发Action       | 状态转换                    |
| ----------------------------- | -------- | ---------------- | --------------------------- |
| `start(intent)`               | 开始流程 | START            | idle → loading              |
| `setPrompt(prompt)`           | 设置提示 | SET_PROMPT       | loading → prompting         |
| `recordSelection(id, option)` | 记录选择 | RECORD_SELECTION | prompting → ready (count≥1) |
| `setGenerating()`             | 开始生成 | SET_GENERATING   | ready → generating          |
| `setCompleted()`              | 完成生成 | SET_COMPLETED    | generating → completed      |
| `setError(error)`             | 设置错误 | SET_ERROR        | \* → error                  |
| `clearError()`                | 清除错误 | CLEAR_ERROR      | error → idle                |
| `reset()`                     | 重置     | RESET            | \* → idle                   |

### 废弃方法处理

```typescript
/**
 * @deprecated 使用 recordSelection 自动触发就绪状态
 */
markReady(_ready: boolean): void {
  this.logger.warn('[STATE-MACHINE] markReady is deprecated...');
}
```

## 文件结构

```
app/renderer/src/app/clarification/services/
├── clarification-state-machine.service.ts  # 新的统一状态机
├── sync-clarification-state.service.ts     # 适配器（向后兼容）
└── clarification-orchestrator.service.ts   # 业务逻辑（保持不变）

tests/unit/clarification/
├── clarification-state-machine.spec.ts      # 新的测试
└── clarification-state-machine-loading.spec.ts
```

## 优势

1. **一致性**: 单一数据源，无状态不同步风险
2. **可预测性**: Reducer纯函数，状态转换可追踪
3. **安全性**: 自动验证非法状态转换
4. **可测试性**: 纯函数易于单元测试
5. **响应性**: Signals自动派生，UI即时更新
6. **兼容性**: 适配器保证旧代码继续工作

## 迁移路径

### 短期（向后兼容）

- 继续使用 `SyncClarificationState`
- 废弃方法继续工作，但记录警告

### 中期（逐步迁移）

- 新组件直接使用 `ClarificationStateMachine`
- 逐步替换废弃方法调用

### 长期（完全迁移）

- 移除 `SyncClarificationState` 适配器
- 所有代码使用统一API

## 参考

- `docs/state-management-migration.md` - 完整迁移指南
- `app/renderer/src/app/clarification/services/clarification-state-machine.service.ts` - 实现代码
