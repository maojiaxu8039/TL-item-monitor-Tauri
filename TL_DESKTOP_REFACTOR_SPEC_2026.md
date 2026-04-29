# TL 物品火价监控桌面版重构技术方案 2026

## 1. 目标与结论

项目目标

将现有 `TL_item_monitor_BD` 从“Python 本地 Web 服务 + 单页 HTML”重构为面向 macOS / Windows 的现代桌面应用：

- 支持 macOS、Windows 双平台安装与运行。
- 完全移除 Playwright / Chromium 抓取链路。
- 完全移除对本机 Node.js 的运行依赖。
- 后端使用 Rust 原生重写，与 Tauri 深度集成。
- 前端使用现代 React / TypeScript 组件化重构。
- UI 改为白灰主色、左侧导航、卡片式监控台风格。
- 用户关注列表、策略、配置、历史记录统一落 SQLite，不再依赖浏览器 `localStorage` 作为核心存储。
- 具备托盘、通知、日志、自动更新、导入导出、备份恢复等桌面软件能力。

推荐技术路线

最终方案：

```text
Tauri 2 Desktop App
├─ Rust Core
│  ├─ 抓取火价 / 物品数据
│  ├─ SQLite 数据库
│  ├─ 定时任务调度
│  ├─ 配置与迁移
│  ├─ 通知 / 托盘 / 日志
│  └─ Tauri commands / events
│
└─ React Frontend
   ├─ Vite
   ├─ TypeScript
   ├─ shadcn/ui + Tailwind CSS
   ├─ TanStack Query
   ├─ Zustand
   └─ Recharts / ECharts
```

核心判断：

- 不再保留 Python sidecar。Rust 重写后打包更干净，体积更小，运行更稳。
- 不再保留本地 HTTP server 作为主通信方式。前端通过 Tauri `invoke()` 调用 Rust commands，通过 Tauri events 接收后台任务状态。
- 不再保留 Vanilla JS。新版前端使用 React + TypeScript，便于长期维护。
- 不再保留 Playwright / Chromium。火价抓取使用 Rust HTTP/HTTP2 客户端实现。
- 不再保留 Node subprocess。旧的 `qiandao_fire.js` 逻辑迁移到 Rust。
- 数据归属、策略归属、设置归属必须分清：
  - 数据归属：赛季、火价、物品、历史快照统一归 SQLite 和 Rust repository。
  - 策略归属：价值判断、板块绑定、预警规则统一归“策略配置”。
  - 设置归属：抓取、桌面行为、通知、数据保留、语言、更新统一归“软件设置”。

## 2. 领域模型与归属边界

核心模型

```text
Season（赛季）
├─ FirePriceRecord（每小时整点火价记录）
├─ Item（当前物品库价格）
└─ ItemPriceSnapshot（每小时整点物品价格快照）

Strategy（策略配置）
├─ Section（监控板块 / 关注清单分组）
├─ AlertRule（预警规则）
└─ AlertEvent（触发记录）

AppConfig（软件设置）
├─ ScrapeSettings（抓取设置）
├─ DesktopSettings（桌面行为）
├─ NotificationSettings（通知设置）
├─ DataSettings（数据与备份）
└─ AppSettings（语言、更新、关于）
```

数据归属

数据归属解决“什么东西是真实数据源”的问题。

- `seasons`：赛季主数据，标识当前赛季、历史赛季、普通/专家模式归属。
- `items`：当前赛季 + 当前模式下的最新物品价格，用于搜索、展示、加入板块。
- `fire_price_records`：每小时整点记录火价，长期保存到下个赛季作为历史数据。
- `item_price_snapshots`：每小时整点记录物品价格，长期保存到下个赛季作为历史数据。
- `sections` / `section_items`：用户关注清单数据，不归前端 `localStorage`。
- `alert_events`：策略触发历史。

原则：

- Rust repository 是唯一写入入口。
- 前端不直接持久化业务数据。
- 每小时整点快照是历史数据的权威来源。
- 当前数据和历史快照分表，避免查询互相拖慢。

策略归属

策略归属解决“判断规则在哪里配置”的问题。

- `Strategy` 负责购买判断规则、排序规则、通知规则、冷却时间、适用赛季。
- `Section` 负责关注清单分组和板块展示。
- 一个策略可以绑定多个板块。
- 购买判断以物品行的 `purchase_fire_price` 为准，板块不再提供 `10more - / +` 的全局阈值控件。
- MORE 和 `10more/火` 可以保留为辅助展示字段，但不作为默认购买判断依据。

建议默认策略：

- `默认购买策略`：使用物品行“购买火价”判断“可买 / 可考虑 / 不值”。
- `价格波动策略`：火价或物品价格在指定时间内涨跌超过阈值提醒。
- `低价关注策略`：物品火价低于目标值提醒。

设置归属

设置归属解决“软件行为在哪里配置”的问题。

- 首页不承载全局设置。
- “软件设置”是全局配置唯一入口。
- 抓取设置只决定后台任务行为，不直接改变策略判断。
- 通知设置只决定通知发送方式，不决定哪些物品值得提醒。
- 数据设置只决定保存、备份、恢复和数据目录。

统一命名

火价字段统一为：

| 字段 | 含义 | UI 文案 |
|---|---|---|
| `rmb_per_10k_fire` | 一万火需要多少 RMB | 元/万火 |
| `fire_per_rmb` | 1 RMB 可换多少火 | 火/元 |
| `item_fire_price` | 物品价格，单位火 | 火价 |
| `estimated_rmb` | 物品折算 RMB | 约 RMB |
| `purchase_fire_price` | 用户愿意买入的目标火价 | 购买火价 |
| `fire_per_10_more` | 每 10 more 需要多少火 | 10more/火 |

赛季模式字段统一为：

| 字段 | 含义 |
|---|---|
| `season_id` | 赛季唯一 ID |
| `season_name` | 赛季显示名称 |
| `market_mode` | 物价模式：`season_normal` / `season_expert` |

兼容旧字段：

- `ten_k` 只作为旧数据导入或旧接口兼容字段，进入新代码后转换为 `rmb_per_10k_fire`。
- `price_per_wan` 不作为新模型字段。

唯一 Worth 评估逻辑

Worth 评估只允许有一个权威实现，建议放在 Rust `strategy_service`。

输入：

- `item_fire_price`
- `count`
- `purchase_fire_price`
- `consider_ratio`

输出：

```rust
pub enum WorthStatus {
    Good,
    Consider,
    Bad,
    Unset,
}

pub struct WorthResult {
    pub status: WorthStatus,
    pub purchase_fire_price: Option<f64>,
    pub fire_per_10_more: Option<f64>,
    pub total_fire: f64,
    pub estimated_rmb: f64,
}
```

判断：

```text
若 item_fire_price <= 0 或 purchase_fire_price <= 0：
  Unset

若 item_fire_price <= purchase_fire_price：
  Good

若 item_fire_price <= purchase_fire_price * consider_ratio：
  Consider

否则：
  Bad
```

前端只展示 `WorthResult`，不重复实现判断。

备份与导入格式

导入导出分两类：

- CSV：面向人工编辑，只导入导出关注列表。
- JSON Backup：面向完整迁移，带版本号，包含设置、赛季、策略、板块。

JSON Backup 格式：

```json
{
  "version": 1,
  "app": "TL Fire Monitor",
  "exported_at": "2026-04-28T00:00:00Z",
  "seasons": [],
  "settings": {},
  "strategies": [],
  "sections": [],
  "section_items": []
}
```

要求：

- 导入前先校验 `version`。
- 导入支持 dry run，展示新增、覆盖、冲突、未匹配数量。
- 导入失败必须不破坏现有数据库。

通知归属

通知触发由 Rust 后台服务负责，不由前端页面负责。

- 前端只配置规则和展示触发记录。
- Rust 定时任务刷新数据后立即执行策略判断。
- 窗口关闭到托盘后，通知仍然可触发。
- 通知需要冷却时间，避免同一物品频繁弹窗。
- 静默时段内只记录事件，不弹系统通知。

小窗模式与自由布局

预留两种桌面辅助模式：

- 小窗模式：
  - 显示当前火价、总火、总 RMB、最近提醒。
  - 可置顶。
  - 可拖动。
  - 适合边玩游戏边看关键数据。
- 自由布局：
  - 允许用户调整首页卡片顺序和显隐。
  - 布局配置归“软件设置”。

抓取安全原则

