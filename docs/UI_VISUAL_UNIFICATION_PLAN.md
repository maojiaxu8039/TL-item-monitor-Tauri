# TL Item Monitor UI Visual Unification Plan

> Purpose: this document is both a product/design plan and an implementation contract for future AI agents.  
> Scope: React/Vite/Tauri frontend under `src/components`, `src/app`, and `src/index.css`.  
> Goal: make the app feel like one coherent desktop data workstation without rewriting business logic.

## 1. Current Diagnosis

The app already has a good base direction: light gray workspace, white panels, blue primary actions, compact desktop density, Lucide icons, Recharts, TanStack Table, and a small local UI layer in `src/components/ui`.

The main issue is not the overall taste. The issue is visual drift:

- Page wrappers are inconsistent. `App.tsx` already adds `main` padding, but many pages add their own `p-6`, causing uneven page edges and visual center.
- Cards, buttons, tabs, filters, empty states, and dialogs are repeatedly hand-written per page.
- There are two toast systems: `sonner` and `ToastContainer`.
- Focus states differ across components and pages. The sidebar can show an orange browser focus outline while the selected state is blue.
- Semantic color use is inconsistent. Blue, amber, green, red, purple, and orange are sometimes used as page brands, sometimes as statuses, sometimes as primary actions.
- Some debug/error details are displayed inside toolbars, for example item compare errors in the filter row.
- Heading scale and page header structure vary by page.

Useful evidence from the current codebase:

- Local UI primitives exist in `src/components/ui`: `Button`, `Input`, `Select`, `Dialog`, `Card`, `ConfirmDialog`, `DangerButton`, `ToastContainer`.
- `Card` and `Button` are present but many pages still use raw `button` and raw `bg-white rounded-* border ...` containers.
- Repeated style patterns are concentrated in `ArbitragePage`, `SettingsPage`, `StrategiesPage`, `ItemsPage`, `FirePriceComparePage`, `DataMonitorPage`, `AlertsPage`, `PriceAnalysisPage`, and `ImportExportPage`.

## 2. Target Visual Direction

The product should read as a compact market monitoring workstation:

- Calm, operational, information-dense.
- White panels on a light neutral canvas.
- Blue is the primary interaction color.
- Orange/red is reserved for brand flame, fire price, rising price, and sell/opportunity alerts.
- Green is reserved for success, low/down, bargain, or buy-side opportunity.
- Amber is warning only.
- Purple is AI/expert/advanced only.

Avoid a marketing-site feel. No decorative hero layouts, no oversized cards, no ornamental backgrounds. The first screen should remain the actual working UI.

## 3. Design Tokens

Centralize these in `src/index.css` and use them through Tailwind-compatible utility classes or small component variants.

### 3.1 Colors

Recommended semantic palette:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-app-bg` | `#f7f8fb` | App canvas background |
| `--color-panel` | `#ffffff` | Panel/card backgrounds |
| `--color-border` | `#e2e8f0` | Default borders |
| `--color-border-soft` | `#eef2f7` | Hover/soft borders |
| `--color-text` | `#0f172a` | Primary text |
| `--color-text-muted` | `#64748b` | Secondary text |
| `--color-text-subtle` | `#94a3b8` | Tertiary text |
| `--color-primary` | `#2563eb` | Primary actions |
| `--color-primary-soft` | `#eff6ff` | Primary soft backgrounds |
| `--color-brand` | `#f97316` | Brand/flame icon |
| `--color-danger` | `#ef4444` | Rising price/sell |
| `--color-success` | `#22c55e` | Down price/bargain/success |
| `--color-warning` | `#f59e0b` | Warning only |
| `--color-ai` | `#8b5cf6` | AI/expert only |

Semantic use:

- Primary buttons, selected navigation, active filters: blue.
- Brand icon only: orange/red flame.
- Price up/sell/opportunity: **red** (符合A股习惯)
- Price down/bargain/success: **green**
- Warnings and attention required: amber.
- AI page/gateway: purple, but keep primary actions blue unless the action is AI-specific.

### 3.2 Radius

Use only these radii unless a component has a strong reason:

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Small badges, table pills |
| `--radius-md` | `8px` | Buttons, inputs, selects, tabs, table rows |
| `--radius-lg` | `10px` | Regular cards/panels |
| `--radius-xl` | `12px` | Dialogs and large panels |

