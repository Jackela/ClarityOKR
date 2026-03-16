# ClarityOKR Design System

## 设计令牌 (Design Tokens)

所有设计令牌定义在 `app/renderer/src/styles/tokens.css` 文件中，包括：

### 颜色系统

- `--color-primary`: 主色调 (#2563eb)
- `--color-primary-hover`: 主色悬停态 (#1d4ed8)
- `--color-error`: 错误色 (#dc2626)
- `--color-success`: 成功色 (#0f766e)
- `--color-background`: 背景色 (#f3f4ff)
- `--color-surface`: 表面色 (white)
- `--color-text`: 主文本色 (#0f172a)
- `--color-text-muted`: 次要文本色

### 间距系统

- `--space-xs`: 0.25rem
- `--space-sm`: 0.5rem
- `--space-md`: 0.75rem
- `--space-lg`: 1rem
- `--space-xl`: 1.5rem
- `--space-2xl`: 1.75rem
- `--space-3xl`: 2rem

### 排版系统

- `--font-family`: 系统字体栈
- `--font-size-sm`: 0.875rem
- `--font-size-md`: 0.9rem
- `--font-size-base`: 1rem
- `--font-size-lg`: 1.125rem

### 圆角系统

- `--radius-sm`: 0.5rem
- `--radius-md`: 0.75rem
- `--radius-lg`: 0.85rem
- `--radius-xl`: 1rem
- `--radius-2xl`: 1.25rem
- `--radius-full`: 999px (圆形)

### 阴影系统

- `--shadow-xs`: 0 1px 2px rgba(0, 0, 0, 0.05)
- `--shadow-sm`: 0 4px 6px rgba(0, 0, 0, 0.1)
- `--shadow-md`: 0 8px 16px rgba(37, 99, 235, 0.1)
- `--shadow-lg`: 0 12px 24px rgba(37, 99, 235, 0.2)
- `--shadow-xl`: 0 24px 48px rgba(15, 23, 42, 0.08)

### 过渡效果

- `--transition-fast`: 120ms ease
- `--transition-normal`: 150ms ease
- `--transition-slow`: 250ms ease

---

## 可复用组件

### Button 组件

```typescript
import { ButtonComponent } from './shared/components';

@Component({
  imports: [ButtonComponent]
})
```

**用法：**

```html
<!-- 默认主按钮 -->
<clarityokr-button>点击我</clarityokr-button>

<!-- 变体 -->
<clarityokr-button variant="primary">主要</clarityokr-button>
<clarityokr-button variant="secondary">次要</clarityokr-button>
<clarityokr-button variant="danger">危险</clarityokr-button>
<clarityokr-button variant="ghost">幽灵</clarityokr-button>

<!-- 尺寸 -->
<clarityokr-button size="sm">小</clarityokr-button>
<clarityokr-button size="md">中</clarityokr-button>
<clarityokr-button size="lg">大</clarityokr-button>

<!-- 禁用状态 -->
<clarityokr-button [disabled]="true">禁用</clarityokr-button>

<!-- 测试ID -->
<clarityokr-button testId="submit-btn">提交</clarityokr-button>
```

**属性：**

- `variant`: 'primary' | 'secondary' | 'danger' | 'ghost' (默认: 'primary')
- `size`: 'sm' | 'md' | 'lg' (默认: 'md')
- `disabled`: boolean (默认: false)
- `testId`: string (可选)

**事件：**

- `onClick`: MouseEvent

---

### Input 组件

```typescript
import { InputComponent } from './shared/components';

@Component({
  imports: [InputComponent]
})
```

**用法：**

```html
<!-- 基础用法 -->
<clarityokr-input [(ngModel)]="value"></clarityokr-input>

<!-- 带占位符 -->
<clarityokr-input [(ngModel)]="value" placeholder="请输入..."> </clarityokr-input>

<!-- 验证状态 -->
<clarityokr-input [(ngModel)]="value" [invalid]="form.invalid" errorMessage="此项必填">
</clarityokr-input>

<!-- 禁用状态 -->
<clarityokr-input [disabled]="true"></clarityokr-input>
```

**属性：**

- `placeholder`: string (默认: '')
- `disabled`: boolean (默认: false)
- `invalid`: boolean (默认: false)
- `errorMessage`: string (默认: '')
- `testId`: string (可选)

**实现说明：**

- 实现了 `ControlValueAccessor` 接口，可与 `ngModel` 和响应式表单一起使用

---

### Card 组件

```typescript
import { CardComponent } from './shared/components';

@Component({
  imports: [CardComponent]
})
```

**用法：**

```html
<!-- 默认卡片 (elevated 样式) -->
<clarityokr-card>
  <h3>卡片标题</h3>
  <p>卡片内容</p>
</clarityokr-card>

<!-- 变体 -->
<clarityokr-card variant="default"> 默认阴影 </clarityokr-card>

<clarityokr-card variant="elevated"> 提升阴影 (默认) </clarityokr-card>

<clarityokr-card variant="outlined"> 边框样式 </clarityokr-card>

<!-- 间距 -->
<clarityokr-card padding="sm">小间距</clarityokr-card>
<clarityokr-card padding="md">中间距</clarityokr-card>
<clarityokr-card padding="lg">大间距 (默认)</clarityokr-card>
<clarityokr-card padding="xl">超大间距</clarityokr-card>
```

**属性：**

- `variant`: 'default' | 'elevated' | 'outlined' (默认: 'elevated')
- `padding`: 'sm' | 'md' | 'lg' | 'xl' (默认: 'lg')

---

### LoadingSpinner 组件

```typescript
import { LoadingSpinnerComponent } from './shared/components';

@Component({
  imports: [LoadingSpinnerComponent]
})
```

**用法：**

```html
<!-- 默认加载器 -->
<clarityokr-loading-spinner></clarityokr-loading-spinner>

<!-- 带消息 -->
<clarityokr-loading-spinner message="正在加载..."></clarityokr-loading-spinner>

<!-- 不同尺寸 -->
<clarityokr-loading-spinner size="sm"></clarityokr-loading-spinner>
<clarityokr-loading-spinner size="md"></clarityokr-loading-spinner>
<clarityokr-loading-spinner size="lg"></clarityokr-loading-spinner>
```

**属性：**

- `size`: 'sm' | 'md' | 'lg' (默认: 'md')
- `message`: string (可选)

---

## 迁移指南

### 从硬编码值迁移到设计令牌

**之前：**

```css
.custom-element {
  padding: 1.5rem;
  background: #fff;
  border-radius: 1.25rem;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
}
```

**之后：**

```css
.custom-element {
  padding: var(--space-xl);
  background: var(--color-surface);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}
```

### 按钮替换

**之前：**

```html
<button class="intent-submit">提交</button>
```

**之后：**

```html
<clarityokr-button variant="primary" size="lg">提交</clarityokr-button>
```

---

## 文件结构

```
app/renderer/src/
├── styles/
│   ├── tokens.css          # 设计令牌
│   └── ...
├── styles.css              # 全局样式 (导入 tokens.css)
└── app/
    └── shared/
        └── components/
            ├── index.ts                    # 导出所有组件
            ├── button.component.ts         # 按钮组件
            ├── input.component.ts          # 输入框组件
            ├── card.component.ts           # 卡片组件
            └── loading-spinner.component.ts # 加载组件
```

---

## 最佳实践

1. **始终使用设计令牌**：避免在组件中使用硬编码的值
2. **保持一致性**：同一类型的元素使用相同的变体和尺寸
3. **响应式优先**：组件默认是响应式的，不需要额外处理
4. **可访问性**：所有组件都支持键盘导航和屏幕阅读器
