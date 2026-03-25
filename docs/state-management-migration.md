# 状态管理架构重构 - 迁移指南

## 概述

ClarityOKR 的状态管理已从双轨制（Signals + StateMachine）统一为单一的 **StateMachine + Signals派生** 架构。

## 架构变更

### 变更前 (双轨制)

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process                                           │
│  ┌─────────────────────┐    ┌─────────────────────────────┐│
│  │ SyncClarificationState │    │ ClarificationStateMachine  ││
│  │ (Angular Signals)      │    │ (Session status only)      ││
│  │ - UI状态管理           │    │ - 仅管理status字段         ││
│  │ - 业务逻辑分散         │    │ - 不完整状态管理           ││
│  └─────────────────────┘    └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                      ❌ 状态不一致风险
```

### 变更后 (统一架构)

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │        ClarificationStateMachine                        ││
│  │   ┌──────────────────────────────────────────────────┐  ││
│  │   │  单一数据源 (Signal<State>)                       │  ││
│  │   │  - State管理所有状态字段                          │  ││
│  │   │  - Reducer处理状态转换                            │  ││
│  │   │  - 转换规则验证                                   │  ││
│  │   └──────────────────────────────────────────────────┘  ││
│  │                          ↓                              ││
│  │   ┌──────────────────────────────────────────────────┐  ││
│  │   │  派生Signals (computed)                          │  ││
│  │   │  - currentPrompt                                 │  ││
│  │   │  - isLoading                                     │  ││
│  │   │  - isReadyToGenerate                             │  ││
│  │   └──────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  SyncClarificationState (适配器层)                       ││
│  │  - 完全向后兼容                                         ││
│  │  - 委托所有调用到StateMachine                           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                      ✅ 单一数据源，状态一致
```

## 新架构特点

1. **单一数据源**: `ClarificationStateMachine` 管理所有状态
2. **纯Reducer**: 所有状态转换通过纯函数处理
3. **自动验证**: 非法状态转换会被检测并记录
4. **Signals派生**: 计算属性自动更新
5. **向后兼容**: 旧API通过适配器继续工作

## 文件变更

### 新增文件

- `app/renderer/src/app/clarification/services/clarification-state-machine.service.ts`
  - 新的统一状态机服务
  - 包含完整的Reducer逻辑
  - 提供Signals派生

### 修改文件

- `app/renderer/src/app/clarification/services/sync-clarification-state.service.ts`
  - 现在是 `ClarificationStateMachine` 的适配器
  - 保持100%向后兼容
  - 所有方法委托给StateMachine

### 删除文件

- `tests/unit/clarification/clarification-store.spec.ts` → 迁移到新的测试
- `tests/unit/clarification/clarification-loading.spec.ts` → 迁移到新的测试

### 新增测试

- `tests/unit/clarification/clarification-state-machine.spec.ts`
- `tests/unit/clarification/clarification-state-machine-loading.spec.ts`

## 废弃方法处理

### 已废弃的方法

| 方法                     | 状态          | 替代方案                                   |
| ------------------------ | ------------- | ------------------------------------------ |
| `markReady()`            | ❌ 完全废弃   | 使用 `recordSelection()` 自动触发就绪状态  |
| `setReady()`             | ⚠️ 废弃但兼容 | 就绪状态现在自动计算（至少1个选择）        |
| `selectOption(optionId)` | ⚠️ 废弃       | 使用 `recordSelection(promptId, optionId)` |
| `reportError(error)`     | ⚠️ 废弃       | 使用 `setError(error)`                     |

### 废弃方法行为

```typescript
// markReady - 记录警告，不再生效
state.markReady(true);
// 输出: [WARN] markReady is deprecated, use recordSelection instead
// 实际就绪状态由选择数量自动计算

// setReady - 记录警告，不再生效
state.setReady(true);
// 输出: [WARN] setReady is deprecated, readiness determined automatically
// 实际就绪状态由选择数量自动计算

// selectOption - 仍可工作，但建议使用新API
state.selectOption('option-1');
// 内部调用: recordSelection(currentPrompt.id, 'option-1')

// reportError - 委托给 setError
state.reportError('error');
// 内部调用: setError('error')
```

## 迁移步骤

### 第一步: 理解新的API

