# TorchScan UI 设计规则

> 版本：2026-05-14
> 适用范围：TorchScan Tauri 桌面端前端界面、品牌资产、图标资产、页面组件。
> 目标：将项目统一为"深色熔岩金属风"的桌面数据监控工作台，延续设计稿中的火焰、金色描边、暗色面板和紧凑工具软件气质。

## 1. 设计定位

TorchScan 是物价与火价监控工具，不是营销落地页。界面第一屏必须是可操作的数据工作台。

核心气质：

- 深色、克制、专业，保留游戏资产/火焰主题的辨识度。
- 信息密度高，适合长时间盯盘和快速扫描。
- 金色与火橙只用于品牌、激活态、重点价格和关键操作。
- UI 不做大面积装饰卡片，不做网页 Hero，不使用花哨渐变背景堆叠。

## 2. 品牌元素

品牌名：`TorchScan`

中文副标：

```text
火炬之光 · 无限 物价监控系统
```

品牌语义：

- 火焰：实时行情、价格变化、机会捕捉。
- 上升折线：价格趋势、市场监测。
- 金属金色：游戏道具、交易价值、稀有感。
- 暗色岩面：沉浸式桌面工具背景。

## 3. 色彩规范

当前色彩令牌定义在 `src/index.css`。

| Token | 色值 | 用途 |
| --- | --- | --- |
| `--color-app-bg` | `#0b0d10` | 应用主背景 |
| `--color-panel` | `#111418` | 卡片、面板、弹窗 |
| `--color-panel-soft` | `#171a1f` | 输入框、弱面板、悬停底色 |
| `--color-border` | `#2a2f36` | 默认边框 |
| `--color-border-soft` | `#1f242b` | 表格弱分隔线 |
| `--color-text` | `#e6e6e6` | 主文字 |
| `--color-text-muted` | `#9ca3af` | 次级文字 |
| `--color-text-subtle` | `#6f7782` | 弱提示文字 |
| `--color-brand` | `#ff6a00` | 火焰橙、主激活光效 |
| `--color-brand-gold` | `#ffb800` | 熔岩金、品牌标题、激活文字 |
| `--color-success` | `#22c55e` | 成功、低风险、正向状态 |
| `--color-danger` | `#ef4444` | 警告、危险操作、负向状态 |
| `--color-warning` | `#ffb800` | 注意、提示、关键提醒 |
| `--color-ai` | `#a78bfa` | AI / 高级分析相关状态 |

使用规则：

- 主背景必须保持深色，不要回到大面积白底。
- 金色不要铺满整个页面，只用于选中态、品牌、图标描边和关键数值。
- 表格、卡片和输入框用暗面板区分层级，优先靠边框而不是重阴影。
- 红绿只表示语义状态，不作为页面品牌色随意使用。

### 3.1 语义化颜色规则

| 场景 | 颜色 | 示例 |
| --- | --- | --- |
| 价格上涨（盈利） | `--color-danger` | +5.2% |
| 价格下跌（亏损） | `--color-success` | -3.1% |
| 暴涨标签 | `StatusBadge variant="danger"` | 暴涨 |
| 暴跌标签 | `StatusBadge variant="success"` | 暴跌 |
| 出货机会 | 红色边框 | FireChangeCard |
| 捡漏机会 | 绿色边框 | FireChangeCard |

## 4. 布局规则

### 4.1 应用壳层

当前壳层为：

- 顶部状态栏：`src/components/layout/TopBar.tsx`
- 左侧功能列表：`src/components/layout/Sidebar.tsx`
- 主内容区：`src/app/App.tsx`

布局规则：

- 顶部栏只放品牌、当前页面标题、赛季模式、当前火价、数据源、通知状态、刷新和窗口控制。
- 功能列表必须放在左侧栏，避免顶栏拥挤。
- 主内容区保持滚动，侧栏和顶栏固定在应用壳层中。
- 窗口使用无系统边框设计，顶部栏提供最小化、最大化、关闭按钮。

### 4.2 顶部栏

顶部栏高度：`70px`

必须包含：

- TorchScan logo 与品牌名。
- 当前页面标题。
- 赛季普通 / 赛季专家选择器。
- 当前火价状态胶囊。
- 刷新按钮。
- 网络/本地数据源状态。
- 通知状态。
- 设置、最小化、最大化、关闭。

不要在顶部栏放完整导航列表。

### 4.3 左侧栏

侧栏宽度：`218px`