- 不关闭 TLS 校验。
- 不再使用 `rejectUnauthorized: false`。
- 不写死无意义认证头，例如 `Authorization: Bearer undefined`。
- 请求 headers 最小化，只保留目标接口必要字段。
- 失败重试必须有上限和退避。
- 失败状态写入诊断信息，不无限刷日志。

## 3. 旧 SPEC 可借鉴与需要替换的部分

可借鉴

旧 `SPEC.md` 中以下方向正确，可以沿用：

- Tauri 2 作为桌面壳。
- Rust 作为后端核心。
- SQLite 做本地数据持久化。
- 白灰浅色监控台 UI。
- 左侧导航 + 顶部状态栏 + 配置卡片 + 板块卡片的页面结构。
- 火价抓取、物品重载、每小时整点历史入库的定时任务模型。
- macOS / Windows 双平台分发目标。

需要替换

旧文档中以下设计不建议继续使用：

| 旧设计 | 问题 | 新方案 |
|---|---|---|
| Vanilla JS/CSS | 后期维护困难，状态复杂 | React + TypeScript |
| HTTP server `127.0.0.1:19899` | 桌面应用内通信没必要暴露本地端口 | Tauri commands + events |
| Node.js subprocess 抓火价 | 需要额外 Node 运行时，打包复杂 | Rust 原生 HTTP/HTTP2 实现 |
| localStorage 保存板块 | 升级、备份、迁移不可靠 | SQLite 表结构化存储 |
| 单文件 `main.rs` | Rust 后端会快速膨胀 | 模块化 Rust crate |
| 单页 HTML | UI 复杂后不可维护 | 路由 + 组件分层 |
| 手写 UI 组件 | 一致性和可访问性成本高 | shadcn/ui + Radix primitives |

## 4. 技术栈

桌面框架

- `Tauri 2`
- `tauri-plugin-notification`
- `tauri-plugin-log`
- `tauri-plugin-opener`
- `tauri-plugin-dialog`
- `tauri-plugin-fs`
- `tauri-plugin-updater`

用途：

- Tauri 负责窗口、托盘、系统菜单、权限、更新、跨平台打包。
- Notification 插件负责 macOS / Windows 原生通知。
- Log 插件负责写入用户数据目录下的日志。
- Opener / Dialog / FS 插件负责打开日志、选择导入文件、导出 CSV、备份恢复。
- Updater 插件用于后续自动更新。

Rust 后端

推荐依赖：

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-notification = "2"
tauri-plugin-log = "2"
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-updater = "2"

tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "gzip", "brotli", "http2", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
thiserror = "2"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
parking_lot = "0.12"
dashmap = "6"

sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "chrono", "uuid", "migrate"] }
csv = "1"
```

数据库建议使用 `sqlx` 而不是 `rusqlite`：

- 支持 async，和 Tauri/Tokio 后台任务更自然。
- 支持 migrations，适合长期升级。
- SQLite 功能足够，后续迁移也更清晰。

前端

推荐依赖：

```json
{
  "dependencies": {
    "@tauri-apps/api": "latest",
    "@tauri-apps/plugin-notification": "latest",
    "@tauri-apps/plugin-dialog": "latest",
    "@tauri-apps/plugin-opener": "latest",
    "@tanstack/react-query": "latest",
    "@tanstack/react-table": "latest",
    "@tanstack/react-virtual": "latest",
    "@dnd-kit/core": "latest",
    "@dnd-kit/sortable": "latest",
    "@dnd-kit/utilities": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-router": "latest",
    "zustand": "latest",
    "zod": "latest",
    "lucide-react": "latest",
    "recharts": "latest",
    "framer-motion": "latest",
    "sonner": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest",
    "class-variance-authority": "latest"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "tailwindcss": "latest",
    "eslint": "latest",
    "prettier": "latest",
    "vitest": "latest",
    "@testing-library/react": "latest",
    "playwright": "latest"
  }
}
```

说明：

- React + TypeScript 负责组件化和类型约束。
- shadcn/ui 提供可复制、可修改的组件基础。
- Radix UI 作为 shadcn/ui 底层交互基础，保证弹窗、下拉、Popover、Tabs 的可访问性和键盘行为。
- TanStack Query 管理 Rust command 返回的异步数据、缓存、刷新、失效。
- TanStack Table 管理物品库、策略列表、历史记录表格。
- TanStack Virtual 管理大型物品列表和历史记录虚拟滚动。
- Zustand 只保存 UI 状态，例如侧栏折叠、当前选中导航、弹窗状态。
- Zod 校验导入 CSV、配置表单、Rust 返回数据。
- Recharts 用于折线图、环形图。若后续图表更复杂，可替换为 ECharts。
- dnd-kit 用于板块、关注物品、策略列表的拖拽排序。
- framer-motion 只用于轻量动效，例如卡片展开、侧栏选中态、弹窗进入退出。

UI 框架结论：

- 首选：`Tailwind CSS + shadcn/ui + Radix UI + lucide-react`。
- 不建议 MVP 使用 Ant Design：默认视觉偏企业后台，定制成轻量桌面风格成本较高。
- 不建议 MVP 使用 Material UI：视觉语言偏 Google Material，与当前白灰桌面监控台风格不完全贴合。
- 不建议引入重型商业 Admin 模板：会带来大量不需要的布局、样式和依赖。

组件选型：

| 场景 | 推荐 |
|---|---|
| 基础 UI | shadcn/ui |
| 无障碍交互 | Radix UI |
| 图标 | lucide-react |
| 表格 | TanStack Table |
| 大列表 | TanStack Virtual |
| 图表 | Recharts，复杂分析可引入 ECharts |
| 拖拽排序 | dnd-kit |
| 轻量动效 | framer-motion |
| Toast | sonner |
| 表单校验 | zod |

## 5. 产品信息架构

导航结构

左侧侧边栏：

- 监控首页
- 赛季数据
- 物品库
- 数据记录
- 策略配置
- 价格预警
- 导入导出
- 软件设置
- 帮助文档

底部区域：

- 当前运行状态
- 数据库状态
- 应用版本
- 日志入口

侧边栏交互参考 ETor 风格：

- 顶部显示应用名、版本号、当前赛季标签、记录状态。
- 一级导航使用图标 + 文案，当前页使用蓝色胶囊高亮。
- 底部放“小窗模式 / 自由布局 / 日志入口 / 版本号”等桌面工具入口。
- “软件设置”是独立页面，不再把抓取配置塞在监控首页。
- “策略配置”是独立页面，用来配置监控策略、收益/价值判断规则、预警规则。

首页结构

```text
主窗口
├─ 左侧导航
└─ 主内容区
   ├─ 顶部标题栏
   │  ├─ 当前火价
   │  ├─ 当前 RMB 价
   │  ├─ 总火
   │  ├─ 总 RMB
   │  ├─ 当前赛季
   │  ├─ 普通/专家切换
   │  ├─ 记录状态
   │  └─ 刷新数据
   │
   ├─ 状态条
   │  ├─ 火价更新时间
   │  ├─ 物品更新时间
   │  ├─ 监控状态
   │  └─ 数据库数量
   │
   ├─ 搜索筛选工具条
   │  ├─ 物品搜索
   │  ├─ 类型筛选
   │  ├─ 导入列表
   │  └─ 导出列表
   │
   └─ 策略板块卡片列表
      ├─ 板块 A
      └─ 板块 B
```

首页不再承载全局配置表单。首页只保留和“当前监控”强相关的轻操作：

- 切换当前查看模式：赛季普通 / 赛季专家。
- 刷新数据。
- 暂停/恢复当前监控。
- 搜索物品并加入策略板块。
- 查看板块汇总与物品明细。
- 打开火价/物品历史弹窗。

普通/专家切换是页面级上下文，不是隐藏在软件设置里的低频配置。切换后必须联动：

- 当前火价。
- 当前 RMB 价。
- 物品库价格。
- 板块物品价格。
- Worth 评估。
- 总火 / 总 RMB。
- 火价历史图表。
- 物品历史图表。
- 数据源诊断显示。

软件设置页结构

```text
软件设置
├─ 抓取设置
│  ├─ 火价模式
│  ├─ 火价抓取间隔
│  ├─ 自动抓取
│  ├─ 物品数据源
│  ├─ 物品重载间隔
│  └─ 自动重载
│
├─ 桌面设置
│  ├─ 开机自启
│  ├─ 关闭窗口后托盘运行
│  ├─ 小窗模式
│  └─ 自由布局
│
├─ 通知设置
│  ├─ 系统通知
│  ├─ 静默时段
│  └─ 通知测试
│
├─ 数据设置
│  ├─ 历史数据保存策略
│  ├─ 打开数据目录
│  ├─ 备份数据库
│  └─ 恢复数据库
│
└─ 应用设置
   ├─ 语言
   ├─ 自动更新
   ├─ 查看日志
   └─ 关于
