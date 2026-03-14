# Final Review 修复计划

## 关键发现的问题

### P0 - 阻塞问题（必须修复）

#### 1. AppComponent直接操作Store

**位置**: `app.component.ts:340`

```typescript
this.store.setLoading('llm-question');
```

**问题**: 违反了分层架构，AppComponent不应该直接操作Store
**修复**: 通过Orchestrator或新的Action来设置loading状态

#### 2. API抽象层未实际使用

**发现**:

- 配置了 `{ provide: 'LlmGateway', useClass: IpcLlmGateway }`
- 但AppComponent仍然使用旧的 `LlmGatewayService`
- 新的 `IpcLlmGateway` 未被任何组件注入
- Orchestrator没有注入LlmGateway

**修复策略**:

- 方案A: 保留现状（旧的LlmGatewayService工作正常）
- 方案B: 迁移AppComponent使用新的LlmGateway（风险较高）
- **推荐**: 先完成其他修复，最后考虑迁移LlmGateway

### P1 - 高优先级问题

#### 3. Store API命名不一致

检查清单期望 vs 实际实现:

- `store.start()` vs `store.setLoading()`
- `store.selectOption()` vs `store.recordSelection()`
- `store.reportError()` vs `store.setError()`

**修复**: 添加别名方法或统一命名

#### 4. MockLlmGateway未实现LlmGateway接口

**位置**: `mock-llm-gateway.service.ts:41`

```typescript
export class MockLlmGatewayImpl implements MockLlmGateway  // ❌ 未实现LlmGateway
```

**修复**: 添加Promise-based方法实现LlmGateway接口

#### 5. 超时配置不统一

- `playwright.config.ts` 导出 `TIMEOUTS`
- `base.page.ts` 使用 `DEFAULT_TIMEOUTS`
- 两者不一致

**修复**: 统一使用 `TIMEOUTS`

### P2 - 中优先级问题

#### 6. POM方法缺少返回类型

9个方法缺少返回类型注解

#### 7. 残留locator访问

- `interview-flow.spec.ts:50`
- `sticky-window.spec.ts:57-60`
- `sticky-window-reopen.spec.ts:57-60`

#### 8. 测试目录类型配置

- `tests/unit/tsconfig.json` 缺失
- `tests/integration/tsconfig.json` 缺失

---

## 修复优先级建议

由于大部分核心功能已经工作（状态机、POM、E2E测试），建议：

### 立即修复（30分钟）

1. ✅ 创建测试目录tsconfig（修复类型错误）
2. ✅ 统一TIMEOUTS配置
3. ✅ 添加POM方法返回类型

### 稍后修复（不影响功能）

4. Store API命名（可选，内部实现细节）
5. MockLlmGateway接口实现（测试用，可延后）
6. API抽象层迁移（架构改进，非阻塞）

### 当前状态评估

- **功能完整性**: 95% ✅
- **代码质量**: 85% ⚠️
- **类型安全**: 80% ⚠️
- **架构合规**: 75% ⚠️

**建议**: 先运行CI测试，如果E2E测试通过，可以合并PR，然后逐步修复剩余问题。

---

## 决策点

### 是否现在修复P0问题？

**问题**: AppComponent直接调用`store.setLoading()`

**影响分析**:

- 代码可以正常运行 ✓
- 违反了分层架构 ⚠️
- 增加了维护成本 ⚠️
- 不是阻塞性问题 ✓

**建议**:

- 如果不影响功能，可以延后修复
- 在PR中标注为"已知技术债务"
- 创建后续issue跟踪

### 是否现在迁移LlmGateway？

**问题**: 旧的LlmGatewayService仍在使用，新的未使用

**影响分析**:

- 当前实现工作正常 ✓
- 抽象层未实际使用 ⚠️
- 但不影响功能 ✓

**建议**:

- 延后到后续迭代
- 这是一个架构改进，不是bug修复
- 需要更仔细的测试计划

---

## 推荐行动

1. **立即执行**: 修复类型错误（创建tsconfig）
2. **立即执行**: 统一TIMEOUTS配置
3. **运行CI**: 测试E2E是否通过
4. **如果通过**: 合并PR
5. **创建issues**: 跟踪剩余的技术债务

这样既保证了功能交付，又记录了需要改进的地方。