Current project uses many `rounded-xl` and some `rounded-2xl`. Consolidate most normal cards to `rounded-lg` or a token-backed `rounded-[var(--radius-lg)]`.

### 3.3 Shadows

Desktop data apps should be quiet. Prefer borders over shadows.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Default subtle shadow |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Floating elements |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dropdowns/dialogs |

Rules:
- Default panel: `border`, no visible shadow or very subtle `shadow-sm`.
- Floating dropdown/dialog: `shadow-lg`.
- Avoid custom shadows like `shadow-[0_1px_3px_rgba(...)]` in page files. Put them behind component variants.
- Avoid hover shadow on every card. Only interactive cards should change on hover.

### 3.4 Spacing

Page and panel spacing should be predictable:

| Token | Value | Usage |
|-------|-------|-------|
| Page vertical rhythm | `space-y-5` (20px) | Between sections |
| Header to first panel | `16px` or `20px` | Page header spacing |
| Panel padding (dense) | `16px` | Dense data panels |
| Panel padding (form) | `20px` | Form layouts |
| Metric card padding | `16px` | Dashboard metrics |
| Table cell padding | `12px 16px` | Table rows |

### 3.5 Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | `18px` | `font-semibold` | slate-900 |
| Page subtitle | `12px` | - | slate-400 |
| Section title | `14px` | `font-semibold` | slate-700/800 |
| Card metric (primary) | `24px` | `font-bold` | slate-900 |
| Card metric (secondary) | `20px` | `font-bold` | slate-700 |
| Table and controls | `13px` or `14px` | - | slate-600 |
| Footer/legal text | `11px` | - | slate-400 |

Do not use `text-2xl` for normal internal pages.

## 4. Component Architecture

### 4.1 Component Hierarchy

```
src/components/ui/
├── button.tsx           # 按钮组件
├── input.tsx            # 输入框组件
├── select.tsx           # 选择器组件
├── dialog.tsx           # 对话框组件
├── Card.tsx             # 卡片组件
├── confirm-dialog.tsx    # 确认对话框
├── danger-button.tsx    # 危险操作按钮
├── Toast.tsx            # Toast通知
│
├── PageShell.tsx        # 📌 页面容器 (NEW)
├── PageHeader.tsx       # 📌 页面头部 (NEW)
├── Surface.tsx          # 📌 面板容器 (NEW)
├── MetricCard.tsx      # 📌 指标卡片 (NEW)
├── StatusBadge.tsx      # 📌 状态徽章 (NEW)
├── EmptyState.tsx       # 📌 空状态 (NEW)
├── Toolbar.tsx          # 📌 工具栏 (NEW)
├── FormField.tsx        # 📌 表单字段 (NEW)
├── InlineAlert.tsx      # 📌 内联警告 (NEW)
└── SegmentedControl.tsx # 📌 分段控制 (NEW)
```

### 4.2 Core Components

#### PageShell

Purpose: standardize max width, page spacing, and optional full-height layout.

```tsx
interface PageShellProps {
  children: React.ReactNode;
  size?: "md" | "lg" | "xl" | "full";
  className?: string;
}
```

Rules:
- `md`: settings/import/help pages, max width around `672px`.
- `lg`: forms and moderate content, max width around `960px`.
- `xl`: most analytical data pages, max width around `1152px`.
- `full`: pages that need the full workstation area.

#### PageHeader

Purpose: standardize page title, subtitle, icon tile, and actions.

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ElementType;
  iconBg?: string;      // e.g., "bg-blue-50"
  iconColor?: string;   // e.g., "text-blue-500"
  actions?: ReactNode;
  className?: string;
}
```

Rules:
- Always use `h1` for title.
- Icon tile size: `40px`.
- Title: `text-lg font-semibold`.
- Description: `text-xs text-slate-400`.
- Header actions use `Button`, not raw `button`.

#### Surface

Purpose: one wrapper for white bordered UI blocks.

```tsx
interface SurfaceProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}
```

Usage:
```tsx
// Basic
<Surface padding="md">
  Content here
</Surface>

// Interactive (hover effect)
<Surface padding="sm" interactive>
  Clickable content