```

策略配置页结构

```text
策略配置
├─ 策略概览
│  ├─ 启用策略数
│  ├─ 今日触发
│  ├─ 值得关注物品
│  └─ 风险/冷却状态
│
├─ 策略列表
│  ├─ 策略名称
│  ├─ 适用赛季
│  ├─ 监控板块
│  ├─ 判断规则
│  ├─ 预警方式
│  └─ 启停状态
│
└─ 策略编辑器
   ├─ 基础信息
   ├─ 价值判断
   ├─ 价格阈值
   ├─ 通知冷却
   └─ 触发记录
```

赛季数据页结构

```text
赛季数据
├─ 赛季概览
│  ├─ 当前赛季
│  ├─ 普通/专家火价
│  ├─ 物品库数量
│  ├─ 最近更新时间
│  └─ 数据源状态
│
├─ 火价走势
│  ├─ 24小时
│  ├─ 7天
│  ├─ 30天
│  └─ 自定义范围
│
├─ 分类统计
│  ├─ 类型占比
│  ├─ 涨跌分布
│  └─ 热门物品
│
└─ 数据源诊断
   ├─ 千岛 API 状态
   ├─ 刷图小助手 API 状态
   ├─ 最近错误
   └─ 手动重试
```

## 6. UI 设计规范

配色

```css
:root {
  --app-bg: #f7f8fb;
  --surface: #ffffff;
  --surface-muted: #f5f5f5;
  --sidebar: #2f3b52;
  --sidebar-hover: #394862;

  --text-strong: #1f2a3c;
  --text: #374151;
  --text-muted: #6b7280;

  --border: #e5e7eb;
  --primary: #3b82f6;
  --fire: #ff9f0d;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;

  --radius-card: 8px;
  --shadow-card: 0 10px 30px rgba(31, 42, 60, 0.08);
}
```

布局规则

- 主背景使用 `#F7F8FB`，卡片使用白色。
- 左侧导航宽度 176px 到 220px。
- 页面主体最大宽度不强制限制，桌面应用应充分利用横向空间。
- 卡片圆角统一 8px。
- 表格行高 44px 到 52px。
- 顶部数据卡片使用紧凑大数字，不做营销式大标题。
- 按钮、输入框、选择器高度统一 34px 到 40px。
- 图标统一使用 `lucide-react`。
- 侧边栏图标建议：
  - 监控首页：`Home`
  - 赛季数据：`Flame` 或 `Activity`
  - 物品库：`Box`
  - 数据记录：`Database`
  - 策略配置：`BarChart3` 或 `Trophy`
  - 价格预警：`Bell`
  - 导入导出：`Import` / `Download`
  - 软件设置：`Settings`
  - 帮助文档：`CircleHelp`

状态颜色

| 状态 | 颜色 | 用途 |
|---|---|---|
| 火价 / 火数 | `#FF9F0D` | 当前火价、物品火价、总火 |
| RMB / 成功 | `#10B981` | RMB 估算、运行正常、值得买 |
| 错误 / 不值 | `#EF4444` | 抓取失败、不值、删除警告 |
| 主操作 | `#3B82F6` | 保存配置、刷新数据、确认导入 |
| 普通信息 | `#6B7280` | 说明文字、时间、次要字段 |

## 7. 功能模块设计

监控首页

功能：

- 显示当前火价、当前 RMB 价、总火、总 RMB。
- 显示当前赛季、在线/记录中状态、最近刷新时间。
- 顶部提供赛季普通 / 赛季专家切换。
- 手动刷新火价。
- 自动刷新状态显示。
- 物品搜索并添加到指定策略板块。
- 板块增删改、拖拽排序、折叠展开。
- 板块内物品增删、数量设置、购买火价设置。
- 取消板块级 `10more - / +` 控件。
- MORE 与 `10more/火` 保留为可选辅助列，不参与默认购买判断。
- Worth 评估：可买 / 可考虑 / 不值。
- 点击物品打开历史趋势弹窗。
- 点击火价打开火价历史趋势弹窗。
- 不显示全局抓取配置表单；全局配置统一进入“软件设置”。

切换规则：

- 默认进入当前赛季普通模式。
- 用户切换专家模式后，前端保存为 UI 偏好，重启后恢复上次查看模式。
- 切换只改变当前页面数据上下文，不改变后台自动抓取是否启用。
- 如果某模式暂无物品数据，显示空状态和“立即刷新/选择本地文件”入口。

赛季数据

功能：

- 展示当前赛季基础状态：赛季名、普通/专家模式、数据源状态、最近更新时间。
- 展示普通/专家火价对比。
- 支持普通/专家模式切换和并排对比。
- 展示火价历史趋势、涨跌幅、最高/最低/均价。
- 展示物品分类统计和热门物品。
- 展示数据源诊断：千岛 API、刷图小助手 API、最近错误、重试按钮。
- 支持按赛季筛选数据，为未来多个赛季历史保留结构。

物品库

功能：

- 分页 / 虚拟滚动展示全部物品。
- 支持关键词搜索、类型筛选、价格区间筛选、更新时间筛选。
- 支持快速添加到策略板块。
- 支持查看单个物品历史价格。

数据记录

功能：

- 火价历史走势。
- 物品历史走势。
- 时间范围：24小时 / 7天 / 30天 / 自定义。
- 指标：最高价、最低价、均价、涨跌幅、样本数量。
- 支持导出历史记录 CSV。

策略配置

功能：

- 创建策略。
- 策略分组和启停。
- 设置适用赛季：赛季普通 / 赛季专家 / 全部。
- 绑定一个或多个监控板块。
- 设置默认购买判断方式：按购买火价 / 按涨跌幅 / 按固定折扣。
- 设置价值判断等级：
  - 可买。
  - 可考虑。
  - 不值。
- 设置排序规则：
  - 按购买差价。
  - 按购买火价。
  - 按当前火价。
  - 按 10more/火。
  - 按总火价。
  - 按 RMB。
  - 按更新时间。
- 设置提醒规则：
  - 低于目标火价提醒。
  - 达到“可买”提醒。
  - 火价涨跌超过百分比提醒。
- 设置冷却时间和静默时间。
- 规则启停。
- 规则触发历史。

策略配置页面参考图中 ETor 的“策略分析/策略排行”信息组织方式：

- 左侧或上方展示策略总览卡片。
- 中部使用策略列表表格，显示启用状态、命中次数、最近触发。
- 右侧或弹窗使用策略编辑器，配置阈值、排序、提醒、冷却。
- 重要数字用橙色，收益/正向状态用绿色，风险/不值用红色。

价格预警

功能：

- 统一展示所有启用中的提醒规则。
- 展示最近触发记录。
- 支持系统通知测试。
- 支持静默时段。

导入导出

功能：

- 导入 CSV。
- 导出当前关注列表 CSV。
- 导出完整数据库备份。
- 导入数据库备份。
- 导出日志压缩包。

软件设置

配置项：

- 火价模式：赛季普通 / 赛季专家。
- 火价抓取间隔：默认 300 秒，最小 60 秒。
- 自动抓取开关。
- 物品数据源：刷图小助手自动抓取 / 本地 JSON 文件 / 预留扩展源。
- 刷图小助手普通物价接口：MVP 接入。
- 刷图小助手专家物价接口：功能预留，拿到接口后只补 endpoint/config，不改 UI 和数据库模型。
- 本地 JSON 路径：当物品数据源为本地文件时启用。
- 物品重载间隔：默认 300 秒，最小 60 秒。
- 自动重载开关。
- 历史保存策略：默认永久保存到下个赛季及以后，用于跨赛季历史分析。
- 历史压缩策略：可选，仅聚合不删除原始数据，用户手动启用。
- 开机自启。
- 托盘运行。
- 通知开关。
- 自动更新开关。

## 8. Rust 后端架构

命名规范：

- Rust 模块名、函数名、变量名使用 snake_case。
- Rust 类型名使用 PascalCase。
- Rust enum variant 使用 PascalCase，序列化到前端时用 snake_case。
- Tauri command 名称使用 snake_case：`get_dashboard_summary`。
- TypeScript 类型名使用 PascalCase。
- TypeScript 变量和函数使用 camelCase。
- TypeScript 调 Tauri command 的封装函数使用 camelCase，例如 `getDashboardSummary()`。
- 数据库字段和 JSON payload 字段统一 snake_case，前端在 `commands.ts` 边界层转换为 camelCase。
- UI 展示文案集中在 `i18n/zh-CN.ts` 或常量文件，不散落在业务组件中。

