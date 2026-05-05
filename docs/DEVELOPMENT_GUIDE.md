# TL 物品火价监控 - 开发文档

## 1. 项目概述

**项目名称**：TL 物品火价监控  
**版本**：v2.9  
**最后更新**：2026-05-18  
**状态**：核心功能稳定，新增HERMES Skill集成

基于 Tauri 2.0 + React + TypeScript + Rust + SQLite 的桌面应用，用于监控火炬之光（Torchlight）游戏中的物品价格和火价（游戏货币汇率）。

---

## 2. 功能清单

### 2.1 已实现功能 ✅

| 模块 | 功能 | 状态 | 说明 |
|------|------|------|------|
| **监控首页** | 分组管理 | ✅ | 创建/编辑/删除分组，添加物品到分组 |
| | 拖拽排序 | ✅ | 分组拖拽排序 |
| | 物品监控 | ✅ | 显示物品当前价格、购买价格、溢价率 |
| | 导入导出CSV | ✅ | 支持UTF-8编码的CSV导入导出 |
| **火价分析** | 当前火价显示 | ✅ | 实时显示当前火价（按赛季/模式隔离） |
| | 火价走势图表 | ✅ | 双折线图对比当前赛季和历史赛季 |
| | 赛季对比 | ✅ | SS12 vs SS11 同时间段对比 |
| | 模式隔离 | ✅ | 普通服/专家服数据完全隔离 |
| **物价数据** | 物品搜索 | ✅ | 支持关键词搜索 |
| | 类型筛选 | ✅ | 动态从数据库获取物品类型 |
| | 赛季筛选 | ✅ | 对比赛季选择（SS11/SS10） |
| | 天数筛选 | ✅ | 输入第几天进行筛选 |
| | 价格对比 | ✅ | 显示当前价格 vs 历史赛季价格 |
| | 价格变化 | ✅ | 涨跌百分比和具体差值 |
| | 价格走势 | ✅ | 点击查看双赛季价格曲线图 |
| | 添加到分组 | ✅ | 直接添加到监控首页分组 |
| **物价分析** | 囤货分析 | ✅ | 基于波动差+周期分析 |
| | 最佳入手/出手时间 | ✅ | 显示赛季第几天+几点 |
| | 预期收益计算 | ✅ | 计算预期收益率 |
| | 置信度评分 | ✅ | 分析可信度评分 |
| | 物品搜索 | ✅ | 支持关键词搜索 |
| | 类型筛选 | ✅ | 下拉框筛选物品类型 |
| | 加入分组 | ✅ | 添加到监控首页分组 |
| | 价格走势 | ✅ | 点击查看上赛季物价曲线图 |
| **捡漏出货** | 实时火价监控 | ✅ | 基于 item_realtime_fire_prices 表 |
| | 5分钟涨跌检测 | ✅ | 优先使用5分钟变化率 |
| | 3小时涨跌检测 | ✅ | 回退使用3小时变化率 |
| | 双列表显示 | ✅ | 上涨/下跌分栏显示 |
| | 阈值设置 | ✅ | 可配置涨跌百分比阈值（localStorage） |
| | 自动数据采集 | ✅ | 后台任务每30秒自动采集 |
| | 生成测试数据 | ✅ | 开发调试用测试数据生成 |
| **AI分析** | AI对话 | ✅ | 对话框形式与AI交互 |
| | HERMES Gateway直连 | ✅ | WebSocket直连本地Gateway |
| | Skill选择器 | ✅ | 选择和启用已安装的Skills |
| | Tool Call显示 | ✅ | 实时显示Skill调用过程和结果 |
| | 多提供商支持 | ✅ | HERMES(本地)/OPENClAW/自定义API |
| | 配置管理 | ✅ | API地址、模型、密钥配置 |
| | 连接测试 | ✅ | 测试AI连接是否成功 |
| | 系统提示词 | ✅ | 可自定义AI角色和分析风格 |
| | 智能上下文 | ✅ | 自动附带当前火价数据和已选Skills |
| **数据监控** | 服务器状态 | ✅ | 显示服务器连接状态 |
| | 数据采集状态 | ✅ | 显示采集器工作状态 |
| | 数据同步 | ✅ | 同步服务器数据到本地 |
| | 赛季同步 | ✅ | 同步整个赛季数据 |
| **预警规则** | 规则管理 | ✅ | 创建/编辑/删除预警规则 |
| | 事件查看 | ✅ | 查看预警触发事件 |
| | 开关控制 | ✅ | 启用/禁用预警规则 |
| **设置** | 应用配置 | ✅ | 赛季、模式、数据源等配置 |
| | 通知设置 | ✅ | 系统通知、语音提醒等 |
| | 桌面设置 | ✅ | 启动项、窗口行为等 |
| | AI设置 | ✅ | AI提供商配置（localStorage存储） |
| **导入导出** | CSV导入导出 | ✅ | 监控列表导入导出 |
| | 数据库备份 | ✅ | 备份和恢复数据库 |
| **其他** | 系统托盘 | ✅ | 最小化到托盘 |
| | 自动更新 | ✅ | 定时抓取火价和物品数据 |
| | 历史记录 | ✅ | 每小时保存价格快照 |
| | 上下文切换 | ✅ | 赛季/模式切换后自动刷新数据 |

