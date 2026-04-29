# TL 物品火价监控 - 开发状态报告 v2.0.0

> 本文档记录了 2026-04-29 的项目状态和修复内容

## 一、项目概述

### 技术栈
- **框架**: Tauri 2.x
- **后端**: Rust + tokio + sqlx
- **前端**: React 19 + TypeScript + Vite
- **数据库**: SQLite
- **状态管理**: TanStack Query
- **UI**: Tailwind CSS + lucide-react + recharts

### 项目结构
```
TL-item-monitor-Tauri/
├── src/                    # React 前端源码
│   ├── app/App.tsx        # 主应用组件
│   ├── components/         # UI 组件
│   │   ├── dashboard/      # 页面组件 (9个)
│   │   ├── layout/        # 布局组件
│   │   ├── charts/         # 图表组件
│   │   └── ui/             # 基础 UI 组件
│   └── lib/
│       ├── commands.ts     # Tauri 命令封装
│       └── query.ts        # TanStack Query 配置
│
├── src-tauri/              # Rust 后端源码
│   └── src/
│       ├── main.rs        # 入口
│       ├── app.rs          # 应用初始化
│       ├── commands/       # Tauri 命令
│       ├── core/           # 核心模块 (state/events/paths)
│       ├── db/             # 数据库 (models + 6个repo)
│       ├── scraper/        # 抓取器
│       ├── services/       # 服务层
│       └── scheduler/     # 定时任务
│
└── dist-react/            # 编译后的前端资源
```

---

## 二、已完成的功能

### ✅ 后端功能

| 模块 | 功能 | 状态 |
|-----|------|------|
| **Commands** | 39个 Tauri 命令 | ✅ 完成 |
| **Core** | state/events/paths | ✅ 完成 |
| **Database** | 6个 repository + migrations | ✅ 完成 |
| **Scraper** | 火价/物品抓取 | ✅ 完成 |
| **Services** | worth_service/notification | ✅ 完成 |
| **Scheduler** | 定时任务调度 | ✅ 完成 |
| **Tray** | 系统托盘 | ✅ 完成 |

### ✅ 前端页面 (9个)

| 页面 | 文件 | 功能 |
|-----|------|------|
| 监控首页 | DashboardPage.tsx | 火价监控、板块管理 |
| 赛季数据 | SeasonPage.tsx | 火价走势、统计 |
| 物品库 | ItemsPage.tsx | 物品搜索、筛选 |
| 数据记录 | DataRecordsPage.tsx | 历史数据、导出 |
| 策略管理 | StrategiesPage.tsx | 策略配置 |
| 价格预警 | AlertsPage.tsx | 预警规则 |
| 导入导出 | ImportExportPage.tsx | 备份/恢复 |
| 软件设置 | SettingsPage.tsx | 全局配置 |
| 帮助文档 | HelpPage.tsx | 使用说明 |

### ✅ Tauri 插件 (已注册)

```rust
tauri_plugin_shell       // Shell 命令
tauri_plugin_notification // 系统通知
tauri_plugin_log         // 日志
tauri_plugin_dialog      // 对话框
tauri_plugin_fs          // 文件系统
tauri_plugin_opener      // 打开链接/路径
tauri_plugin_process      // 进程管理
```

---

## 三、已修复的问题

### 1. worth_service 重构 ✅

**修改前**: 使用自定义 `is_worth` / `score` / `label` 结构

**修改后**: 完全符合 SPEC 的 `WorthStatus` 枚举
```rust
pub enum WorthStatus {
    Good,       // 可买
    Consider,    // 可考虑
    Bad,         // 不值
    Unset,       // 未设置
}

pub struct WorthResult {
    pub status: WorthStatus,
    pub purchase_fire_price: Option<f64>,
    pub fire_per_10_more: Option<f64>,
    pub total_fire: f64,
    pub estimated_rmb: f64,
}
```

### 2. Tauri Events 完善 ✅

**修改前**: 只有 `fire-price-updated` 事件

**修改后**: 完整的 7 个事件
```rust
EVENT_FIRE_PRICE_UPDATED       // 火价更新
EVENT_ITEMS_UPDATED            // 物品更新
EVENT_MARKET_CONTEXT_CHANGED   // 市场上下文变更
EVENT_TASK_STATUS_CHANGED      // 任务状态变更
EVENT_ALERT_TRIGGERED          // 预警触发
EVENT_CONFIG_CHANGED           // 配置变更
EVENT_DATABASE_STATS_UPDATED   // 数据库统计更新
```

### 3. 缺失页面补充 ✅

