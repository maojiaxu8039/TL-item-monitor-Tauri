# TL 物品火价监控桌面版重构技术方案 2026

> **项目名称**：TL Fire Monitor
> **技术栈**：Tauri 2 Desktop App + Rust Core + React Frontend
> **定位**：火炬之光游戏物品火价实时监控桌面应用（macOS / Windows）
> **最后更新**：2026-04-28

---

## 一、项目概述与核心判断

### 目标
将现有 `TL_item_monitor_BD`（Python 本地 Web + Playwright/Chromium）重构为现代桌面应用：
- 无需 Python / Node.js / Playwright / Chromium
- 后端 Rust 原生，与 Tauri 深度集成
- 前端 React + TypeScript，组件化架构
- UI：白灰主色 + 左侧导航 + 卡片式监控台
- 数据统一落 SQLite，板块/配置/历史不再依赖 localStorage
- 桌面能力：托盘、通知、日志、自动更新、导入导出、备份恢复

### 核心判断
- **移除**：Python sidecar、本地 HTTP server（`127.0.0.1:19899`）、Vanilla JS、Playwright/Chromium、Node subprocess（`qiandao_fire.js`）、单文件 `main.rs`
- **通信**：前端通过 Tauri `invoke()` 调用 Rust commands，通过 Tauri events 接收后台状态
- **数据库**：SQLx + SQLite（推荐），支持 migrations，长期升级清晰
- **抓取**：Rust `reqwest` HTTP/HTTP2 原生实现，删除所有 Node/Playwright 链路
- **Worth 评估**：唯一权威实现位于 Rust `strategy_service`，前端只展示结果

### 文件结构
```
TL-item-monitor-Tauri/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   ├── src/
│   │   ├── main.rs
│   │   ├── app.rs
│   │   ├── commands/         # Tauri commands (config/fire/items/sections/history/alerts)
│   │   ├── core/             # state/errors/paths/events
│   │   ├── db/               # models + repos + migrations
│   │   ├── scraper/          # qiandao/luosi/normalizer
│   │   ├── scheduler/         # fire_task/items_task/history_task
│   │   └── services/         # config/monitor/alert/notification
│   └── migrations/
│       ├── 0001_initial.sql
│       └── 0002_legacy_import.sql
├── src/                      # React 前端
│   ├── main.tsx
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── lib/
│   └── styles/
├── dist/                     # 旧 Phase 2 UI（过渡用，最终迁移到 React）
├── SPEC.md                   # 本文档
└── README.md
```

---

## 二、设计规范

### 2.1 配色方案

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#F7F8FB` | 浅灰蓝主区域 |
| 卡片背景 | `#FFFFFF` | 白色卡片 |
| 侧边栏背景 | `#2F3B52` | 深蓝灰 |
| 侧边栏悬停 | `#394862` | 悬停态 |
| 标题/重要文字 | `#1F2A3C` | 深灰 |
| 普通文字 | `#374151` | 中灰 |
| 次要文字 | `#6B7280` | 浅灰 |
| 主色调 | `#3B82F6` | 蓝色（按钮、开关、选中态） |
| 火价高亮 | `#FF9F0D` | 橙色 |
| RMB/成功 | `#10B981` | 绿色 |
| 警告/不值 | `#EF4444` | 红色 |
| 边框 | `#E5E7EB` | 浅灰 |
| 表格表头 | `#F5F5F5` | 更浅灰 |

### 2.2 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  侧边栏(176-220px)  │              主内容区                    │
│                     │  ┌────────────────────────────────────┐ │
│  Logo + 版本号       │  │  顶部标题栏                         │ │
│  ● 监控首页  ←当前   │  │   火价 | RMB | 总火 | 总RMB | 赛季  │ │
│  ○ 赛季数据          │  │   模式切换 | 状态 | 刷新            │ │
│  ○ 物品库            │  ├────────────────────────────────────┤ │
│  ○ 数据记录          │  │  状态条（更新时间/监控状态/DB数量）  │ │
│  ○ 策略配置          │  ├────────────────────────────────────┤ │
│  ○ 价格预警          │  │  搜索筛选栏                         │ │
│  ○ 导入导出          │  │   搜索 | 类型筛选 | 导入/导出       │ │
│  ○ 软件设置          │  ├────────────────────────────────────┤ │
│  ○ 帮助文档          │  │  策略板块卡片列表                    │ │
│                     │  │   板块A | 板块B | ...               │ │
│  ──────────────     │  └────────────────────────────────────┘ │
│  小窗/自由布局       │  ┌────────────────────────────────────┐ │
│  打开日志            │  │  底栏（版本 / DB状态 / 诊断入口）   │ │
│  v1.0.0             │  └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Worth 评估逻辑