模块结构

```text
src-tauri/src/
├─ main.rs
├─ app.rs
├─ commands/
│  ├─ mod.rs
│  ├─ config.rs
│  ├─ fire.rs
│  ├─ items.rs
│  ├─ sections.rs
│  ├─ history.rs
│  ├─ import_export.rs
│  └─ alerts.rs
├─ core/
│  ├─ mod.rs
│  ├─ state.rs
│  ├─ errors.rs
│  ├─ paths.rs
│  └─ events.rs
├─ db/
│  ├─ mod.rs
│  ├─ models.rs
│  ├─ repo_items.rs
│  ├─ repo_sections.rs
│  ├─ repo_history.rs
│  └─ migrations/
├─ scraper/
│  ├─ mod.rs
│  ├─ qiandao.rs
│  ├─ luosi.rs
│  └─ normalizer.rs
├─ scheduler/
│  ├─ mod.rs
│  ├─ fire_task.rs
│  ├─ items_task.rs
│  └─ history_task.rs
├─ services/
│  ├─ config_service.rs
│  ├─ monitor_service.rs
│  ├─ alert_service.rs
│  └─ notification_service.rs
└─ tray.rs
```

应用状态

```rust
pub struct AppState {
    pub db: SqlitePool,
    pub config: RwLock<AppConfig>,
    pub runtime: MonitorRuntime,
}

pub struct MonitorRuntime {
    pub fire_price: RwLock<Option<FirePriceSnapshot>>,
    pub items_cache: RwLock<Vec<Item>>,
    pub active_context: RwLock<MarketContext>,
    pub task_status: RwLock<TaskStatus>,
}

pub struct MarketContext {
    pub season_id: String,
    pub market_mode: MarketMode, // season_normal | season_expert
}
```

Tauri Commands

不再使用本地 HTTP API，统一使用 commands：

| Command | 说明 |
|---|---|
| `get_dashboard_summary` | 获取首页总览 |
| `set_active_market_context` | 设置当前页面赛季和普通/专家模式 |
| `get_season_summary` | 获取赛季数据概览 |
| `get_season_trends` | 获取赛季火价和分类趋势 |
| `get_source_diagnostics` | 获取千岛/刷图小助手/本地文件诊断状态 |
| `test_source_connection` | 手动测试指定数据源 |
| `get_config` | 获取配置 |
| `save_config` | 保存配置并重启调度 |
| `select_local_items_file` | 选择本地物品 JSON 文件 |
| `refresh_fire_price` | 手动刷新火价 |
| `refresh_items` | 手动刷新物品 |
| `search_items` | 按当前赛季和普通/专家模式搜索物品库 |
| `get_strategies` | 获取策略配置列表 |
| `create_strategy` | 创建策略 |
| `update_strategy` | 更新策略 |
| `delete_strategy` | 删除策略 |
| `get_sections` | 获取策略板块 |
| `create_section` | 创建板块 |
| `update_section` | 更新板块 |
| `delete_section` | 删除板块 |
| `reorder_sections` | 调整板块排序 |
| `add_section_item` | 添加物品到板块 |
| `update_section_item` | 更新物品数量 / 购买火价 / MORE |
| `remove_section_item` | 移除板块物品 |
| `get_fire_history` | 获取火价历史 |
| `get_item_history` | 获取物品历史 |
| `import_watchlist_csv` | 导入关注列表 |
| `export_watchlist_csv` | 导出关注列表 |
| `backup_database` | 备份数据库 |
| `restore_database` | 恢复数据库 |
| `open_log_dir` | 打开日志目录 |

Tauri Events

Rust 后台任务向前端推送事件：

| Event | Payload |
|---|---|
| `fire-price-updated` | `FirePriceSnapshot` |
| `items-updated` | `{ count, updated_at }` |
| `market-context-changed` | `MarketContext` |
| `task-status-changed` | `TaskStatus` |
| `alert-triggered` | `AlertEvent` |
| `config-changed` | `AppConfig` |
| `database-stats-updated` | `DbStats` |

## 9. 数据库设计

数据目录

所有可写数据放在 Tauri app data dir：

- macOS: `~/Library/Application Support/TL Fire Monitor/`
- Windows: `%APPDATA%/TL Fire Monitor/`

目录结构：

```text
app_data_dir/
├─ config.yaml
├─ tl_monitor.db
├─ logs/
│  └─ app.log
├─ backups/
└─ exports/
```

表结构

```sql
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE items (
  item_id TEXT NOT NULL,
  season_id TEXT NOT NULL DEFAULT 'current',
  market_mode TEXT NOT NULL DEFAULT 'season_normal',
  name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  last_time INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(season_id, market_mode, item_id),
  FOREIGN KEY(season_id) REFERENCES seasons(id)
);

CREATE TABLE fire_price_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id TEXT NOT NULL DEFAULT 'current',
  market_mode TEXT NOT NULL DEFAULT 'season_normal',
  rmb_per_10k_fire REAL NOT NULL,
  fire_per_rmb REAL NOT NULL,
  increase_ratio REAL,
  trading_volume TEXT,
  source TEXT NOT NULL,
  source_time TEXT,
  scraped_at INTEGER NOT NULL,
  UNIQUE(season_id, market_mode, scraped_at),
  FOREIGN KEY(season_id) REFERENCES seasons(id)
);

CREATE TABLE item_price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id TEXT NOT NULL DEFAULT 'current',
  item_id TEXT NOT NULL,
  market_mode TEXT NOT NULL DEFAULT 'season_normal',
  fire_price REAL NOT NULL,
  scraped_at INTEGER NOT NULL,
  UNIQUE(season_id, item_id, market_mode, scraped_at),
  FOREIGN KEY(season_id) REFERENCES seasons(id)
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  collapsed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE section_items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  season_id TEXT NOT NULL DEFAULT 'current',
  market_mode TEXT NOT NULL DEFAULT 'season_normal',
  item_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  purchase_fire_price REAL NOT NULL DEFAULT 0,
  more_value REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(section_id, season_id, market_mode, item_id),
  FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY(season_id, market_mode, item_id) REFERENCES items(season_id, market_mode, item_id)
);

CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season_scope TEXT NOT NULL DEFAULT 'all',
  enabled INTEGER NOT NULL DEFAULT 1,
  consider_ratio REAL NOT NULL DEFAULT 1.15,
  sort_rule TEXT NOT NULL DEFAULT 'purchase_gap',
  notification_enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 1800,
  quiet_start TEXT,
  quiet_end TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  section_id TEXT,
  item_id TEXT,
  rule_type TEXT NOT NULL,
  threshold REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 1800,
  last_triggered_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

CREATE TABLE alert_events (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  FOREIGN KEY(rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE
);

CREATE TABLE source_diagnostics (
  source TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  market_mode TEXT,
  local_path TEXT,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_duration_ms INTEGER,
  last_item_count INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
```

数据库规范：

- 表名统一复数 snake_case：`items`、`sections`、`alert_rules`。
- 字段名统一 snake_case。
- 用户/业务实体主键使用 UUID 字符串：`sections.id`、`strategies.id`。
- 高频历史表主键使用自增整数：`fire_price_records.id`、`item_price_snapshots.id`。
- 数据库存 Unix timestamp 秒，时间字段后缀统一为 `_at`。
- 布尔字段使用 `INTEGER NOT NULL DEFAULT 0/1`，字段名用 `is_` 或 `_enabled`。
- 枚举字段存稳定英文值，中文只在 UI 层映射。
- 价格字段不存单位字符串；火价保留 4 位，RMB 仅展示层保留 2 位。
- 所有关联显式声明外键，启动 SQLite 后执行 `PRAGMA foreign_keys = ON`。
- 批量写入必须使用事务，整点物品快照不得逐条打开连接。
- 写入冲突策略只在 repository 中定义，业务层不直接拼 SQL。

关键约束：

- 所有历史查询统一使用 `season_id + market_mode`。
- 旧字段 `mode` 只允许出现在导入兼容层，进入数据库前必须转换为 `market_mode`。
- `season_normal` / `season_expert` 不能和中文文案混存，中文只在 UI 层显示。
- `scraped_at` 使用整点 Unix timestamp，分钟秒必须归零。