### 2.2 待开发功能 🚧

| 模块 | 功能 | 状态 | 说明 |
|------|------|------|------|
| **识图助手** | 图片识别 | 🚧 | 通过截图识别交易行物品词条 |
| | 价格评估 | 🚧 | 根据词条评估物品价格 |
| | 高价值物品库 | 🚧 | 记录高价值物品 |
| **策略管理** | 策略配置 | 🚧 | 游戏打宝策略配置 |
| | 收益计算 | 🚧 | 预计收益计算 |
| | 策略推荐 | 🚧 | 基于数据的策略推荐 |
| **预警规则** | 后台任务接入 | 🚧 | alert_task 读取 alert_rules |
| | Cooldown机制 | 🚧 | 防止重复通知 |
| **数据监控** | 整赛季火价同步 | 🚧 | /fire-history-all 路由补齐 |
| | 分页同步 | 🚧 | 大数据量分页同步 |

---

## 3. 技术架构

### 3.1 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 19.x |
| 构建工具 | Vite | 6.x |
| 类型系统 | TypeScript | 5.x |
| UI组件 | Tailwind CSS | 3.x/4.x |
| 状态管理 | TanStack Query | 5.x |
| 桌面框架 | Tauri | 2.x |
| 后端语言 | Rust | 1.75+ |
| 数据库 | SQLite | 3.x |
| 图表库 | Recharts | 2.x |

### 3.2 项目结构

```
TL-item-monitor-Tauri/
├── src/                          # 前端源码
│   ├── app/
│   │   └── App.tsx               # 主应用组件
│   ├── components/
│   │   ├── dashboard/            # 页面组件
│   │   │   ├── DashboardContent.tsx     # 监控首页
│   │   │   ├── FirePriceComparePage.tsx  # 火价分析
│   │   │   ├── ItemsPage.tsx             # 物价数据
│   │   │   ├── PriceAnalysisPage.tsx     # 物价分析
│   │   │   ├── DealsPage.tsx             # 捡漏出货（实时监控）
│   │   │   ├── AIAnalysisPage.tsx        # AI分析
│   │   │   ├── DataMonitorPage.tsx       # 数据监控
│   │   │   ├── ImageAssistPage.tsx       # 识图助手(占位)
│   │   │   ├── StrategiesPage.tsx        # 策略管理(占位)
│   │   │   ├── SettingsPage.tsx          # 设置
│   │   │   └── ImportExportPage.tsx      # 导入导出
│   │   ├── layout/                 # 布局组件
│   │   │   ├── Sidebar.tsx         # 侧边导航
│   │   │   └── TopBar.tsx          # 顶部栏
│   │   └── ui/                    # UI组件
│   ├── lib/
│   │   ├── commands.ts             # Tauri命令定义
│   │   └── query.ts               # QueryClient配置
│   ├── contexts/                  # React Context
│   │   ├── SectionRefreshContext.tsx  # 刷新上下文
│   │   └── ToastContext.tsx          # Toast通知
│   ├── hooks/                     # 自定义Hooks
│   └── main.tsx                   # 入口文件
├── src-tauri/                    # Tauri后端
│   ├── src/
│   │   ├── commands/              # Rust命令
│   │   │   ├── fire.rs           # 火价相关
│   │   │   ├── items.rs          # 物品相关
│   │   │   ├── sections.rs        # 分组相关
│   │   │   ├── alerts.rs         # 预警相关
│   │   │   └── season.rs         # 赛季相关
│   │   ├── db/                   # 数据库
│   │   │   ├── mod.rs
│   │   │   ├── models.rs
│   │   │   ├── table_resolver.rs
│   │   │   ├── repo_fire.rs
│   │   │   ├── repo_items.rs
│   │   │   ├── repo_sections.rs
│   │   │   ├── repo_history.rs
│   │   │   ├── repo_alerts.rs
│   │   │   ├── repo_config.rs
│   │   │   ├── repo_realtime_fire.rs    # 实时火价监控
│   │   │   └── migrations/              # 迁移文件
│   │   ├── scheduler/              # 后台任务
│   │   │   ├── fire_task.rs      # 火价采集任务
│   │   │   ├── items_task.rs      # 物品采集任务
│   │   │   ├── history_task.rs    # 快照任务
│   │   │   ├── alert_task.rs     # 预警任务
│   │   │   └── realtime_fire_task.rs  # 实时火价采集
│   │   ├── core/                 # 核心逻辑
│   │   ├── scraper/              # 爬虫
│   │   └── bin/
│   │       └── server.rs          # 服务器采集器
│   └── Cargo.toml
└── DEVELOPMENT_GUIDE.md           # 本文档
```