**唯一权威实现位于 Rust `strategy_service`**，前端只展示结果。

**计算公式**：
```
每10more/火 = (物品火价 / MORE) * 10

判断基准（默认）：
- 板块基准 baseline_more_per_10_fire：默认 0
- consider_ratio：默认 1.15（15% 容错）

评估结果：
- 每10more/火 <= baseline：值（绿色）
- 每10more/火 <= baseline * consider_ratio：可考虑（橙色）
- 否则：不值（红色）
- MORE 未设置或基准 <= 0：灰色短横线（Unset）
```

---

## 三、数据模型

### 3.1 核心领域模型

```
Season（赛季）
├─ FirePriceRecord（每小时整点火价）
├─ Item（当前物品库价格）
└─ ItemPriceSnapshot（每小时整点物品价格快照）

Strategy（策略配置）
├─ Section（监控板块/关注清单）
├─ AlertRule（预警规则）
└─ AlertEvent（触发记录）

AppConfig（软件设置）
├─ ScrapeSettings
├─ DesktopSettings
├─ NotificationSettings
└─ DataSettings
```

### 3.2 数据库表结构

> **所有可写数据位于 Tauri app data dir**
> - macOS: `~/Library/Application Support/TL Fire Monitor/`
> - Windows: `%APPDATA%/TL Fire Monitor/`

```
app_data_dir/
├─ config.yaml
├─ tl_monitor.db
├─ logs/app.log
├─ backups/
└─ exports/
```

**核心表**：

| 表名 | 说明 | 主键 |
|------|------|------|
| `seasons` | 赛季主数据 | `id` (TEXT UUID) |
| `items` | 当前赛季+模式物品价格 | `(season_id, market_mode, item_id)` |
| `fire_price_records` | 每小时整点火价记录 | `id` (AUTOINCREMENT) |
| `item_price_snapshots` | 每小时整点物品快照 | `id` (AUTOINCREMENT) |
| `sections` | 用户关注板块 | `id` (TEXT UUID) |
| `section_items` | 板块内物品 | `id` (TEXT UUID) |
| `strategies` | 策略配置 | `id` (TEXT UUID) |
| `alert_rules` | 预警规则 | `id` (TEXT UUID) |
| `alert_events` | 触发记录 | `id` (TEXT UUID) |
| `source_diagnostics` | 数据源诊断状态 | `source` (TEXT) |
| `app_meta` | 应用元数据 | `key` (TEXT) |

**字段命名规范**：
- 表名/字段名：`snake_case`
- 布尔字段：`INTEGER NOT NULL DEFAULT 0/1`，字段名用 `is_` 或 `_enabled`
- 枚举字段：存稳定英文值，中文只在 UI 层映射
- 时间字段：Unix timestamp 秒，后缀 `_at`
- 价格字段：`REAL`，不存单位字符串

### 3.3 统一字段命名

| 字段 | 含义 | UI 文案 |
|------|------|--------|
| `rmb_per_10k_fire` | 一万火需要多少 RMB | 元/万火 |
| `fire_per_rmb` | 1 RMB 可换多少火 | 火/元 |
| `item_fire_price` | 物品价格（单位火） | 火价 |
| `estimated_rmb` | 物品折算 RMB | 约 RMB |
| `fire_per_10_more` | 每 10 more 需要多少火 | 10more/火 |
| `market_mode` | 物价模式 | `season_normal` / `season_expert` |

---

## 四、Rust 后端架构

### 4.1 模块结构

```
src-tauri/src/
├─ main.rs              # 入口、setup、background tasks
├─ app.rs               # Tauri builder 配置
├─ commands/            # Tauri command handlers
│  ├─ mod.rs
│  ├─ config.rs         # get_config / save_config
│  ├─ fire.rs          # get_fire_price / refresh_fire_price
│  ├─ items.rs         # search_items / refresh_items
│  ├─ sections.rs      # sections CRUD + items
│  ├─ history.rs       # get_fire_history / get_item_history
│  ├─ strategies.rs    # strategies CRUD
│  ├─ alerts.rs        # get_alerts / test_notification
│  └─ import_export.rs # import_csv / export_csv / backup / restore
├─ core/
│  ├─ mod.rs
│  ├─ state.rs         # AppState / MonitorRuntime
│  ├─ errors.rs        # thiserror 定义错误类型
│  ├─ paths.rs         # app data dir paths
│  └─ events.rs        # Tauri event emitters
├─ db/
│  ├─ mod.rs
│  ├─ models.rs         # 所有数据结构体
│  ├─ repo_seasons.rs
│  ├─ repo_items.rs
│  ├─ repo_fire.rs
│  ├─ repo_sections.rs
│  ├─ repo_strategies.rs
│  └─ migrations/       # sqlx migrations
├─ scraper/
│  ├─ mod.rs
│  ├─ qiandao.rs       # 千岛火价抓取（Rust HTTP/2）
│  ├─ luosi.rs         # 刷图小助手物品抓取
│  └─ normalizer.rs    # 字段归一化
├─ scheduler/
│  ├─ mod.rs
│  ├─ fire_task.rs     # 火价定时抓取
│  ├─ items_task.rs    # 物品定时重载
│  └─ history_task.rs  # 每小时整点快照
├─ services/
│  ├─ mod.rs
│  ├─ config_service.rs
│  ├─ monitor_service.rs
│  ├─ strategy_service.rs  # Worth 评估唯一实现
│  ├─ alert_service.rs
│  └── notification_service.rs
└── tray.rs              # 托盘菜单
```