推荐索引：

```sql
CREATE INDEX idx_fire_records_season_mode_time
  ON fire_price_records(season_id, market_mode, scraped_at);

CREATE INDEX idx_item_snapshots_item_mode_time
  ON item_price_snapshots(season_id, item_id, market_mode, scraped_at);

CREATE INDEX idx_items_season_mode_name
  ON items(season_id, market_mode, name);

CREATE INDEX idx_sections_strategy_order
  ON sections(strategy_id, sort_order);
```

性能规范：

- `items` 搜索使用数据库分页，不把完整物品库一次性推给前端。
- 物品库分页默认 100 条，最大 500 条。
- 历史图表默认返回最多 500 个点。
- 7 天以上范围按小时聚合，30 天以上范围按天聚合，但原始整点数据仍保留。
- 首页 summary 使用专门查询，避免前端自行聚合大列表。
- 关注板块总计由 Rust 返回，前端不扫描历史数据。
- SQLite 连接池最小 1、最大 5，避免桌面应用过度并发。
- 每小时快照写入时先读取当前物品列表到内存，再单事务批量写入。
- 大表查询必须命中索引；新增查询前先确认索引。

数据迁移

使用 `sqlx::migrate!()` 管理迁移：

```text
src-tauri/migrations/
├─ 0001_initial.sql
├─ 0002_alert_rules.sql
└─ 0003_import_legacy_sections.sql
```

旧数据迁移：

- `data/full_table.json` -> `items`
- `data/tl_monitor.db` 旧表 -> 新表
- 浏览器 `localStorage.tl_sections` 无法由 Rust 直接读取，需要在旧页面或迁移工具中导出 JSON/CSV 后导入。

迁移流程：

1. 预检：检查旧数据库、JSON、CSV 是否存在，读取数量和字段。
2. 备份：迁移前复制旧数据库和导入文件到 `backups/migration-*`。
3. dry run：展示将导入的赛季、物品、板块、策略、冲突数量。
4. 写入事务：所有导入在一个事务中完成，失败自动回滚。
5. 校验：对比导入前后数量，生成迁移报告。
6. 回滚入口：保留迁移前备份，允许用户恢复。

## 10. 抓取设计

火价抓取

移除：

- Playwright
- Chromium
- `qiandao_fire.js`
- Node subprocess

新实现：

- Rust `reqwest` 使用 HTTP/2 与目标接口通信。
- 必要 header、cookie、query 参数由 `scraper::qiandao` 模块封装。
- 输出统一为 `FirePriceSnapshot`。
- 失败时记录 `ScrapeError`，发出状态事件，不阻塞 UI。

```rust
pub struct FirePriceSnapshot {
    pub market_mode: MarketMode,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: Option<f64>,
    pub trading_volume: Option<String>,
    pub source: String,
    pub source_time: Option<String>,
    pub scraped_at: DateTime<Utc>,
}
```

物品抓取

数据源：

- 主数据源：刷图小助手 API。
- 可切换：本地 JSON 文件读取。
- 易火 API 若已不可用，不作为默认主链路；保留接口抽象，未来恢复时再接入。
- 刷图小助手专家物价接口预留：当前先接普通物价接口，专家接口拿到后通过配置补齐。

物品数据源模式：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `luosi_api` | 定时请求刷图小助手接口并写入当前物品库，按 `market_mode` 选择 endpoint | 默认模式 |
| `local_json` | 从用户指定本地 JSON 路径读取物品库 | 接口不可用、用户有自定义数据 |
| `disabled` | 不自动重载物品，仅保留现有数据库 | 临时离线或手动维护 |

普通/专家模式要求：

- 火价抓取必须支持 `season_normal` 和 `season_expert` 两套 tag/spec 参数。
- 物品价格必须按 `market_mode` 入库和查询。
- 刷图小助手普通接口先写入 `season_normal`。
- 刷图小助手专家接口字段和配置先预留；接口未配置时，专家模式物品数据源状态显示“待配置”，不伪造普通模式数据。
- 本地 JSON 导入时必须让用户选择文件对应普通或专家模式，避免误写到错误模式。

本地 JSON 要求：

- 支持旧项目 `data/full_table.json` 的 dict 结构。
- 支持 list 结构。
- 导入时做字段归一化：`id/item_id/物品ID/name/price/last_time/type`。
- 本地文件读取成功后同样更新 `items`，但 `source` 标记为 `local_json`。
- 本地路径保存在设置中，但导入时保存一份文件指纹：路径、文件大小、修改时间、SHA-256。
- 如果路径文件内容变化，诊断页提示“本地数据文件已变化”，允许用户确认重载。
- 如果路径失效，不清空当前数据库，仅标记数据源失败。

输出统一为：

```rust
pub struct Item {
    pub season_id: String,
    pub market_mode: MarketMode,
    pub item_id: String,
    pub name: String,
    pub item_type: String,
    pub source: String,
    pub price: f64,
    pub last_time: Option<i64>,
    pub updated_at: DateTime<Utc>,
}
```

定时任务

任务：

- 火价抓取任务：默认 300 秒。
- 物品重载任务：默认 300 秒。
- 历史快照任务：每小时整点执行，记录当时火价和全部物品价格。
- 数据维护任务：每天一次，仅执行统计、索引维护、可选压缩，不默认删除历史。

要求：

- 同类任务不可并发执行。
- 手动刷新可触发立即执行，但如果已有任务运行则返回“进行中”。
- 任务状态实时推送到前端。
- 间隔小于 60 秒自动修正并提示。
- 历史快照以 `season_id + market_mode + scraped_at` 去重。
- 整点快照用于跨赛季历史分析，默认永久保留。

整点任务语义：

- 火价抓取和物品重载可以按配置频率刷新“当前值”。
- 历史入库只在每小时整点执行一次。
- 若应用在整点时未运行，则下次启动检测最近缺失整点：
  - 火价记录只能补当前可获得值，标记 `is_backfilled=true` 时再扩展字段。
  - 物品快照只能记录启动时当前物品库，不伪造过去价格。
- 同一 `season_id + market_mode + scraped_at` 已存在时不重复写入。
- 手动刷新不直接写历史快照，除非用户点击“立即记录快照”诊断按钮。

并发控制：

- `fire_refresh`、`items_refresh`、`hourly_snapshot` 三类任务分别有独立互斥锁。
- `hourly_snapshot` 读取一个一致性快照，避免火价刷新到一半时写入混合状态。
- 应用退出时等待当前数据库事务完成，超时后取消后续任务。

诊断模式

诊断模式覆盖千岛 API、刷图小助手 API、本地 JSON 文件。

每个数据源记录：

- 是否启用。
- 当前模式。
- 最近成功时间。
- 最近失败时间。
- 最近耗时。
- 最近返回条数。
- 最近错误。
- 手动测试结果。

UI 位置：

- `赛季数据 > 数据源诊断` 展示运行状态。
- `软件设置 > 抓取设置` 提供数据源切换和本地文件路径选择。

诊断策略：

- 千岛 API 失败不影响物品库展示，但火价状态显示异常。
- 刷图小助手失败时，如果配置了本地 JSON fallback，可自动读取本地文件。
- 本地 JSON 路径无效时，显示明确错误并保留数据库中的最后一次成功物品库。

## 11. 前端架构

前端性能规范：

- 首页只订阅 summary、sections、active context，不订阅完整物品库。
- 搜索输入 debounce 250ms，搜索由 Rust/SQLite 执行。
- 物品库表格使用 TanStack Table + 虚拟滚动。
- 板块卡片内超过 100 条时使用分页或折叠加载。
- 图表组件按路由懒加载，避免首页初始包过大。
- shadcn/ui 组件按需引入，不引入整套无用组件。
- Tauri events 负责主动刷新，禁止全局 30 秒轮询。
- TanStack Query staleTime：
  - dashboard summary：30 秒。
  - items search：60 秒。
  - history：5 分钟。
  - config：直到配置变更事件。
- 大型弹窗、图表、导入预览使用 React.lazy。
- 所有列表项必须有稳定 key，不使用数组 index。
- framer-motion 动效必须克制，避免影响表格扫描效率。
- shadcn/ui 组件复制进项目后允许按设计规范定制，不把外部样式当黑盒。

目录结构