---

## 4. 数据库设计

### 4.1 核心表（分表架构）

#### 实时表（无赛季后缀，当前赛季数据）

| 表名 | 说明 | 字段 |
|------|------|------|
| `items_normal` | 普通服物品 | item_id, name, item_type, price, updated_at |
| `items_expert` | 专家服物品 | 同上 |
| `fire_price_normal` | 普通服火价 | rmb_per_10k_fire, fire_per_rmb, increase_ratio, scraped_at |
| `fire_price_expert` | 专家服火价 | 同上 |

#### 历史快照表（有赛季后缀）

| 表名 | 说明 |
|------|------|
| `item_snapshots_{season}_{mode}` | 物品价格快照 |
| `fire_price_snapshots_{season}_{mode}` | 火价快照 |

#### 实时火价监控表

| 表名 | 说明 |
|------|------|
| `item_realtime_fire_prices` | 近3小时物品火价变化，用于捡漏出货 |

### 4.2 数据库表结构

| 表名 | 说明 | 状态 |
|------|------|------|
| `seasons` | 赛季表 | ✅ |
| `sections` | 分组表 | ✅ |
| `section_items` | 分组物品关联表 | ✅ |
| `alert_rules` | 预警规则表 | ✅ |
| `alert_events` | 预警事件表 | ✅ |
| `strategies` | 策略表 | ✅ |
| `source_diagnostics` | 数据源诊断表 | ✅ |
| `item_realtime_fire_prices` | 实时火价监控表 | ✅ |

### 4.3 迁移文件

| 文件 | 说明 |
|------|------|
| `001_initial.sql` | 初始表结构 |
| `002_add_constraints.sql` | 添加约束和索引 |
| `003_split_season_tables.sql` | 分表结构 |
| `004_remove_section_items_fk.sql` | 移除外键约束 |
| `005_add_season_api_configs.sql` | 添加API配置 |
| `006_add_season_day.sql` | 添加赛季天数字段 |
| `007_add_name_type_to_snapshots.sql` | 快照表添加name/type |
| `008_create_item_realtime_fire_prices.sql` | 创建实时火价监控表 |

### 4.4 TableResolver

用于根据赛季和模式解析表名：

```rust
// 实时表（无赛季后缀）
TableResolver::items_table("ss12", "season_normal")  // => "items_normal"
TableResolver::fire_price_table("ss12", "season_expert") // => "fire_price_expert"

// 快照表（有赛季后缀）
TableResolver::item_snapshots_table("ss12", "season_normal")  // => "item_snapshots_ss12_normal"
TableResolver::fire_price_snapshots_table("ss11", "season_expert") // => "fire_price_snapshots_ss11_expert"

// 实时火价表
TableResolver::realtime_fire_prices_table()  // => "item_realtime_fire_prices"
```

---

## 5. 后台任务

### 5.1 任务列表

| 任务 | 频率 | 说明 |
|------|------|------|
| `fire_task` | 30秒 | 采集火价数据 |
| `items_task` | 60秒 | 采集物品数据 |
| `history_task` | 60分钟 | 保存每小时快照 |
| `alert_task` | 60秒 | 检查预警规则 |
| `realtime_fire_task` | 30秒 | 采集实时火价变化 |

### 5.2 RealtimeFireTask 逻辑

```rust
// 每30秒执行
loop {
    // 1. 获取当前赛季和模式
    let ctx = state.active_context.read().clone();
    
    // 2. 从 items_normal/expert 获取物品数据
    // 3. 从 fire_price_normal/expert 获取火价比例
    // 4. 计算每件物品的火价 = 物品价格 * 火价比例
    // 5. 写入 item_realtime_fire_prices 表
    // 6. 清理3小时前的旧数据
}
```

### 5.3 FirePriceChangeItem 计算逻辑

```rust
// 获取近3小时数据，按时间分组获取：
// - 当前最新价格
// - 约5分钟前价格 (change_rate_5m)
// - 约3小时前价格 (change_rate_3h)

// 趋势判断：
// sharp_rise: >5%
// rise: 1%~5%
// fall: -1%~-5%
// sharp_fall: <-5%
// stable: -1%~1%
```