收窄断点：`max-width: 980px` 时变为图标栏。

功能顺序：

1. 市场监控
2. 物品追踪
3. 价格分析
4. 捡漏出货
5. 提醒设置
6. 火价分析
7. 套利比价
8. 策略管理
9. AI分析
10. 数据监控
11. 导入导出
12. 设置
13. 帮助

侧栏规则：

- 每个入口必须使用独立图标资产，不使用临时手写 SVG。
- 激活项使用金色文字、火橙左侧光效和暗金背景。
- 悬停可轻微右移，但不能造成布局跳动。
- 低高度窗口允许侧栏内部滚动。
- 菜单项高度：`38px`，底部 logo 区域：`52px`

## 5. 图标与资产规则

### 5.1 资产目录

品牌资产位置：`src/public/torchscan`

独立图标位置：`src/public/torchscan/icons`

统一引用组件：`src/components/brand/AssetIcon.tsx`

### 5.2 图标命名

| 文件 | 用途 |
| --- | --- |
| `market-monitor.svg` | 市场监控 |
| `item-tracking.svg` | 物品追踪 |
| `price-analysis.svg` | 价格分析 |
| `deals.svg` | 捡漏出货 |
| `alerts.svg` | 提醒设置 |
| `fire-price.svg` | 火价分析 |
| `arbitrage.svg` | 套利比价 |
| `strategies.svg` | 策略管理 |
| `ai-analysis.svg` | AI 分析 |
| `data-monitor.svg` | 数据监控 |
| `import-export.svg` | 导入导出 |
| `settings.svg` | 设置 |
| `help.svg` | 帮助 |
| `window-minimize.svg` | 最小化 |
| `window-maximize.svg` | 最大化 |
| `window-close.svg` | 关闭 |
| `more-tools.svg` | 更多工具，保留备用 |
| `favorites.svg` | 收藏夹，保留备用 |

### 5.3 图标使用方式

推荐：

```tsx
<AssetIcon name="market-monitor" className="h-[18px] w-[18px]" />
```

不要：

- 在页面里重复写复杂 SVG。
- 用不同风格的 Lucide 图标替代侧栏主功能图标。
- 给图标加不同的随机颜色。
- 将图标拉伸为非等比尺寸。

## 6. 组件规则

### 6.1 统一 UI 组件

核心组件位置：`src/components/ui/`

| 组件 | 路径 | 用途 |
| --- | --- | --- |
| `PageShell` | `PageShell.tsx` | 页面容器，控制最大宽度 |
| `PageHeader` | `PageHeader.tsx` | 页面标题栏，含图标、标题、描述、操作按钮 |
| `Surface` | `Surface.tsx` | 面板容器，带品牌边框和阴影 |
| `MetricCard` | `MetricCard.tsx` | 指标卡片，含图标、数值、标签 |
| `StatusBadge` | `StatusBadge.tsx` | 状态徽章 |
| `EmptyState` | `EmptyState.tsx` | 空状态提示 |
| `LoadingState` | `LoadingState.tsx` | 统一加载状态组件 |
| `Toolbar` | `Toolbar.tsx` | 工具栏 |

### 6.2 Button

按钮组件位置：`src/components/ui/button.tsx`

规则：

- 主按钮使用火橙到金色渐变 `bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))]`。
- `outline` 用暗色面板和金色边框悬停。
- `ghost` 用于顶部栏图标按钮、表格轻操作。
- 危险操作用 `destructive` 或 `DangerButton`，不要只靠文字颜色表达危险。
- `destructive` 按钮文字使用黑色：`text-black`

### 6.3 Input / Select

输入控件位置：

- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`

规则：

- 背景使用 `--color-panel-soft`。
- 边框使用 `--color-border`。
- 聚焦态使用火橙 ring：`focus:ring-[var(--color-brand)]/30`。
- Placeholder 使用弱文字色。

### 6.4 Card / Surface

卡片与面板位置：

- `src/components/ui/Card.tsx`
- `src/components/ui/Surface.tsx`

规则：

- 默认圆角不超过 `8px`（`--radius-lg`）。
- 默认以边框建立层级，避免厚重投影。
- 可交互卡片悬停时允许金色边框与轻微 glow。
- 不要卡片套卡片。页面区块应是自然布局，卡片只用于独立数据项、表单面板、弹窗。

### 6.5 MetricCard

指标卡片位置：`src/components/ui/MetricCard.tsx`

规则：

- 一行通常 4 个指标卡。
- 标题小、数值大，便于扫描。
- 图标容器使用暗底和细金边。
- 火价、收益、风险必须使用语义颜色，不要全金色。

### 6.6 StatusBadge

状态徽章位置：`src/components/ui/StatusBadge.tsx`

规则：

- `success`：成功、低风险、可执行。
- `warning`：注意、观望、需确认。
- `danger`：风险、失败、删除。
- `info`：信息提示、同步中。
- `primary`：当前选中、关键状态。

### 6.7 LoadingState

统一加载状态组件位置：`src/components/ui/LoadingState.tsx`

规则：

- 深色面板、金色边框、品牌图标或小型火焰图标。
- 文案按场景变化，例如「正在加载市场数据」「正在同步服务器状态」。
- 避免全页面空白中只放一个灰色 spinner。

## 7. 页面设计规则

页面必须遵守：

- 不做欢迎页、说明页、营销页作为首页。
- 首页必须直接展示市场监控数据与操作。
- 每个页面尽量使用统一的 `Surface`、`MetricCard`、`Button`、`Input`、`Select`。
- 重要操作使用图标加文字；紧凑工具按钮可只用图标，但必须有 `title`。
- 表格行 hover 用弱金色底，不使用浅蓝。
- 页面背景不再使用白色或浅灰色大块。
- 页面标题与侧边栏保持一致（如侧边栏为"物品追踪"，页面标题也为"物品追踪"）

文字规则：

- 页面标题：顶部栏显示当前页面标题。
- 面板标题：`14px` 左右，半粗。
- 表格文字：`12px - 13px`。
- 指标数值：`24px` 左右，粗体。
- 不在界面里写"如何使用此功能"的长说明，帮助页除外。

## 8. 响应式规则

桌面优先，但必须兼容较窄窗口：

- `max-width: 1180px`：隐藏顶部副标题和部分状态文本。
- `max-width: 980px`：侧栏收缩为图标栏。
- 所有按钮文字必须不溢出容器。
- 固定格式元素必须有稳定尺寸，避免 hover 或加载状态导致布局跳动。

### 8.1 窗口尺寸验证

每轮调整后至少检查以下窗口尺寸：

- `1280x720`
- `1440x900`
- `1200x800`（接近 Tauri 默认窗口）

## 9. 动效规则

允许：

- 顶栏和侧栏进入时轻微淡入。
- 侧栏激活项使用 `layoutId` 做平滑移动。
- 刷新按钮加载时旋转。
- 悬停时轻微 glow 或边框变化。

禁止：

- 大面积粒子动画。
- 过强的 bokeh / 光球装饰。
- 页面切换时剧烈缩放。
- 导航项 hover 导致尺寸变化。

## 10. 禁止事项

不要做以下事情：

- 不要把功能列表重新塞回顶部栏。
- 不要恢复浅色主题作为默认主题。
- 不要混用多套图标风格。
- 不要让紫色、蓝色、绿色成为大面积品牌色。
- 不要使用大圆角胶囊堆满页面。
- 不要把普通页面做成宣传 Hero。
- 不要为了装饰添加大面积渐变球、光斑或无意义背景图。
- 不要在页面里写大量功能说明文字。

## 11. 开发规范

### 11.1 页面结构模板

```tsx
<PageShell size="xl" className="space-y-5">
  <PageHeader
    title="页面标题"
    description="页面描述"
    iconAsset="对应的图标名"
    actions={<ToolbarActions>操作按钮</ToolbarActions>}
  />

  <Surface padding="md">
    {/* 内容 */}
  </Surface>
</PageShell>
```

### 11.2 圆角规格

- 面板、卡片、弹窗主体：`8px`（`--radius-lg`）
- 标签、状态点、开关等功能性圆形元素：可保留 `full radius`
- 聊天气泡等特殊场景可单独保留较大圆角

### 11.3 滚动条样式

使用 `scrollbar-thin` 类统一滚动条样式：

```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 184, 0, 0.32) transparent;
}
```

## 12. 后续扩展建议

如果继续深入改造，可以按这个顺序推进：

1. 将所有页面中的裸 `bg-white` / `text-slate-*` 逐步替换为语义组件和设计 token。
2. 为表格、筛选栏、空状态建立统一组件。
3. 为启动页补充独立 splash 资产。
4. 将 Tauri 打包图标统一替换为 `torchscan` 品牌图标源。
5. 为图表组件统一暗色 grid、axis、tooltip 和 series 颜色。