```text
src/
├─ main.tsx
├─ app/
│  ├─ App.tsx
│  ├─ routes.tsx
│  └─ providers.tsx
├─ components/
│  ├─ layout/
│  │  ├─ AppShell.tsx
│  │  ├─ Sidebar.tsx
│  │  └─ TopBar.tsx
│  ├─ dashboard/
│  │  ├─ SummaryCards.tsx
│  │  ├─ SearchToolbar.tsx
│  │  ├─ SectionCard.tsx
│  │  └─ ItemTable.tsx
│  ├─ season/
│  │  ├─ SeasonSummary.tsx
│  │  ├─ SeasonTrendPanel.tsx
│  │  ├─ CategoryStats.tsx
│  │  └─ SourceDiagnostics.tsx
│  ├─ settings/
│  │  ├─ ScrapeSettings.tsx
│  │  ├─ DesktopSettings.tsx
│  │  ├─ NotificationSettings.tsx
│  │  └─ DataSettings.tsx
│  ├─ strategies/
│  │  ├─ StrategySummary.tsx
│  │  ├─ StrategyList.tsx
│  │  └─ StrategyEditor.tsx
│  ├─ charts/
│  │  ├─ FireTrendChart.tsx
│  │  └─ ItemTrendChart.tsx
│  └─ ui/
│     └─ shadcn components
├─ features/
│  ├─ config/
│  ├─ fire/
│  ├─ items/
│  ├─ season/
│  ├─ strategies/
│  ├─ sections/
│  ├─ history/
│  ├─ alerts/
│  └─ import-export/
├─ lib/
│  ├─ commands.ts
│  ├─ events.ts
│  ├─ format.ts
│  └─ schemas.ts
├─ stores/
│  └─ ui-store.ts
└─ styles/
   └─ globals.css
```

数据获取

`lib/commands.ts` 封装 Tauri invoke：

```ts
export function getDashboardSummary() {
  return invoke<DashboardSummary>("get_dashboard_summary")
}

export function refreshFirePrice() {
  return invoke<FirePriceSnapshot>("refresh_fire_price")
}
```

TanStack Query 用于缓存：

```ts
useQuery({
  queryKey: ["dashboard-summary"],
  queryFn: getDashboardSummary,
  refetchInterval: 30_000,
})
```

事件更新：

- 收到 `fire-price-updated` 后 invalidate `dashboard-summary`、`fire-history`。
- 收到 `items-updated` 后 invalidate `items`、`sections`。
- 收到 `market-context-changed` 后 invalidate `dashboard-summary`、`items`、`sections`、`fire-history`、`item-history`。

查询 Key 必须包含当前上下文：

```ts
["dashboard-summary", seasonId, marketMode]
["items", seasonId, marketMode, filters]
["sections", seasonId, marketMode]
["fire-history", seasonId, marketMode, range]
```

## 12. Worth 评估逻辑

保留当前业务语义，并以 Rust `strategy_service` 的实现为唯一权威。前端只展示后端返回的 `WorthResult`，不重复实现判断。

```text
购买判断 = 当前火价 vs 购买火价

若购买火价 <= 0：
  不参与评估

若 当前火价 <= 购买火价：
  可买

若 当前火价 <= 购买火价 * 1.15：
  可考虑

否则：
  不值
```

展示：

- `可买`：绿色。
- `可考虑`：橙色。
- `不值`：红色。
- 未设置购买火价：灰色短横线。
- MORE / `10more/火` 是辅助分析字段，默认购买判断不依赖它。

## 13. 功能联动矩阵

| 触发动作 | 必须刷新/联动 | 不应影响 |
|---|---|---|
| 切换普通/专家 | 火价、物品搜索、板块价格、Worth、总火、总 RMB、历史图表、诊断模式显示 | 后台抓取开关、策略配置本身 |
| 切换赛季 | 火价、物品库、板块列表、策略适用范围、历史图表 | 全局软件设置 |
| 手动刷新火价 | 当前火价、RMB 换算、Worth、总 RMB、火价诊断 | 物品库价格 |
| 手动刷新物品 | 物品库、板块物品价格、Worth、总火、总 RMB、物品诊断 | 火价历史 |
| 每小时整点快照 | 火价历史、物品历史、数据库统计 | 当前 UI 选中项 |
| 保存软件设置 | 后台任务调度、通知行为、本地文件路径、UI 偏好 | 策略规则 |
| 修改策略配置 | Worth、预警规则、策略列表、排序方式 | 抓取任务 |
| 修改购买火价/数量 | 板块行、板块总计、首页总计、Worth | 物品库原始价格 |
| 修改 MORE | 10more/火 辅助列 | 默认购买判断 |
| 导入 CSV | 板块、关注物品、策略绑定预览 | 当前火价 |
| 导入 JSON Backup | 设置、策略、板块、赛季，需用户确认覆盖范围 | 不应静默覆盖现有数据 |
| 本地 JSON 文件变化 | 诊断提示，可重载物品库 | 不自动清空旧物品库 |

联动原则：

- 任何刷新都必须带 `season_id + market_mode`。
- 后台任务只更新数据，不直接改变用户当前页面路由。
- 用户编辑中的表单不被后台刷新覆盖。
- 失败时保留最后一次成功数据，并清晰标注状态。

## 14. 配置 Schema 与权限边界

### 配置 Schema

配置文件使用 `config.yaml`，必须带 `schema_version`。

```yaml
schema_version: 1
active_context:
  season_id: current
  market_mode: season_normal
scrape:
  fire_enabled: true
  fire_interval_seconds: 300
  items_enabled: true
  items_interval_seconds: 300
  items_source: luosi_api
  luosi_normal_endpoint: ""
  luosi_expert_endpoint: ""
  local_items_path: ""
desktop:
  close_to_tray: true
  start_on_boot: false
  mini_window_enabled: false
notification:
  enabled: true
  quiet_start: ""
  quiet_end: ""
data:
  keep_history_forever: true
  auto_backup_enabled: true
  backup_interval_days: 7
app:
  language: zh-CN
  auto_update_enabled: true
```

规则：

- 启动时自动补齐缺失字段。
- 未知字段保留但不参与运行，避免降级时丢配置。
- 配置保存必须校验：间隔不能小于 60 秒，本地路径必须可读或明确允许为空。
- 设置变更分为“立即生效”和“重启生效”，UI 必须提示。

### Tauri 权限边界

Tauri capabilities 只开放必要权限：

- `dialog`：选择导入文件、备份路径。
- `fs`：限制在 app data dir、用户选择的导入文件、导出目录。
- `opener`：打开日志目录、数据目录。
- `notification`：发送系统通知。
- `updater`：检查和安装更新。

禁止：

- 前端任意读写全盘文件。
- 前端直接执行 shell。
- 前端直接访问数据库文件。

## 15. 错误处理与可观测性

### 错误分级

| 等级 | 说明 | UI 表现 |
|---|---|---|
| Info | 正常状态变化 | 状态条更新 |
| Warning | 可恢复失败，如单次抓取失败 | 黄色状态、诊断记录 |
| Error | 功能不可用，如本地文件不存在 | 红色状态、操作提示 |
| Fatal | 数据库无法打开、迁移失败 | 阻止启动并提供恢复入口 |

### 日志要求

- 日志写入 `logs/app.log`，按大小滚动。
- 抓取请求记录：数据源、模式、耗时、结果数量、错误摘要。
- 数据库写入记录：表名、写入数量、整点时间。
- 通知记录：规则、物品、是否因冷却/静默跳过。
- 不记录敏感 token、完整响应体或用户隐私路径之外的无关文件。

### 诊断包

“软件设置 > 数据设置”提供导出诊断包：

```text
diagnostics.zip
├─ app.log
├─ config.redacted.yaml
├─ source_diagnostics.json
├─ db_stats.json
└─ migration_report.json
```

诊断包不包含完整数据库，除非用户单独选择“包含数据库备份”。

## 16. 打包与分发

构建产物

macOS：

- `.app`
- `.dmg`
- 支持 Apple Silicon / Intel，优先 universal 或分别构建。

Windows：

- `.msi`
- `.exe` 安装包

签名与更新

正式分发建议：

- macOS：Developer ID 签名 + notarization。
- Windows：代码签名证书，减少 SmartScreen 拦截。
- Tauri updater：生成签名更新包，发布 `latest.json`。

CI

使用 GitHub Actions：

```text
.github/workflows/
├─ test.yml
└─ release.yml
```

流程：

- Rust fmt / clippy / test。
- Frontend lint / typecheck / test。
- macOS 构建。
- Windows 构建。
- 产物上传到 GitHub Releases。

## 17. 测试方案

Rust

- 单元测试：
  - 抓取结果解析。
  - Worth 计算。
  - 配置校验。
  - CSV 导入导出。