---

## 6. API接口

### 6.1 Tauri命令

| 命令 | 功能 | 状态 |
|------|------|------|
| **仪表盘** | | |
| `get_dashboard_summary` | 获取仪表盘摘要 | ✅ |
| `set_active_market_context` | 设置市场上下文 | ✅ |
| **火价** | | |
| `refresh_fire_price` | 刷新火价 | ✅ |
| `get_fire_history` | 获取火价历史 | ✅ |
| `get_fire_history_by_season` | 按赛季获取火价 | ✅ |
| `get_fire_price_compare` | 火价对比 | ✅ |
| `export_fire_history_csv` | 导出CSV | ✅ |
| `sync_fire_record` | 同步火价记录 | ✅ |
| **物品** | | |
| `refresh_items` | 刷新物品 | ✅ |
| `search_items` | 搜索物品 | ✅ |
| `get_item_types` | 获取物品类型 | ✅ |
| `get_items_price_compare` | 物品价格对比 | ✅ |
| `get_item_history_by_season` | 物品历史（赛季） | ✅ |
| `get_item_history_by_day` | 物品历史（天） | ✅ |
| `sync_items_record` | 同步物品记录 | ✅ |
| **实时监控** | | |
| `get_realtime_fire_changes` | 获取火价变化 | ✅ |
| `seed_realtime_fire_data` | 生成测试数据 | ✅ |
| **分组** | | |
| `get_sections` | 获取分组 | ✅ |
| `create_section` | 创建分组 | ✅ |
| `update_section` | 更新分组 | ✅ |
| `delete_section` | 删除分组 | ✅ |
| `reorder_sections` | 排序分组 | ✅ |
| `get_section_items` | 获取分组物品 | ✅ |
| `add_section_item` | 添加物品到分组 | ✅ |
| `update_section_item` | 更新分组物品 | ✅ |
| `remove_section_item` | 移除分组物品 | ✅ |
| **预警** | | |
| `get_alert_rules` | 获取预警规则 | ✅ |
| `create_alert_rule` | 创建预警规则 | ✅ |
| `update_alert_rule` | 更新预警规则 | ✅ |
| `toggle_alert_rule` | 切换预警规则 | ✅ |
| `delete_alert_rule` | 删除预警规则 | ✅ |
| `get_alert_events` | 获取预警事件 | ✅ |
| **配置** | | |
| `get_config` | 获取配置 | ✅ |
| `save_config` | 保存配置 | ✅ |
| `get_db_stats` | 数据库统计 | ✅ |
| `backup_database` | 备份数据库 | ✅ |
| `restore_database` | 恢复数据库 | ✅ |
| `export_watchlist_csv` | 导出CSV | ✅ |
| `import_watchlist_csv` | 导入CSV | ✅ |

### 6.2 服务器API

| 端点 | 功能 | 状态 |
|------|------|------|
| `GET /status` | 服务器状态 | ✅ |
| `GET /fire-history` | 火价历史 | ✅ |
| `GET /items-history` | 物品历史 | ✅ |
| `GET /health` | 健康检查 | ✅ |
| `GET /api-config` | 获取 API 配置 | ✅ |
| `POST /admin/init-season` | 初始化新赛季（需密码） | ✅ |
| `POST /admin/update-api-config` | 更新 API 配置（需密码） | ✅ |

---

## 10. 服务器端数据采集

### 10.1 概述

服务器端采集器是一个**独立的 Rust 程序**，用于从第三方 API 抓取火价和物品数据，并存储到本地 SQLite 数据库。

```
┌─────────────────────────────────────────────────────────────┐
│                    TL Monitor Server v3.1                    │
├─────────────────────────────────────────────────────────────┤
│  HTTP API Server (端口 8080)                                │
│  公开 API:                                                 │
│  ├── GET /status           - 服务器状态                      │
│  ├── GET /fire-history     - 火价历史                        │
│  ├── GET /items-history    - 单个物品历史                    │
│  ├── GET /items-history-all - 所有物品历史(批量同步)          │
│  ├── GET /api-config       - 获取 API 配置                    │
│  └── GET /health           - 健康检查                        │
│  管理员 API (需密码):                                      │
│  ├── POST /admin/init-season       - 初始化新赛季         │
│  └── POST /admin/update-api-config  - 更新 API 配置         │
├─────────────────────────────────────────────────────────────┤
│  数据采集任务 (每小时执行)                                    │
│  ├── 普通服火价  ──→  fire_price_snapshots_ss12_normal      │
│  ├── 普通服物品  ──→  item_snapshots_ss12_normal            │
│  ├── 专家服火价  ──→  fire_price_snapshots_ss12_expert      │
│  └── 专家服物品  ──→  item_snapshots_ss12_expert           │
└─────────────────────────────────────────────────────────────┘
         ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                         │
│  数据监控页面: 同步数据 / 管理员面板                          │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 运行方式

```bash
# 编译
cargo build --bin server --release