### 4.2 AppState

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

### 4.3 Tauri Commands（完整列表）

| Command | 说明 |
|----------|------|
| `get_dashboard_summary` | 获取首页总览（火价/RMB/总火/总RMB/状态） |
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
| `update_section_item` | 更新物品数量/MORE |
| `remove_section_item` | 移除板块物品 |
| `get_fire_history` | 获取火价历史 |
| `get_item_history` | 获取物品历史 |
| `import_watchlist_csv` | 导入关注列表 |
| `export_watchlist_csv` | 导出关注列表 |
| `backup_database` | 备份数据库 |
| `restore_database` | 恢复数据库 |
| `open_log_dir` | 打开日志目录 |

### 4.4 Tauri Events

| Event | Payload |
|-------|---------|
| `fire-price-updated` | `FirePriceSnapshot` |
| `items-updated` | `{ count, updated_at }` |
| `market-context-changed` | `MarketContext` |
| `task-status-changed` | `TaskStatus` |
| `alert-triggered` | `AlertEvent` |
| `config-changed` | `AppConfig` |
| `database-stats-updated` | `DbStats` |

### 4.5 火价抓取

**移除**：Playwright、Chromium、`qiandao_fire.js`、Node subprocess

**新实现**（Rust 原生）：
- `reqwest` HTTP/2 与千岛接口通信
- 输出统一为 `FirePriceSnapshot`
- 失败记录 `ScrapeError`，发出状态事件，不阻塞 UI

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

### 4.6 物品抓取

| 模式 | 行为 |
|------|------|
| `luosi_api`（默认） | 定时请求刷图小助手接口 |
| `local_json` | 从用户指定本地 JSON 路径读取 |
| `disabled` | 不自动重载 |

**专家物价接口**：预留配置入口，专家模式未配置时显示"待配置"状态，不使用普通数据冒充。

---

## 五、前端架构

### 5.1 技术栈

- **React 18 + TypeScript + Vite**
- **shadcn/ui + Tailwind CSS**（按需引入组件）
- **TanStack Query**：数据获取、缓存、轮询
- **TanStack Table**：物品库/策略列表表格
- **Zustand**：UI 状态（侧栏折叠、路由、弹窗）
- **Zod**：表单校验
- **Recharts**：图表
- **Lucide React**：图标

### 5.2 目录结构

```
src/
├─ main.tsx
├─ app/
│  ├─ App.tsx
│  ├─ routes.tsx
│  └─ providers.tsx
├─ components/
│  ├─ layout/         # AppShell / Sidebar / TopBar
│  ├─ dashboard/       # SummaryCards / SearchToolbar / SectionCard / ItemTable
│  ├─ season/          # SeasonSummary / SeasonTrendPanel / SourceDiagnostics
│  ├─ settings/        # ScrapeSettings / DesktopSettings / NotificationSettings / DataSettings
│  ├─ strategies/      # StrategySummary / StrategyList / StrategyEditor
│  ├─ charts/          # FireTrendChart / ItemTrendChart
│  └─ ui/              # shadcn components
├─ features/           # 按领域分包
├─ lib/
│  ├─ commands.ts      # invoke 封装
│  ├─ events.ts        # event listeners
│  ├─ format.ts        # 格式化工具
│  └─ schemas.ts       # Zod schemas
├─ stores/             # Zustand stores
└─ styles/            # globals.css
```

### 5.3 TanStack Query 策略

- 首页只订阅 summary、sections、active context，不订阅完整物品库
- 搜索 debounce 250ms，由 Rust/SQLite 执行
- 物品库表格使用 TanStack Table + 虚拟滚动
- Tauri events 负责主动刷新，**禁止全局 30 秒轮询**
- staleTime：`dashboard-summary` 30s / `items-search` 60s / `history` 5min / `config` 永不超时

### 5.4 查询 Key 必须包含上下文