</Surface>

// No padding
<Surface padding="none" className="overflow-hidden">
  Table content
</Surface>
```

#### MetricCard

Purpose: unify dashboard metric cards.

```tsx
interface MetricCardProps {
  label: string;           // Metric label
  value: string | number;   // Metric value
  icon?: ElementType;
  iconBg?: string;          // Icon background
  iconColor?: string;        // Icon color
  helper?: ReactNode;        // Helper text/additional info
  className?: string;
}
```

Usage:
```tsx
<MetricCard
  label="监控物品"
  value={123}
  icon={Package}
  iconBg="bg-blue-50"
  iconColor="text-blue-500"
  helper={<span className="text-xs text-slate-400">个</span>}
/>
```

#### StatusBadge

Purpose: unify all pills/status labels.

```tsx
interface StatusBadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "primary";
  size?: "sm" | "md";
  className?: string;
}
```

Variants:
| Variant | Background | Text | Usage |
|---------|------------|------|-------|
| `default` | slate-100 | slate-700 | Default state |
| `success` | green-50 | green-700 | Success, down price |
| `warning` | amber-50 | amber-700 | Warning |
| `danger` | red-50 | red-700 | Rising price, error |
| `info` | blue-50 | blue-700 | Information |
| `primary` | slate-900 | white | Primary action |

#### EmptyState

Purpose: unify empty states across dashboard, tables, analysis pages, and config pages.

```tsx
interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ElementType;
  action?: ReactNode;
  className?: string;
}
```

Usage:
```tsx
<EmptyState
  title="暂无数据"
  description="请先在数据监控页面同步物品数据"
  icon={Package}
/>
```

### 4.3 Semantic Color Rules

#### Price Display

| Scenario | Color | Example |
|----------|-------|---------|
| 价格上涨 | `text-red-500` / `text-red-600` | +5.2% |
| 价格下跌 | `text-green-500` / `text-green-600` | -3.1% |
| 暴涨/暴跌标签 | `StatusBadge variant="danger"` (涨) / `StatusBadge variant="success"` (跌) | 暴涨、暴跌 |
| 出货机会 | 红色边框 + 红色图标 | FireChangeCard |
| 捡漏机会 | 绿色边框 + 绿色图标 | FireChangeCard |

#### Score Display

| Score Range | Color | Meaning |
|-------------|-------|---------|
| 80-100 | `text-red-600` | 高分，推荐 |
| 60-79 | `text-orange-600` | 中高分 |
| 40-59 | `text-yellow-600` | 中等 |
| 0-39 | `text-green-600` | 低分 |

#### Trend Indicators

```tsx
// Rising
<TrendingUp className="text-red-500" />

// Falling
<TrendingDown className="text-green-500" />

// Arrow indicators
<span className={isUp ? "text-red-500" : "text-green-500"}>
  {isUp ? "↑" : "↓"}