```typescript
// 推荐直接使用 StateMachine
import { ClarificationStateMachine } from './clarification-state-machine.service';

constructor(private stateMachine: ClarificationStateMachine) {}

// 读取状态
const prompt = this.stateMachine.currentPrompt();
const isReady = this.stateMachine.isReadyToGenerate();

// 触发状态转换
this.stateMachine.start('提高团队效率');
this.stateMachine.recordSelection('prompt-1', 'option-a');
```

### 第二步: 逐步替换废弃方法

**旧代码:**

```typescript
// 使用废弃的 markReady
state.recordSelection(prompt.id, optionId);
state.markReady(true); // ❌ 废弃
```

**新代码:**

```typescript
// 就绪状态自动计算
state.recordSelection(prompt.id, optionId); // ✅ 自动触发ready状态
```

**旧代码:**

```typescript
// 使用废弃的 selectOption
state.selectOption(optionId); // ❌ 废弃
```

**新代码:**

```typescript
// 显式指定promptId
state.recordSelection(prompt.id, optionId); // ✅ 推荐
```

### 第三步: 更新组件注入 (可选)

如果希望直接使用新的StateMachine:

```typescript
// 组件变更前
@Component({...})
export class MyComponent {
  constructor(public state: SyncClarificationState) {}
}

// 组件变更后
@Component({...})
export class MyComponent {
  constructor(public state: ClarificationStateMachine) {}
}
```

**注意**: 这不是必须的，`SyncClarificationState` 适配器会持续维护。

## 状态转换规则

```
          start()              setPrompt()
    ┌────────┴────────┐    ┌────┴────┐
    ↓                 │    ↓         │
   idle ──────────→ loading ──────→ prompting
                      │               │
                      │ recordSelection()
                      │ (count >= 1)  │
                      │               ↓
                      │           ready ←────────┐
                      │               │          │
                      │ setGenerating()│          │
                      │               ↓          │
                      │           generating     │
                      │               │          │
                      │ setCompleted()│          │
                      │               ↓          │
                      │           completed ─────┤
                      │                          │ reset()
                      │                          │
                      └──────→ error ←───────────┘
                         setError()        clearError()
```

### 有效转换

| 当前状态   | 允许转换到                        |
| ---------- | --------------------------------- |
| idle       | loading                           |
| loading    | prompting, error, generating      |
| prompting  | loading, ready, error, generating |
| ready      | generating, loading, error        |
| generating | completed, error                  |
| completed  | idle                              |
| error      | idle, loading, prompting          |

## 向后兼容性保证

### 完全兼容的API

所有以下API保持完全兼容，无需修改:

```typescript
// 属性访问 (Signals)
state.currentPrompt()
state.isLoading()
state.error()
state.isReadyToGenerate()
state.selections()
state.sessionId()
state.validationError()
state.intent()
state.workflowState()
state.history()
state.hasError()
state.selectionCount()
state.hasPrompt()
state.errorMessage()
state.currentSelection()
state.selectedOptionIds()

// 方法调用
state.setPrompt(prompt)
state.setLoading(loading, intent?)
state.setError(error)
state.clearError()
state.recordSelection(promptId, optionId)
state.setSessionId(sessionId)
state.setValidationError(message)
state.setIntent(intent)
state.reset()
state.start(intent)
state.setGenerating()
state.setCompleted(okr?)
state.getSelection(promptId)
state.hasSelection(promptId)
state.getStateSnapshot()
```

## 测试更新

测试已全面更新以测试新的StateMachine:

```bash
# 运行新的测试
npm test -- clarification-state-machine

# 运行所有澄清相关测试
npm test -- clarification
```

## 常见问题

### Q: 是否需要立即迁移?

**A**: 不需要。`SyncClarificationState` 适配器会持续维护，旧代码继续工作。

### Q: markReady被废弃后如何控制就绪状态?

**A**: 就绪状态现在自动计算。当用户至少选择了1个选项时，状态自动变为 `ready`。

### Q: 如何调试状态转换?

**A**: 查看控制台日志，StateMachine会记录所有状态转换:

```
[STATE-MACHINE] Transition: loading -> prompting
[STATE-MACHINE] Transition: prompting -> ready
```

### Q: 开发环境会检查非法转换吗?

**A**: 是的，开发环境下非法状态转换会抛出错误，帮助你发现问题。

## 总结

- ✅ 状态管理现在单一、一致、可预测
- ✅ 所有旧API继续工作
- ✅ 新架构更易于测试和调试
- ✅ 废弃方法提供平滑迁移路径
- ✅ 自动计算减少了手动状态管理错误

如有问题，请查看 `clarification-state-machine.service.ts` 中的详细注释。