- 集成测试：
  - SQLite migrations。
  - repository CRUD。
  - 调度任务防并发。

Frontend

- Vitest + Testing Library：
  - 配置表单。
  - 板块卡片。
  - 表格筛选。
  - Worth badge。

桌面 E2E

- E2E 工具仅作为开发/CI 测试依赖，不进入运行时包；可用 Playwright 或 Tauri WebDriver。
- 检查：
  - 首页非空。
  - 搜索可用。
  - 板块增删改。
  - 配置保存。
  - 图表渲染。
  - 窗口尺寸变化无重叠。

## 18. 开发阶段计划

### Phase 0：源码体检与抓取协议确认

- 用 Rust 重写千岛火价抓取。
- 用 Rust 重写刷图小助手物品抓取。
- 验证 macOS / Windows 网络行为一致。
- 删除 Playwright / Chromium / Node 依赖。
- 梳理旧项目所有用户数据来源：`config.yaml`、`data/full_table.json`、`data/tl_monitor.db`、浏览器 `localStorage.tl_sections`。
- 建立迁移样例数据，避免重构后用户关注列表丢失。

交付：

- `scraper::qiandao` 可返回火价。
- `scraper::luosi` 可返回物品列表。
- CLI 测试命令可跑通。
- 旧数据迁移清单完成。

### Phase 1：Tauri + Rust 核心骨架

- 初始化 Tauri 2。
- 配置插件。
- 建立 app data dir。
- 建立 SQLite migrations。
- 实现配置读写。
- 实现 dashboard summary command。

交付：

- 空 UI 能启动。
- Rust commands 能返回基础数据。
- 数据库能初始化。

### Phase 2：首页 UI

- 实现左侧导航。
- 实现顶部状态卡。
- 实现搜索工具条。
- 实现板块卡片与物品表格。
- 实现软件设置页入口和基础设置页。
- 实现赛季数据页骨架。
- 实现策略配置页骨架。

交付：

- UI 达到参考图风格。
- 首页核心流程可用。
- 首页不再出现全局抓取配置表单。

### Phase 3：业务迁移

- 板块管理落 SQLite。
- 关注物品落 SQLite。
- CSV 导入导出。
- Worth 评估。
- 火价 / 物品历史入库。

交付：

- 旧项目核心功能完整迁移。

### Phase 4：桌面能力

- 托盘。
- 通知。
- 日志目录。
- 开机自启。
- 备份恢复。
- 自动更新配置。

交付：

- 具备正式桌面软件体验。

### Phase 5：发布

- macOS / Windows 构建。
- 签名。
- 安装包。
- 发布说明。
- 迁移指南。

## 19. 需要避免的技术债

- 不再新写单文件超大 HTML。
- 不再把业务数据放在 `localStorage`。
- 不再在前端硬编码抓取逻辑。
- 不再让用户安装 Python / Node / Playwright。
- 不再使用固定端口作为桌面内通信主方案。
- 不再把配置和数据库写到应用资源目录。
- 不再把所有 Rust 代码堆在 `main.rs`。

## 20. 源码体检后的重点优化清单

本节来自对现有项目源码的扫描，目的是把“顺手重写”变成“带着问题重构”。

后端优化

| 当前问题 | 影响 | 重构方案 |
|---|---|---|
| `server.py` 使用全局 `_state/_config` | 状态来源分散，测试困难 | Rust `AppState + Service + Repository` 分层 |
| 使用 `threading.Timer` 多处调度 | 容易重复调度、退出清理复杂 | Tokio task + cancellation token |
| `access_code` 只存在配置里，API 未真正校验 | 本地端口模式下存在误用风险 | 改为 Tauri IPC，取消本地 HTTP 暴露；敏感命令由 capability 控制 |
| `webbrowser.open` 自动打开浏览器 | 桌面版不需要 | Tauri window 管理 |
| API 和静态文件服务混在一个 Handler | 职责不清 | Rust commands 拆分为 config/fire/items/sections/history |
| 失败大量 `except Exception` | 错误不可分类，不利于 UI 提示 | `thiserror` 定义 Scrape/Db/Config/Io 错误 |
| 配置、日志、数据库默认跟代码目录绑定 | 打包后路径不可写或不可迁移 | 全部迁入 app data dir |

抓取优化

| 当前问题 | 影响 | 重构方案 |
|---|---|---|
| 火价依赖 `node qiandao_fire.js` 子进程 | 用户需要 Node，打包多一个运行时 | 用 Rust `reqwest` HTTP/2 复刻该协议 |
| `rejectUnauthorized: false` | TLS 校验关闭，不适合发布版 | Rust 默认 TLS 校验；只在诊断模式允许关闭 |
| Playwright fallback 仍在代码里 | 依赖大、打包慢、稳定性差 | 完全删除 Playwright / Chromium |
| 易火抓取函数仍保留但注释称 API 已失效 | 配置语义和实际行为不一致 | 数据源枚举标注可用性，默认启用刷图普通接口和本地 JSON，预留刷图专家接口 |
| 物品合并逻辑与 README 不一致 | 文档和实际行为偏差 | 新文档以实际链路为准，未来恢复易火再实现 merge strategy |

数据库优化

现有数据库大小约 55MB，其中 `fire_price_log` 约 422,805 条，`items` 约 2,571 条，`fire_price_record` 约 167 条。历史快照是主要增长来源。

重构要求：

- 火价和物品价格每小时整点同步记录一次。
- 整点历史默认永久保存，至少完整保留到下个赛季，用于跨赛季历史分析。
- 不默认删除 `item_price_snapshots`；只提供用户手动启用的归档/压缩工具。
- 增加 `VACUUM` 或增量 vacuum 策略，但仅在用户确认或维护任务中执行。
- 增加复合索引：
  - `(season_id, item_id, market_mode, scraped_at)`
  - `(season_id, market_mode, scraped_at)`
  - `(season_id, market_mode, item_id)`
  - `(section_id, sort_order)`
- 历史图表按时间范围聚合，大范围查询避免一次返回过多点。
- 数据库写入必须走 repository，禁止散落 SQL。

前端优化

| 当前问题 | 影响 | 重构方案 |
|---|---|---|
| `index.html` 约 1343 行 | 难维护、难测试 | React 组件化 |
| 大量 `innerHTML` 拼接 | XSS 风险、事件绑定混乱 | JSX + 数据驱动渲染 |
| 大量内联 `onclick` | 逻辑和视图耦合 | 组件事件处理 |
| `localStorage.tl_sections` 保存核心数据 | 用户数据难迁移、易丢失 | SQLite `sections/section_items` |
| 前端每 30 秒轮询 | 桌面内通信浪费且延迟 | Tauri events 主动推送 + Query invalidation |
| 搜索每次在完整数组上过滤 | 数据多时卡顿 | 后端搜索 + 前端 debounce + 虚拟列表 |
| CSV 用 `split(",")` 解析 | 遇到逗号/引号会错 | Rust `csv` crate 解析 |
| 通知由前端扫状态触发 | 关闭窗口时逻辑失效 | Rust alert service 后台触发 |

桌面体验优化

- 窗口关闭默认最小化到托盘，可在设置中切换。
- 托盘菜单包含：打开主窗口、刷新火价、暂停监控、查看日志、退出。
- 设置页提供“打开数据目录”和“导出诊断包”。
- 支持开机自启。
- 支持应用内更新检查。
- Windows 通知必须以安装后的 AppUserModelID 测试。
- macOS 发布版必须规划签名和 notarization。

文档与配置优化

- 旧 `setup.bat` 存在编码乱码，桌面版不再需要 Python 依赖安装脚本。
- README 改为面向用户的安装和使用文档。
- 新增 `DEVELOPMENT.md` 面向开发者。
- 新增 `MIGRATION.md` 说明旧数据迁移。
- 新增 `TROUBLESHOOTING.md` 说明抓取失败、通知失败、数据库恢复。
- 配置项用 schema 管理，启动时自动补齐缺失字段。

## 21. 开发执行规划

### MVP 边界

第一版 MVP 必须完成：

- Tauri 2 桌面壳。
- Rust 千岛火价抓取，支持普通/专家。
- Rust 刷图小助手普通物价抓取。
- 刷图小助手专家物价 endpoint 预留。
- 本地 JSON 物品源。
- SQLite 建库和迁移。
- 每小时整点火价和物品价格快照。
- 首页普通/专家切换。
- 搜索物品、板块管理、购买火价/数量、Worth 评估。
- 赛季数据页的基础趋势和数据源诊断。
- 软件设置页的抓取设置、本地文件选择、数据目录、日志入口。
- CSV 导入导出关注列表。