```ts
["dashboard-summary", seasonId, marketMode]
["items", seasonId, marketMode, filters]
["sections", seasonId, marketMode]
["fire-history", seasonId, marketMode, range]
```

---

## 六、功能模块

### 6.1 监控首页

- 显示当前火价、当前 RMB、总火、总 RMB
- 显示当前赛季、在线/记录中状态、最近刷新时间
- **赛季普通/专家模式切换**（顶部胶囊切换）
- 手动刷新火价
- 自动刷新状态显示
- 物品搜索并添加到指定策略板块
- 板块增删改、拖拽排序、折叠展开
- 板块内物品增删、数量设置、MORE 设置
- **Worth 评估：值/可考虑/不值**（由 Rust 唯一实现）
- 点击物品打开历史趋势弹窗
- 点击火价打开火价历史趋势弹窗
- **首页不再承载全局配置表单**（统一进入"软件设置"）

### 6.2 赛季数据

- 展示当前赛季基础状态
- 普通/专家火价对比
- 火价历史趋势、涨跌幅、最高/最低/均价
- 物品分类统计和热门物品
- 数据源诊断：千岛 API、刷图小助手 API、本地 JSON、最近错误、重试

### 6.3 物品库

- 分页/虚拟滚动展示全部物品
- 关键词搜索、类型筛选、价格区间筛选、更新时间筛选
- 快速添加到策略板块
- 查看单个物品历史价格

### 6.4 数据记录

- 火价历史走势 + 物品历史走势
- 时间范围：24小时/7天/30天/自定义
- 指标：最高价、最低价、均价、涨跌幅、样本数量
- 支持导出 CSV

### 6.5 策略配置

- 创建/编辑/删除策略
- 策略分组和启停
- 设置适用赛季：赛季普通/赛季专家/全部
- 绑定一个或多个监控板块
- 设置策略基准：每 10 more / 火
- 设置价值判断等级（值/可考虑/不值）
- 设置排序规则
- 设置提醒规则和冷却时间
- 规则触发历史

### 6.6 价格预警

- 统一展示所有启用中的提醒规则
- 最近触发记录
- 系统通知测试
- 静默时段配置

### 6.7 导入导出

- 导入 CSV（关注列表）
- 导出当前关注列表 CSV
- 导出完整数据库备份（JSON）
- 导入数据库备份
- 导出日志压缩包

### 6.8 软件设置

| 分组 | 配置项 |
|------|--------|
| 抓取设置 | 火价模式/间隔/开关、物品数据源/路径/间隔/开关 |
| 桌面设置 | 开机自启、关闭窗口后托盘运行、小窗模式 |
| 通知设置 | 系统通知、静默时段、通知测试 |
| 数据设置 | 历史保存策略、打开数据目录、备份恢复 |
| 应用设置 | 语言、自动更新、查看日志、关于 |

---

## 七、开发阶段

### M0：协议验证
- Rust 千岛火价抓取（HTTP/2）
- Rust 刷图小助手普通物价抓取
- 专家物价接口预留配置
- 本地 JSON 文件读取
- 数据源诊断记录

### M1：数据底座
- app data dir + SQLx migrations
- 配置读写
- seasons / items / fire records / item snapshots / strategies / sections / section_items repositories
- 每小时整点历史快照

### M2：首页主流程
- AppShell / Sidebar / TopStats
- SearchToolbar
- SectionCard / ItemTable
- Worth 评估
- 手动刷新与自动刷新
- SeasonData / SoftwareSettings / StrategyConfig 页面骨架

### M3：历史与图表
- 火价趋势 + 物品趋势
- 统计卡片 + 时间范围切换

### M4：桌面能力
- 托盘 + 原生通知 + 开机自启
- 日志查看 + 备份恢复 + 自动更新

### M5：发布
- macOS / Windows 构建
- 签名 + 安装包

---

## 八、验收标准

### 功能
- 普通/专家火价均可刷新
- 切换模式后火价/物品/板块评估/历史图表全部跟随变化
- 专家模式未配置时明确显示"待配置"
- 物品库可刷新并入库
- 关注板块可增删改排序
- Worth 评估与旧项目业务语义一致
- CSV 导入导出处理中文/逗号/引号/空值

### 技术
- macOS / Windows 均不需要 Python / Node / Playwright
- 所有可写文件位于 app data dir
- 数据库 migrations 可重复执行
- 后台任务退出时可取消
- 日志能定位最近抓取失败原因
- Rust `cargo test` 通过
- Frontend `typecheck/lint/test` 通过

### UI
- 颜色符合白灰主视觉
- 窗口缩放时文本不重叠、不溢出按钮
- 表格关键列对齐稳定
- 图表非空，tooltip 可用
- 空状态/加载态/失败态都有明确反馈