# 运行（使用默认配置）
./target/release/server

# 自定义配置
TL_DB_PATH=/custom/path.db ./target/release/server

# Docker 运行
docker run -v /data:/data -v /config:/config tl-monitor-server
```

### 10.3 配置文件

配置文件路径：`/config/server_config.yaml`

```yaml
season_id: "ss12"           # 当前赛季 ID
http_port: 8080             # HTTP API 端口
scrape_modes:
  - mode: "normal"          # 普通服
    enabled: true
  - mode: "expert"          # 专家服
    enabled: true
```

### 10.4 数据来源

#### 火价数据
- **API**: 千岛 API (`https://api.qiandao.com`)
- **Endpoint**: `/c2c-web/v1/common/currency-spu-price-list`
- **频率**: 每小时采集一次
- **Mode 映射**:
  - 普通服: tagId=1560053, specId=267416
  - 专家服: tagId=1560055, specId=267417

#### 物品数据
- **API**: 刷图小助手 API (`http://115.231.176.101:8080/get`)
- **参数**: `season_id` (计算公式: `200 * season_num - 1000 + mode_suffix`)
- **频率**: 每小时采集一次
- **Mode 映射**:
  - 普通服: mode_suffix = 1
  - 专家服: mode_suffix = 31

### 10.5 服务器端数据库表（与客户端一致）

| 表名 | 说明 |
|------|------|
| `fire_price_snapshots_{season}_{mode}` | 火价快照（普通服/专家服） |
| `item_snapshots_{season}_{mode}` | 物品价格快照（普通服/专家服） |

**说明**：服务器端表结构与客户端 `item_snapshots_*` 和 `fire_price_snapshots_*` 完全一致，同步时无需转换格式。

#### 火价快照表结构
```sql
CREATE TABLE fire_price_snapshots_{season}_{mode} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scraped_at)
)
```

#### 物品快照表结构
```sql
CREATE TABLE item_snapshots_{season}_{mode} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, scraped_at)
)
```

### 10.6 数据采集流程

```rust
// 1. 启动时执行首次采集
collect_all_modes(&state).await;

// 2. 每小时定时采集
loop {
    sleep(3600秒);
    collect_all_modes(&state).await;
}

// 3. 每个模式分别采集
async fn collect_all_modes(state) {
    for scrape_mode in config.scrape_modes {
        let market_mode = if scrape_mode.mode == "expert" { "season_expert" } else { "season_normal" };

        // 采集火价（必须先获取火价比例）
        let fire = Scraper::scrape_fire_price(market_mode).await;
        let fire_per_rmb = fire.fire_per_rmb;

        // 保存火价快照到 fire_price_snapshots_{season}_{mode}
        db::insert_fire_snapshot(&state.db, season_id, market_mode, &fire, timestamp).await;

        // 采集物品并计算火价
        let items = Scraper::scrape_items(season_id, market_mode).await;

        // 保存物品快照到 item_snapshots_{season}_{mode}
        // 物品火价 = 物品价格 * 火价比例
        db::insert_items_snapshots(&state.db, season_id, market_mode, fire_per_rmb, &items, timestamp).await;
    }
}
```

### 10.7 API 接口详细

#### GET /status
返回服务器状态和最后一次采集结果。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "server": "TL Monitor Server",
    "version": "3.0.0",
    "uptime_seconds": 3600,
    "season_id": "ss12",
    "last_collection": {
      "normal": {
        "timestamp": 1776384000,
        "fire_success": true,
        "fire_price": 1.23,
        "items_count": 100,
        "items_success": true,
        "error": null
      },
      "expert": { ... }
    },
    "next_collection": 1776387600
  }
}
```

**FireSnapshotRecord 响应格式** (GET /fire-history):
```json
{
  "rmb_per_10k_fire": 1.23,
  "fire_per_rmb": 8130.08,
  "increase_ratio": 2.5,
  "trading_volume": "",
  "source": "千岛API-赛季普通",
  "source_time": "2026-01-15T10:00:00Z",
  "scraped_at": 1776384000,
  "season_day": 1
}
```

**ItemSnapshotRecord 响应格式** (GET /items-history):
```json
{
  "item_id": "392019",
  "fire_price": 8130.08,
  "scraped_at": 1776384000,
  "season_day": 1
}
```

#### GET /fire-history
获取火价历史记录。

**参数**:
- `mode`: `normal` | `expert` (默认: `normal`)
- `limit`: 返回记录数 (默认: 24)

#### GET /items-history
获取单个物品的价格历史。

**参数**:
- `mode`: `normal` | `expert` (默认: `normal`)
- `item_id`: 物品 ID (必填)
- `limit`: 返回记录数 (默认: 24)

#### GET /items-history-all
获取所有物品的最新价格记录（用于批量同步）。

**参数**:
- `mode`: `normal` | `expert` (默认: `normal`)
- `limit`: 返回记录数 (默认: 99999, 最大 1000)```