MVP 明确不做：

- 自动更新。
- 开机自启。
- 高级策略排行。
- 自由布局编辑器。
- 多语言完整翻译。
- 云同步。
- 飞书/webhook 推送。

这些功能保留接口和页面入口，但不阻塞第一版发布。

### 开发冻结规则

- M0 完成前不做 UI 大量开发，先确认抓取协议能由 Rust 完整替代。
- M1 完成前不实现复杂策略，先保证数据模型稳定。
- M2 完成后冻结首页主交互，避免后续策略页面反向影响首页。
- 数据库 migration 一旦进入测试包，不允许直接修改旧 migration，只能新增 migration。
- 所有命令和数据模型变更必须同步更新本文档。

里程碑拆分

#### M0：协议验证

目标：证明 Rust 可以完全替代 Node/Playwright 抓取。

任务：

- 迁移 `qiandao_fire.js` 的 HTTP/2 请求到 Rust。
- 迁移刷图小助手普通物价 API 到 Rust。
- 预留刷图小助手专家物价 API 配置入口和数据写入路径。
- 实现本地 JSON 文件读取模式。
- 实现数据源诊断记录。
- 输出固定 JSON fixture。
- 对比旧项目同一时间的返回字段。

验收：

- 普通/专家模式均能抓到 `rmb_per_10k_fire`。
- 刷图小助手普通 API 和本地 JSON 文件模式均可加载物品。
- 专家物价接口未配置时，专家物品库显示“待配置/暂无数据”，不能回退显示普通物价。
- 普通/专家模式的数据能分开入库、分开查询、分开展示。
- 无 Node、无 Playwright 环境下可运行。

#### M1：数据底座

目标：建立新应用的数据可信源。

任务：

- app data dir。
- SQLx migrations。
- 配置读写。
- seasons / items / fire records / item snapshots / strategies / sections / section items repository。
- 每小时整点历史快照写入策略。
- 历史归档/压缩策略预留，默认不删除历史。

验收：

- 首次启动能建库。
- 重启后配置、板块、关注物品不丢。
- 每小时整点可写入火价和物品价格快照。
- 可导入旧 CSV。

#### M2：首页主流程

目标：新 UI 能完成现有核心使用路径。

任务：

- AppShell / Sidebar / TopStats。
- SearchToolbar。
- SectionCard / ItemTable。
- Worth 评估。
- 手动刷新与自动刷新。
- SeasonData 页面骨架。
- SoftwareSettings 页面骨架。
- StrategyConfig 页面骨架。

验收：

- 可以搜索物品、加入板块、设置购买火价/数量、看到火价/RMB/评估。
- 切换赛季普通/赛季专家后，火价、物品、板块评估、历史图表同步变化。
- 页面风格符合参考图。
- 1366x768 与 1920x1080 下无明显重叠。

#### M3：历史与图表

目标：历史数据可读、可分析。

任务：

- 火价趋势。
- 物品趋势。
- 统计卡片。
- 时间范围切换。
- 大范围聚合。

验收：

- 24小时/7天/30天图表可用。
- 鼠标悬停显示具体数据。

#### M4：桌面能力

目标：像真正桌面软件一样运行。

任务：

- 托盘。
- 原生通知。
- 开机自启。
- 日志查看。
- 备份恢复。
- 自动更新。

验收：

- 关闭窗口后后台监控仍可按设置运行。
- 触发“值”规则后系统通知出现。
- 可从设置页打开日志目录。

#### M5：发布

目标：产出可安装包。

任务：

- macOS 构建。
- Windows 构建。
- 图标与应用元信息。
- 签名准备。
- 发布文档。

验收：

- 干净机器安装后可运行。
- 不需要 Python、Node、Playwright。

优先级

P0 必做：

- Rust 火价抓取。
- Rust 物品抓取。
- SQLite 数据模型。
- 首页主流程。
- 删除 Playwright / Node 运行依赖。

P1 应做：

- 历史图表。
- 托盘。
- 原生通知。
- CSV 导入导出。
- 数据备份。

P2 可后置：

- 自动更新。
- 开机自启。
- 多主题。
- 高级策略规则。
- 诊断包上传。

## 22. 验收标准

功能验收

- 普通/专家火价均可刷新。
- 页面顶部可切换当前赛季的赛季普通 / 赛季专家。
- 切换后火价、物品价格、板块评估、总火、总 RMB、历史图表全部跟随上下文变化。
- 专家物价接口未配置时，专家模式物品库明确显示待配置状态。
- 物品库可刷新并入库。
- 关注板块可增删改排序。
- 物品可加入板块，可设置购买火价、MORE 与数量。
- 总火、总 RMB、单物品 RMB 计算正确。
- Worth 评估使用购买火价判断，MORE 仅作为辅助分析字段。
- 火价历史和物品历史可查询。
- 火价和物品价格能在每小时整点写入历史快照。
- 刷图小助手自动抓取和本地 JSON 文件读取可以切换。
- 赛季数据页可以看到千岛、刷图小助手、本地文件的诊断状态。
- CSV 导入导出可处理中文、逗号、引号和空值。

技术验收

- macOS / Windows 均不需要安装 Python、Node、Playwright。
- 所有可写文件位于 app data dir。
- 数据库迁移可重复执行。
- 后台任务退出时可取消，不残留进程。
- 日志能定位最近一次抓取失败原因。
- Rust `cargo test` 通过。
- Frontend `typecheck/lint/test` 通过。

UI 验收

- 颜色符合白灰主视觉和参考图风格。
- 侧边栏、顶部状态、配置卡片、表格卡片结构完整。
- 窗口缩放时文本不重叠、不溢出按钮。
- 表格关键列对齐稳定。
- 图表非空，tooltip 可用。
- 空状态、加载态、失败态都有明确反馈。

## 23. 待确认事项

当前仍需业务确认的问题：

1. 跨赛季时旧板块是否自动复制到新赛季。
   - 建议默认不自动复制，提供“从上一赛季复制关注列表”按钮。
2. 专家模式和普通模式是否共享策略。
   - 建议策略支持 `season_scope`，默认全部适用，但板块数据按模式分开。
3. 本地 JSON 文件是覆盖当前物品库，还是作为临时预览。
   - 建议读取成功后覆盖当前 `season_id + market_mode` 的 items 当前值，但保留历史快照。
4. 每小时整点快照是否记录所有物品，还是只记录关注物品。
   - 你当前要求是火价和物品价格都记录，建议 MVP 记录全量物品，后续如数据库过大再提供压缩。
5. 小窗模式是否 MVP 必做。
   - 建议不是 MVP 必做，只预留设置项和窗口架构。

已确认事项：

- 刷图小助手可以提供普通/专家物价；当前先接普通接口，专家接口后续拿到后补 endpoint。
- 专家接口未配置前，专家物品库显示待配置，不使用普通数据冒充专家数据。

## 24. 风险与对策

| 风险 | 说明 | 对策 |
|---|---|---|
| 千岛接口变更 | 直连 API 可能改字段或校验 | 抓取模块隔离，保留 fixture 测试和错误上报 |
| Windows 通知限制 | 开发态通知显示可能与安装态不同 | 必须用安装包测试通知 |
| 数据迁移遗漏 | 旧关注列表在浏览器 localStorage | 提供旧版导出和新版导入路径 |
| 数据库增长过快 | 每小时记录所有物品快照会持续变大 | 默认长期保留，提供归档/压缩/备份工具，不默认删除历史 |
| 本地 JSON 文件路径失效 | 用户移动或删除文件后物品重载失败 | 诊断模式显示明确错误，并保留最后一次成功物品库 |
| Rust 重写周期偏长 | 业务逻辑重新验证成本高 | 先完成 M0/M1/M2，图表和桌面增强后置 |

## 25. 最终推荐

如果目标是“最新、最好、长期可维护”，建议直接采用：

```text
Tauri 2 + Rust + SQLx + SQLite + React + TypeScript + Vite
+ shadcn/ui + Tailwind + TanStack Query + TanStack Table
+ Recharts + Tauri plugins
```

这是当前最适合本项目的桌面化方案：

- 对用户：无需安装 Python、Node、浏览器驱动，打开即用。
- 对产品：UI 更像专业桌面监控台。
- 对维护：前后端类型清晰，数据结构化，未来扩展策略、预警、自动更新都顺。
- 对打包：macOS / Windows 产物更干净，桌面能力原生。