- **DataRecordsPage.tsx**: 火价历史走势、数据统计、CSV导出
- **HelpPage.tsx**: FAQ、快捷键、外部链接

### 4. 前端类型修复 ✅

- `FirePriceRecord` 添加 `increase_ratio` 字段
- `SummaryCard` 添加 `gray` 颜色选项
- `PageId` 类型添加 `records` 和 `help`

### 5. 前端命令封装完善 ✅

添加了 Strategy 相关命令:
- `getStrategies`
- `createStrategy`
- `updateStrategy`
- `deleteStrategy`

并更新了 `WorthResult` 类型

---

## 四、SPEC 符合性检查

### ✅ 完全符合的部分

| 项目 | SPEC 要求 | 实现 |
|-----|---------|------|
| Tauri 2 | 桌面框架 | ✅ |
| 模块化 Rust | commands/core/db/scraper/services | ✅ |
| SQLite + sqlx | 数据库 | ✅ |
| React + TypeScript | 前端框架 | ✅ |
| TanStack Query | 状态管理 | ✅ |
| WorthStatus | 评估逻辑 | ✅ |
| Tauri Events | 7个事件 | ✅ |
| 导航页面 | 9个页面 | ✅ |

### ⚠️ 部分符合/待改进

| 项目 | 状态 | 说明 |
|-----|------|------|
| 数据记录页 | ✅ 已添加 | 基础功能完成 |
| 帮助文档页 | ✅ 已添加 | 基础内容完成 |
| 小窗模式 | ❌ 未实现 | SPEC 预留 |
| 自由布局 | ❌ 未实现 | SPEC 预留 |
| JSON 导入/导出 | ⚠️ 部分 | 只有 CSV |
| 自动更新 | ⚠️ 预留 | tauri-plugin-updater 未添加 |

---

## 五、数据库表结构

```sql
app_meta              -- 应用元数据
seasons               -- 赛季信息
items                 -- 物品库
fire_price_records    -- 火价历史
item_price_snapshots  -- 物品快照
sections              -- 板块
section_items         -- 板块物品
alert_rules           -- 预警规则
alert_events          -- 预警事件
strategies            -- 策略配置
```

---

## 六、Tauri Commands 列表 (39个)

### 仪表盘
- `get_dashboard_summary`
- `set_active_market_context`
- `get_db_stats`
- `get_items_stats`
- `reload_items`

### 火价
- `refresh_fire_price`
- `get_fire_history`

### 物品
- `search_items`
- `refresh_items`

### 板块
- `get_sections`
- `create_section`
- `update_section`
- `delete_section`
- `reorder_sections`
- `get_section_items`
- `add_section_item`
- `update_section_item`
- `remove_section_item`

### 策略
- `get_strategies`
- `create_strategy`
- `update_strategy`
- `delete_strategy`

### 预警
- `get_alert_rules`
- `create_alert_rule`
- `update_alert_rule`
- `toggle_alert_rule`
- `delete_alert_rule`
- `get_alert_events`

### 配置
- `get_config`
- `save_config`

### 导入导出
- `import_watchlist_csv`
- `export_watchlist_csv`
- `export_fire_history_csv`
- `backup_database`
- `restore_database`
- `get_backup_info`

### 其他
- `evaluate_worth_cmd`
- `test_notification`
- `open_log_dir`

---

## 七、前端页面导航

```
监控首页 → 赛季数据 → 物品库 → 数据记录
   ↓         ↓          ↓        ↓
板块管理   火价走势   搜索筛选   历史导出
   ↓
策略管理 → 价格预警 → 导入导出 → 软件设置
   ↓         ↓          ↓        ↓
策略编辑   预警规则   备份恢复   全局配置
```

---

## 八、待办事项

### 高优先级
1. [ ] 测试应用是否能正常启动
2. [ ] 验证前端页面是否正常显示
3. [ ] 检查 Tauri 命令调用是否正常

### 中优先级
1. [ ] 添加数据记录页面图表功能
2. [ ] 完善帮助文档内容
3. [ ] 实现 JSON 格式的导入/导出

### 低优先级 (SPEC 预留)
1. [ ] 小窗模式
2. [ ] 自由布局
3. [ ] 自动更新功能

---

## 九、运行命令

```bash
# 安装依赖
cd TL-item-monitor-Tauri
npm install
cd src && npm install

# 开发模式
npm run dev

# 构建前端
cd src && ./node_modules/.bin/vite build

# 构建 Tauri 应用
npm run build
```

---

## 十、联系方式

- 项目: TL 物品火价监控
- 版本: v2.0.0
- 技术: Tauri 2 + React 19 + Rust
- 状态: 开发中