### 10.8 管理员 API（需密码验证）

只有知道管理员密码的用户才能执行以下操作：

#### POST /admin/init-season
初始化新赛季的数据库表。

**请求体**:
```json
{
  "password": "admin123",
  "season_id": "ss13",
  "season_name": "SS13 赛季"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "season_id": "ss13",
    "tables_created": ["fire_price_snapshots_ss13_normal", "fire_price_snapshots_ss13_expert", "item_snapshots_ss13_normal", "item_snapshots_ss13_expert"],
    "message": "新赛季初始化成功"
  }
}
```

#### POST /admin/update-api-config
更新服务器的 API 配置参数（千岛/刷图小助手的 tagId、specId 等）。

**请求体**:
```json
{
  "password": "admin123",
  "api_config": {
    "qiandao_tag_id_normal": "1560053",
    "qiandao_spec_id_normal": "267416",
    "qiandao_tag_id_expert": "1560055",
    "qiandao_spec_id_expert": "267417",
    "luosi_season_id_normal": 1401,
    "luosi_season_id_expert": 1431
  }
}
```

**注意**: 更新配置后需要重启服务器才能生效。

### 10.9 与 Tauri App 的集成

Tauri Desktop App 的"数据监控"页面调用服务器 API 获取数据：

```
Desktop App                          Server
    │                                   │
    │──── GET /fire-history?mode=normal │
    │◄─── 火价历史数据                   │
    │                                   │
    │──── GET /items-history-all ──────→│
    │◄─── 所有物品历史 (JSON)            │
    │                                   │
    │  调用 sync_fire_record 命令       │
    │  写入本地数据库                   │
    │                                   │
    │  调用 sync_items_record 命令      │
    │  写入本地数据库                   │
    │                                   │
    │  [管理员] POST /admin/init-season  │ 初始化新赛季
    │  [管理员] POST /admin/update-api-config  │ 更新API配置
```

---

## 11. 实时火价监控任务

### 11.1 概述

`realtime_fire_task` 是 Tauri Desktop App 的后台任务，每 30 秒采集一次物品火价数据，用于"捡漏出货"页面的实时监控。

### 11.2 数据流程

```
items_normal / items_expert (实时表)
        │
        │ 每30秒采集一次
        ▼
item_realtime_fire_prices 表 (近3小时数据)
        │
        │ 清理3小时前的旧数据
        ▼
前端查询 get_realtime_fire_changes
        │
        ▼
捡漏出货页面展示
```

### 11.3 采集逻辑

```rust
async fn collect_fire_prices_internal(pool, state) {
    // 1. 获取当前赛季和模式
    let ctx = state.active_context.read().clone();

    // 2. 从 fire_price_normal/expert 获取火价比例
    let fire_price = sqlx::query_as(
        "SELECT rmb_per_10k_fire FROM fire_price_normal ORDER BY scraped_at DESC LIMIT 1"
    ).fetch_one(pool).await?;

    let fire_per_rmb = 10000.0 / fire_price.rmb_per_10k_fire;

    // 3. 从 items_normal/expert 获取所有物品
    let items = sqlx::query_as(
        "SELECT item_id, name, price FROM items_normal"
    ).fetch_all(pool).await?;

    // 4. 计算每件物品的火价 = 物品价格 * 火价比例
    let records: Vec<(item_id, name, fire_price, now)> = items
        .into_iter()
        .map(|(item_id, name, price)| {
            let fire_price = price * fire_per_rmb;
            (item_id, name, fire_price, now)
        })
        .collect();

    // 5. 批量写入数据库
    repo_realtime_fire::batch_insert_realtime_fire_prices(pool, &records).await?;
}
```

### 11.4 变化率计算

```rust
// 获取近3小时数据，按时间分组获取各时间点的价格
let price_5m_ago = 数据中约5分钟前的价格;
let price_3h_ago = 数据中约3小时前的价格;

// 计算变化率
let change_rate_5m = (current_price - price_5m_ago) / price_5m_ago * 100;
let change_rate_3h = (current_price - price_3h_ago) / price_3h_ago * 100;

// 趋势判断（优先使用5分钟）
let trend = if change_rate > 5.0 "暴涨"
         else if change_rate > 1.0 "上涨"
         else if change_rate < -5.0 "暴跌"
         else if change_rate < -1.0 "下跌"
         else "平稳"
```