</span>
```

### 4.4 Component Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| `PageShell` | ✅ Implemented | Core layout component |
| `PageHeader` | ✅ Implemented | Standard page header |
| `Surface` | ✅ Implemented | Card/panel wrapper |
| `MetricCard` | ✅ Implemented | Dashboard stats |
| `StatusBadge` | ✅ Implemented | Status pills |
| `EmptyState` | ✅ Implemented | No-data states |
| `Toolbar` | ✅ Implemented | Filter/action bars |
| `FormField` | ✅ Implemented | Form labels |
| `InlineAlert` | ✅ Implemented | Error/warning display |
| `SegmentedControl` | ⏳ Pending | Tab controls |

## 5. Page Migration Status

### 5.1 Completed Pages ✅

| Page | Components Used | Notes |
|------|----------------|-------|
| `DealsPage.tsx` | PageShell, PageHeader, Surface, StatusBadge, EmptyState | Rising=fail, falling=green |
| `DashboardStats.tsx` | MetricCard, StatusBadge | Color logic fixed |
| `ItemsPage.tsx` | PageShell, PageHeader, MetricCard, Surface, Toolbar | All price colors correct |
| `DataMonitorPage.tsx` | PageShell, PageHeader, Surface, StatusBadge | Server status cards |
| `ArbitragePage.tsx` | PageShell, PageHeader, Surface, MetricCard | Calculator page |
| `StrategiesPage.tsx` | PageShell, PageHeader, Surface | Strategy management |
| `AlertsPage.tsx` | PageShell, PageHeader, Surface, StatusBadge | Alert rules |
| `SettingsPage.tsx` | PageShell, PageHeader, Surface, StatusBadge | Dense settings |

### 5.2 Pending Pages ⏳

| Page | Priority | Notes |
|------|----------|-------|
| `PriceAnalysisPage.tsx` | Medium | Analysis filters |
| `AIAnalysisPage.tsx` | Medium | Chat interface |
| `ImportExportPage.tsx` | Low | Import/export |
| `HelpPage.tsx` | Low | Help docs |
| `FirePriceComparePage.tsx` | High | Chart page |

## 6. Implementation Phases

### Phase 1: Foundation (Completed ✅)
- Created UI components in `src/components/ui/`
- Implemented design tokens in `src/index.css`
- Added color semantic rules

### Phase 2: High-Visibility Pages (Completed ✅)
- Dashboard home
- Items page
- Data Monitor
- Deals page

### Phase 3: Workflow Pages (Completed ✅)
- Strategies page
- Arbitrage page
- Alerts page
- Settings page

### Phase 4: Secondary Pages (Pending ⏳)
- Price Analysis
- AI Analysis
- Import/Export
- Help
- Fire Price Compare

## 7. Verification Checklist

After each page migration, verify:

- [ ] Uses `PageShell`
- [ ] Uses `PageHeader`
- [ ] Primary actions use `Button`
- [ ] Status labels use `StatusBadge`
- [ ] Empty states use `EmptyState`
- [ ] Filter/action rows use `Toolbar`
- [ ] Rising price uses red, falling price uses green
- [ ] No debug text in normal UI
- [ ] Colors follow semantic rules
- [ ] `npm run typecheck` passes

## 8. Common Patterns

### 8.1 Page Structure

```tsx
export default function PageName() {
  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="页面标题"
        description="页面描述"
        icon={IconName}
        iconBg="bg-blue-50"
        iconColor="text-blue-500"
        actions={
          <ToolbarActions>
            <Button variant="default" size="sm" onClick={handler}>
              <Icon className="w-4 h-4 mr-1.5" />
              操作
            </Button>
          </ToolbarActions>
        }
      />
      
      <Surface padding="md">
        {/* Content */}
      </Surface>
      
      <Surface padding="none" className="overflow-hidden">
        {/* Table or list */}
      </Surface>
    </PageShell>
  );
}
```

### 8.2 Color Usage Examples

```tsx
// Price change display
const isRising = change > 0;
<span className={isRising ? "text-red-500" : "text-green-500"}>
  {isRising ? "↑" : "↓"}{Math.abs(change).toFixed(1)}%
</span>

// Trend badge
<StatusBadge variant={isRising ? "danger" : "success"}>
  {isRising ? "上涨" : "下跌"}
</StatusBadge>

// Score display
<div className={`text-xl font-bold ${
  score >= 80 ? "text-red-600" :
  score >= 60 ? "text-orange-600" :
  score >= 40 ? "text-yellow-600" :
  "text-green-600"
}`}>
  {score}
</div>
```

### 8.3 Interactive Card

```tsx
<Surface interactive padding="sm" className="hover:shadow-md">
  <div className="...">
    Content
  </div>
</Surface>
```

## 9. Migration Guide

### Before: Raw Page

```tsx
return (
  <div className="p-6 space-y-5 max-w-6xl mx-auto">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-xl bg-blue-100">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <div>
        <h1 className="text-xl font-bold">标题</h1>
        <p className="text-xs text-slate-400">描述</p>
      </div>
    </div>
    
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      Content
    </div>
  </div>
);
```

### After: Unified Components

```tsx
return (
  <PageShell size="xl" className="space-y-5">
    <PageHeader
      title="标题"
      description="描述"
      icon={Icon}
      iconBg="bg-blue-50"
      iconColor="text-blue-500"
    />
    
    <Surface padding="lg">
      Content
    </Surface>
  </PageShell>
);
```

## 10. Document Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-13 | v2.0 | Added implementation status, color rules, page migration tracking |
| 2026-05-06 | v1.0 | Initial document creation |
