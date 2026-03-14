# ClarityOKR 完整重构计划

## 项目目标

彻底重构ClarityOKR项目，实现：

- ✅ 所有E2E测试通过
- ✅ 代码低耦合高内聚
- ✅ AI友好（清晰架构、易于理解）
- ✅ 生产级质量

## 架构问题根因

### 1. 状态管理混乱

- ComponentStore有7种workflow states，转换规则复杂
- `setPrompt`方法内部有复杂的状态推导逻辑
- 难以预测特定操作后的状态

### 2. HTTP位置导致的测试复杂性

- HTTP请求在Electron Main Process中发起
- Playwright无法直接拦截
- 需要复杂的mock server设置

### 3. 服务层与IPC紧耦合

- 直接依赖全局`window`对象
- 无法在不启动Electron的情况下单元测试
- 服务与具体的IPC实现绑定

### 4. E2E测试架构缺陷

- 缺乏Page Object Model
- 魔法数字满天飞（timeout不一致）
- 测试间数据污染
- 完全串行执行（workers=1）

## 重构策略（分层递归Subagent模式）

### 第一层：Orchestrator（我）

- 制定主计划
- Dispatch 4个Feature Agents
- 协调依赖关系
- 最终整合和验证

### 第二层：Feature Agents（并行执行）

#### Agent A: 状态管理重构（Phase 2）

**Scope**: `app/renderer/src/app/clarification/state/`
**Task**: 重构为显式状态机

TDD循环：

1. RED: 编写状态机转换测试
2. GREEN: 实现reducer函数
3. REFACTOR: 优化状态推导逻辑

Deliverable:

- 新的状态机实现
- 完整的单元测试
- 向后兼容的Store API

#### Agent B: API抽象层（Phase 3）

**Scope**: `app/renderer/src/app/clarification/services/`
**Task**: 引入LlmGateway抽象接口

TDD循环：

1. RED: 编写接口契约和mock实现测试
2. GREEN: 实现IpcLlmGateway和MockLlmGateway
3. REFACTOR: 优化依赖注入配置

Deliverable:

- LlmGateway接口定义
- 生产实现（IPC）
- Mock实现（测试）
- 依赖注入配置

#### Agent C: Page Object Model（Phase 4）

**Scope**: `tests/e2e/page-objects/`
**Task**: 创建完整的POM层

TDD循环：

1. RED: 编写POM单元测试
2. GREEN: 实现ClarificationPage和OkrStickyPage
3. REFACTOR: 提取通用组件

Deliverable:

- BasePage抽象类
- ClarificationPage
- OkrStickyPage
- 通用组件（Loading、ErrorMessage）

#### Agent D: E2E测试架构重构（Phase 5）

**Scope**: `tests/e2e/`
**Task**: 重构fixtures、优化配置、迁移测试

TDD循环：

1. RED: 使用新POM重写一个测试
2. GREEN: 确保测试通过
3. REFACTOR: 提取通用模式，迁移所有测试

Deliverable:

- 新的fixtures架构
- 统一超时配置
- 重构后的所有spec文件
- CI/CD配置优化

### 第三层：Specialist Agents（递归调用）

每个Feature Agent可以dispatch:

- **Test-First Specialist**: 分析需求，编写测试
- **Implementation Specialist**: 实现功能代码
- **Refactor Specialist**: 代码质量优化
- **Integration Specialist**: 组件集成

## 依赖关系

```
Phase 2 (状态机) ──┐
                   ├──► Phase 5 (E2E重构)
Phase 3 (API层) ───┤
                   │
Phase 4 (POM) ─────┘
```

Phase 2和Phase 3可以并行
Phase 4可以部分并行
Phase 5必须在2、3、4完成后

## 实施路线图

### 阶段1: 准备（当前）

- [x] 评估完成
- [ ] 创建计划文档
- [ ] 设置git工作流

### 阶段2: 状态管理重构（2-3天）

- [ ] 定义状态和事件类型
- [ ] 实现reducer函数
- [ ] 迁移Store使用新reducer
- [ ] 更新组件和服务
- [ ] 废弃旧代码

### 阶段3: API抽象层（2-3天）

- [ ] 创建LlmGateway接口
- [ ] 实现IpcLlmGateway
- [ ] 实现MockLlmGateway
- [ ] 配置依赖注入
- [ ] 迁移单元测试

### 阶段4: Page Object Model（1-2天）

- [ ] 创建BasePage
- [ ] 实现ClarificationPage
- [ ] 实现OkrStickyPage
- [ ] 创建通用组件

### 阶段5: E2E架构重构（2天）

- [ ] 重构fixtures
- [ ] 统一超时配置
- [ ] 迁移所有spec文件
- [ ] 优化CI/CD

### 阶段6: 验证（1天）

- [ ] 运行全量测试
- [ ] 修复剩余问题
- [ ] 性能基准测试
- [ ] 最终审查

## 质量保证门禁

### 每个Phase必须通过：

- [ ] 所有单元测试通过
- [ ] 类型检查通过（TypeScript strict）
- [ ] Lint通过
- [ ] 代码审查通过

### 最终验收标准：

- [ ] 所有E2E测试通过
- [ ] CI/CD通过
- [ ] 测试覆盖率 > 80%
- [ ] 代码复杂度 < 10
- [ ] 无类型错误
- [ ] 文档更新

## 风险管理

| 风险               | 概率 | 影响 | 缓解措施                  |
| ------------------ | ---- | ---- | ------------------------- |
| 重构引入regression | 中   | 高   | 每Phase都有完整测试       |
| 时间超预期         | 中   | 中   | 分Phase交付，可独立验收   |
| 依赖冲突           | 低   | 高   | 清晰的Phase边界和接口契约 |
| CI/CD中断          | 低   | 高   | 保持向后兼容的渐进式重构  |

## 下一步行动

1. 用户确认计划
2. 创建git feature分支
3. Dispatch Phase 2和Phase 3的Feature Agents
4. 监控进度，协调依赖

---

**开始重构？** 请确认计划，我将立即dispatch Feature Agents开始工作。