---

## 12. 更新日志

### v2.8 (2026-05-07)
- ✅ 服务器端添加管理员密码验证机制
- ✅ 服务器端添加 `admin_password` 配置项
- ✅ 服务器端添加 `api_config` 配置项（千岛/刷图小助手 API 参数）
- ✅ 新增管理员 API：`POST /admin/init-season` 初始化新赛季
- ✅ 新增管理员 API：`POST /admin/update-api-config` 更新 API 配置
- ✅ 新增公开 API：`GET /api-config` 获取当前 API 配置
- ✅ 客户端数据监控页面添加"服务器管理"面板
- ✅ 支持在 UI 上修改服务器 API 配置
- ✅ 支持在 UI 上初始化新赛季
- ✅ 开发文档更新服务器端架构说明

### v2.7 (2026-05-06)
- ✅ 服务器端数据库表结构与客户端统一
- ✅ 表名改为 `fire_price_snapshots_{season}_{mode}` 和 `item_snapshots_{season}_{mode}`
- ✅ 添加 `season_day` 字段到所有快照表
- ✅ 服务器端自动计算物品火价（物品价格 * 火价比例）
- ✅ 物品存储 `fire_price` 而非原始价格
- ✅ 同步时无需数据格式转换

---

## 7. 开发指南

### 7.1 环境要求

- Node.js 18+
- Rust 1.75+
- Xcode Command Line Tools (macOS)

### 7.2 常用命令

```bash
# 安装依赖
npm install

# 开发模式（前端+Vite）
npm run dev

# Tauri开发模式（完整）
npm run tauri dev

# 构建
npm run build

# 类型检查
npm run typecheck

# Rust检查
cd src-tauri && cargo check

# Rust测试
cd src-tauri && cargo test

# Rust格式化
cd src-tauri && cargo fmt
```

### 7.3 添加新功能流程

1. **前端组件**：在 `src/components/dashboard/` 创建页面组件
2. **后端命令**：在 `src-tauri/src/commands/` 添加Rust命令
3. **数据层**：在 `src-tauri/src/db/` 添加数据仓库
4. **后台任务**：在 `src-tauri/src/scheduler/` 添加后台任务
5. **接口定义**：在 `src/lib/commands.ts` 添加TypeScript定义
6. **路由**：在 `src/app/App.tsx` 添加页面路由
7. **导航**：在 `src/components/layout/Sidebar.tsx` 添加菜单项

### 7.4 添加新数据库迁移

1. 在 `src-tauri/src/db/migrations/` 创建 SQL 文件
2. 在 `run_migrations` 函数中添加迁移逻辑
3. 更新 `_migrations` 表版本

---

## 8. 项目规划

### 8.1 近期计划

| 优先级 | 功能 | 预计工时 |
|--------|------|----------|
| P0 | 预警规则接入后台任务 | 1-2天 |
| P0 | DataMonitor整赛季火价同步 | 1天 |
| P1 | 识图助手开发 | 3-5天 |
| P1 | 策略管理重新开发 | 2-3天 |
| P2 | 实时推送通知 | 1天 |
| P2 | 多赛季数据对比 | 1天 |

### 8.2 中期计划

- 数据可视化增强
- 用户行为分析
- 社区数据共享
- 移动端适配

---

## 9. 更新日志

### v2.6 (2026-05-05)
- ✅ 新增 `item_realtime_fire_prices` 表存储近3小时火价变化
- ✅ 新增 `realtime_fire_task` 后台任务每30秒采集数据
- ✅ 新增 `get_realtime_fire_changes` API 获取火价变化
- ✅ 新增 `seed_realtime_fire_data` API 生成测试数据
- ✅ 捡漏出货页面改为实时监控双列布局
- ✅ 支持5分钟和3小时两种变化率检测
- ✅ 趋势判断优先使用5分钟变化率
- ✅ 添加 `get_item_history_by_day` 命令查询当天数据
- ✅ 修复走势图 SS11 时间戳问题
- ✅ 修复走势图参数命名（驼峰 vs 下划线）
- ✅ 修复图表容器高度问题

### v2.5 (2026-05-04)
- ✅ 修复服务器端火价抓取（更新为新的千岛API接口）
- ✅ 修复火价分析时间轴显示（按小时段/赛季天数对齐）
- ✅ 修复Y轴显示负值问题
- ✅ 优化时间范围选项（移除1小时，改为12小时起步）
- ✅ 优化导入导出CSV格式
- ✅ 优化导入逻辑（通过物品名称搜索匹配）
- ✅ 添加导入错误提示（显示具体行号和错误原因）
- ✅ 修复SS11测试数据负数价格问题
- ✅ 添加赛季天数字段到数据库表

