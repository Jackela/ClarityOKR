# ClarityOKR 状态管理迁移指南

本文档描述从 StateMachine 迁移到 Signals 的过程。

## 概述

ClarityOKR 已将状态管理从复杂的 StateMachine + Signals 双系统简化为统一的 Signals 系统。

## 变更内容

### 移除的组件

- `clarification.state-machine.ts` - 状态机实现
- `sync-clarification-state.service.ts` - 状态同步服务

### 保留的组件

- `ClarificationWizardComponent` - 使用 Signals
- `clarification.store.ts` - 基于 Signals 的状态存储

### 主要变化

#### 之前（StateMachine）

```typescript
// 使用状态机
export class ClarificationWizardComponent {
  private stateMachine = inject(ClarificationStateMachine);

  get currentState() {
    return this.stateMachine.currentState;
  }

  submitAnswer(answer: string) {
    this.stateMachine.transition('SUBMIT_ANSWER', { answer });
  }
}
```

#### 之后（Signals）

```typescript
// 使用 Signals
export class ClarificationWizardComponent {
  private store = inject(ClarificationStore);

  // 使用 computed signals
  currentQuestion = computed(() => this.store.currentQuestion());
  answers = computed(() => this.store.answers());
  isComplete = computed(() => this.store.isComplete());

  submitAnswer(answer: string) {
    this.store.submitAnswer(answer);
  }
}
```

## 迁移步骤

### 1. 更新依赖注入

**之前**:

```typescript
constructor(
  private stateMachine: ClarificationStateMachine,
  private syncService: SyncClarificationStateService,
) {}
```

**之后**:

```typescript
constructor(
  private store: ClarificationStore,
) {}
```

### 2. 更新状态访问

**之前**:

```typescript
const state = this.stateMachine.currentState;
const answers = state.context.answers;
```

**之后**:

```typescript
const answers = this.store.answers();
```

### 3. 更新状态变更

**之前**:

```typescript
this.stateMachine.transition('SUBMIT_ANSWER', { answer });
```

**之后**:

```typescript
this.store.submitAnswer(answer);
```

### 4. 更新模板绑定

**之前**:

```html
<div *ngIf="stateMachine.currentState.context.isLoading">Loading...</div>
```

**之后**:

```html
<div *ngIf="store.isLoading()">Loading...</div>
```

## 新增功能

### 响应式状态

```typescript
// Signals 自动跟踪依赖
const progress = computed(() => {
  const total = store.totalQuestions();
  const answered = store.answers().length;
  return (answered / total) * 100;
});
```

### 副作用处理

```typescript
// 使用 effect 处理副作用
effect(() => {
  if (store.isComplete()) {
    // 自动保存会话
    this.saveSession();
  }
});
```

## 最佳实践

### 1. 使用 computed 派生状态

```typescript
// ✅ 正确
const isValid = computed(() => store.currentAnswer().length > 0);

// ❌ 错误 - 不必要的状态
isValid = false;
updateIsValid() {
  this.isValid = this.currentAnswer.length > 0;
}
```

### 2. 避免在 effect 中修改状态

```typescript
// ✅ 正确
effect(() => {
  if (store.hasError()) {
    this.showError(store.errorMessage());
  }
});

// ❌ 错误 - 可能导致无限循环
effect(() => {
  store.updateSomeState(store.someValue());
});
```

### 3. 组合多个 stores

```typescript
// 使用多个 store 的组合
export class AppComponent {
  sessionStore = inject(SessionStore);
  okrStore = inject(OKRStore);

  // 组合状态
  hasActiveSession = computed(() => this.sessionStore.activeSession() !== null);

  hasActiveOKR = computed(() => this.okrStore.currentOKR() !== null);
}
```

## 调试工具

### 使用 Angular DevTools

Signals 与 Angular DevTools 完美集成，可以：

- 查看 Signals 的当前值
- 跟踪依赖关系
- 监控变化

### 日志记录

```typescript
// 在开发模式下启用日志
if (isDevMode()) {
  effect(() => {
    console.log('Store state:', {
      answers: store.answers(),
      currentQuestion: store.currentQuestion(),
      isComplete: store.isComplete(),
    });
  });
}
```

## 故障排除

### 状态不更新

**问题**: Signals 值不更新

**解决**:

1. 确保在 Signals 的上下文中读取值
2. 检查是否正确调用了 update 方法
3. 使用 untracked 避免不必要的依赖

```typescript
// ✅ 正确 - 在 Signal 上下文中
const value = store.someValue();

// ❌ 错误 - 直接访问属性
const value = store.someValue; // 缺少 ()
```

### 无限循环

**问题**: effect 导致无限循环

**解决**:

1. 确保 effect 不修改它依赖的 Signals
2. 使用 untracked 跳过某些依赖

```typescript
import { untracked } from '@angular/core';

effect(() => {
  const tracked = store.trackedValue();
  const untracked = untracked(() => store.untrackedValue());

  // 使用 untracked 避免循环
  if (untracked) {
    store.updateTracked(tracked);
  }
});
```

## 性能考虑

### Signals 的优势

- **细粒度响应**: 只更新必要的 UI 部分
- **自动依赖跟踪**: 无需手动订阅
- **更好的 Change Detection**: 配合 OnPush 策略

### 优化建议

```typescript
// 使用 computed 缓存计算结果
const expensiveComputation = computed(() => {
  return store.items().map(item => heavyTransform(item));
});

// 避免在模板中重复计算
// ✅ 正确 - 使用 computed
<div>{{ expensiveComputation() }}</div>

// ❌ 错误 - 每次变更检测都重新计算
<div>{{ items().map(item => heavyTransform(item)) }}</div>
```

## 参考资源

- [Angular Signals 文档](https://angular.io/guide/signals)
- [RxJS 迁移到 Signals](https://angular.io/guide/rxjs-interop)
- [ClarityOKR Architecture](./architecture/atomic-persistence.md)