### v2.4 (2026-05-03)
- ✅ 修复火价普通/专家服隔离（按 season_id + market_mode 查询）
- ✅ 修复火价采集后立即入库
- ✅ 修复上下文切换后自动刷新火价缓存
- ✅ 修复捡漏出货使用真实历史快照数据
- ✅ 修复 deal 配置前后端模型一致
- ✅ 修复命令契约漂移（get_deal_alerts）
- ✅ 修复 item_history 写错表问题
- ✅ 修复 seasons 表种子数据
- ✅ 清理所有 Rust warning

### v2.3 (2026-05-02)
- ✅ 新增物价分析页面（囤货/出货建议）
- ✅ 新增AI配置页面（支持HERMES/OPENClAW）
- ✅ 新增捡漏出货页面（价格监控）
- ✅ 优化物价数据页面（列宽、筛选、搜索）
- ✅ 优化火价分析页面（布局调整）
- ✅ 修复文件导出权限问题
- ✅ 修复Tauri命令注册问题

### v2.2 (2026-04)
- ✅ 新增火价双赛季对比
- ✅ 新增物品价格历史对比
- ✅ 新增服务器端采集器
- ✅ 新增数据监控同步
- ✅ 重构数据库结构（分表存储）

---

## 13. HERMES Skill 集成

### 13.1 概述

AI分析页面现在支持通过HERMES Gateway直接调用已安装的Skills，实现更强大的功能扩展。

### 13.2 核心组件

| 文件 | 功能 |
|------|------|
| `src/lib/hermes.ts` | HermesGateway连接管理器，WebSocket通信 |
| `src/components/dashboard/SkillSelector.tsx` | Skill选择器UI组件 |
| `src/components/dashboard/AIAnalysisPage.tsx` | 集成HERMES连接的AI分析页面 |
| `src-tauri/src/commands/skills.rs` | Rust后端命令，读取本地skills |

### 13.3 HERMES Gateway API

**连接信息**:
- 地址: `ws://localhost:18789`
- Token: `clawx-888b6b1f5f407e4598fe7d63c82bc413`

**支持的消息类型**:

```typescript
// 客户端 → Gateway
type ClientMessage =
  | { type: "chat"; payload: { text: string; context?: object; options?: ChatOptions } }
  | { type: "skill_invoke"; payload: { skill: string; args: string } }
  | { type: "status"; payload: {} }
  | { type: "heartbeat_trigger"; payload: { dry_run?: boolean } };

// Gateway → 客户端
type ServerMessage =
  | { type: "response"; id: string; payload: { text: string; tool_calls: ToolCall[]; tokens_used: number } }
  | { type: "tool_call"; payload: { tool: string; args: object; status: "executing" } }
  | { type: "tool_result"; payload: { tool: string; output: string; exit_code: number } }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "heartbeat_status"; payload: { result: string; actions_taken: number; tokens_used: number } };
```

### 13.4 已安装的Skills

#### 系统Skills (`~/.openclaw/skills/`)
- **brave-web-search** - Brave网页搜索
- **docx** - Word文档处理
- **find-skills** - 查找和安装新skills
- **pdf** - PDF处理
- **pptx** - PowerPoint处理
- **self-improving-agent** - 自改进代理
- **tavily-search** - Tavily搜索
- **xlsx** - Excel处理

#### 工作区Skills (`~/.openclaw/workspace/skills/`)
- **brand-dna** - 品牌DNA分析
- **copywriting** - 文案撰写
- **douyin-live** - 抖音直播
- **pricing** - 定价策略
- **seo** - SEO优化
- **trading** - 交易策略
- 等等...

### 13.5 使用方法

1. **启用HERMES Gateway模式**
   - 在AI分析页面点击"配置"
   - 启用"HERMES Gateway"开关
   - 保存配置

2. **选择要使用的Skills**
   - 点击右侧"Skills"面板
   - 从列表中选择需要的Skills
   - 已选Skills会显示在上下文提示中

3. **开始对话**
   - 输入问题，HERMES会自动选择合适的Skill执行
   - 可以实时看到Tool Call的执行过程和结果

### 13.6 特性

- **实时Tool Call显示**: 实时显示正在执行的Skill和结果
- **Skill持久化**: 选择的Skills会保存在localStorage中
- **自动重连**: 连接断开后自动尝试重连
- **双模式支持**: 可以切换回传统API模式
