# TL 物品火价监控 - 开发文档

## 1. 项目概述

**项目名称**：TL 物品火价监控
**版本**：v3.1
**最后更新**：2026-05-13
**状态**：核心功能稳定，UI组件系统统一，8大核心页面已完成视觉迁移

基于 Tauri 2.0 + React + TypeScript + Rust + SQLite 的桌面应用，用于监控火炬之光（Torchlight）游戏中的物品价格和火价（游戏货币汇率）。

***

## 2. 功能清单

### 2.1 已实现功能 ✅

| 模块       | 功能               | 状态 | 说明                                |
| -------- | ---------------- | -- | --------------------------------- |
| **监控首页** | 分组管理             | ✅  | 创建/编辑/删除分组，添加物品到分组                |
| <br />   | 拖拽排序             | ✅  | 分组拖拽排序                            |
| <br />   | 物品监控             | ✅  | 显示物品当前价格、购买价格、溢价率                 |
| <br />   | 导入导出CSV          | ✅  | 支持UTF-8编码的CSV导入导出                 |
| **火价分析** | 当前火价显示           | ✅  | 实时显示当前火价（按赛季/模式隔离）                |
| <br />   | 火价走势图表           | ✅  | 双折线图对比当前赛季和历史赛季                   |
| <br />   | 赛季对比             | ✅  | SS12 vs SS11 同时间段对比               |
| <br />   | 模式隔离             | ✅  | 普通服/专家服数据完全隔离                     |
| **物价数据** | 物品搜索             | ✅  | 支持关键词搜索                           |
| <br />   | 类型筛选             | ✅  | 动态从数据库获取物品类型                      |
| <br />   | 赛季筛选             | ✅  | 对比赛季选择（SS11/SS10）                 |
| <br />   | 天数筛选             | ✅  | 输入第几天进行筛选                         |
| <br />   | 价格对比             | ✅  | 显示当前价格 vs 历史赛季价格                  |
| <br />   | 价格变化             | ✅  | 涨跌百分比和具体差值                        |
| <br />   | 价格走势             | ✅  | 点击查看双赛季价格曲线图                      |
| <br />   | 添加到分组            | ✅  | 直接添加到监控首页分组                       |
| **物价分析** | 囤货分析             | ✅  | 基于波动差+周期分析                        |
| <br />   | 最佳入手/出手时间        | ✅  | 显示赛季第几天+几点                        |
| <br />   | 预期收益计算           | ✅  | 计算预期收益率                           |
| <br />   | 置信度评分            | ✅  | 分析可信度评分                           |
| <br />   | 物品搜索             | ✅  | 支持关键词搜索                           |
| <br />   | 类型筛选             | ✅  | 下拉框筛选物品类型                         |
| <br />   | 加入分组             | ✅  | 添加到监控首页分组                         |
| <br />   | 价格走势             | ✅  | 点击查看上赛季物价曲线图                      |
| **捡漏出货** | 实时火价监控           | ✅  | 基于 item\_realtime\_fire\_prices 表 |
| <br />   | 5分钟涨跌检测          | ✅  | 优先使用5分钟变化率                        |
| <br />   | 3小时涨跌检测          | ✅  | 回退使用3小时变化率                        |
| <br />   | 双列表显示            | ✅  | 上涨/下跌分栏显示                         |
| <br />   | 阈值设置             | ✅  | 可配置涨跌百分比阈值（localStorage）          |
| <br />   | 自动数据采集           | ✅  | 后台任务每30秒自动采集                      |
| <br />   | 生成测试数据           | ✅  | 开发调试用测试数据生成                       |
| **AI分析** | AI对话             | ✅  | 对话框形式与AI交互                        |
| <br />   | HERMES Gateway直连 | ✅  | WebSocket直连本地Gateway              |
| <br />   | Skill选择器         | ✅  | 选择和启用已安装的Skills                   |
| <br />   | Tool Call显示      | ✅  | 实时显示Skill调用过程和结果                  |
| <br />   | 多提供商支持           | ✅  | HERMES(本地)/OPENClAW/自定义API        |
| <br />   | 配置管理             | ✅  | API地址、模型、密钥配置                     |
| <br />   | 连接测试             | ✅  | 测试AI连接是否成功                        |
| <br />   | 系统提示词            | ✅  | 可自定义AI角色和分析风格                     |
| <br />   | 智能上下文            | ✅  | 自动附带当前火价数据和已选Skills               |
| **策略管理** | 策略收益分析           | ✅  | 创建/编辑/删除策略，按盈亏排序展示                |
| <br />   | 成本/产出配置          | ✅  | 支持成本物品、产出物品、数量和实时价格刷新             |
| <br />   | 收益计算             | ✅  | 基于实时物价计算总成本、总产出和收益率               |
| **数据监控** | 服务器状态            | ✅  | 显示服务器连接状态                         |
| <br />   | 数据采集状态           | ✅  | 显示采集器工作状态                         |
| <br />   | 数据同步             | ✅  | 同步服务器数据到本地                        |
| <br />   | 赛季同步             | ✅  | 同步整个赛季数据                          |
| **预警规则** | 命令与数据表           | ✅  | alert_rules / alert_events CRUD 已注册 |
| <br />   | 通知任务             | ✅  | 基于监控列表价格倒挂发送系统通知                  |
| <br />   | 开关控制             | ✅  | 设置页支持价格预警开关和冷却配置                  |
| **设置**   | 应用配置             | ✅  | 赛季、模式、数据源等配置                      |
| <br />   | 通知设置             | ✅  | 系统通知、语音提醒等                        |
| <br />   | 桌面设置             | ✅  | 启动项、窗口行为等                         |
| <br />   | AI设置             | ✅  | AI提供商配置（localStorage存储）           |
| **导入导出** | CSV导入导出          | ✅  | 监控列表导入导出                          |
| <br />   | 数据库备份            | ✅  | 备份和恢复数据库                          |
| **其他**   | 系统托盘             | ✅  | 最小化到托盘                            |
| <br />   | 自动更新             | ✅  | 定时抓取火价和物品数据                       |
| <br />   | 历史记录             | ✅  | 每小时保存价格快照                         |
| <br />   | 上下文切换            | ✅  | 赛季/模式切换后自动刷新数据                    |

### 2.2 待开发功能 🚧

> 业务调整：识图助手整板块已取消，不再开放入口，也不进入后续规划。

| 模块       | 功能         | 状态 | 说明                          |
| -------- | ---------- | -- | --------------------------- |
| **策略管理** | 策略推荐       | 🚧 | 基于数据的策略推荐                   |
| <br />   | 策略模板       | 🚧 | 常用打宝策略模板和复用                  |
| **预警规则** | 独立管理页面     | 🚧 | 暂无侧边栏入口，前端未消费 alert_rules CRUD |
| <br />   | 规则任务接入     | 🚧 | alert_task 尚未按 alert_rules 逐条判断 |
| **数据监控** | 分页/增量同步    | 🚧 | 大数据量同步的分批拉取和部分失败明细展示          |

***

## 3. 技术架构

### 3.1 技术栈

| 层级   | 技术             | 版本      |
| ---- | -------------- | ------- |
| 前端框架 | React          | 19.x    |
| 构建工具 | Vite           | 6.x     |
| 类型系统 | TypeScript     | 5.x     |
| UI组件 | Tailwind CSS   | 3.x/4.x |
| 状态管理 | TanStack Query | 5.x     |
| 桌面框架 | Tauri          | 2.x     |
| 后端语言 | Rust           | 1.75+   |
| 数据库  | SQLite         | 3.x     |
| 图表库  | Recharts       | 2.x     |

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
│   │   │   ├── StrategiesPage.tsx        # 策略收益分析
│   │   │   ├── SettingsPage.tsx          # 设置
│   │   │   ├── ImportExportPage.tsx      # 导入导出
│   │   │   ├── HelpPage.tsx             # 帮助页
│   │   │   ├── ServerAdminPanel.tsx       # 服务器管理面板
│   │   │   ├── AddItemModal.tsx          # 添加物品弹窗
│   │   │   ├── AddSectionDialog.tsx      # 添加分组弹窗
│   │   │   ├── ItemPriceTrendModal.tsx   # 价格趋势弹窗
│   │   │   ├── SkillSelector.tsx          # Skill选择器
│   │   │   ├── GroupCard.tsx             # 分组卡片
│   │   │   ├── SortableGroupCard.tsx     # 可拖拽分组卡片
│   │   │   └── SearchBar.tsx             # 搜索栏
│   │   ├── layout/                 # 布局组件
│   │   │   ├── Sidebar.tsx         # 侧边导航
│   │   │   └── TopBar.tsx          # 顶部栏
│   │   ├── charts/                 # 图表组件
│   │   │   └── FireTrendChart.tsx  # 火价趋势图表
│   │   └── ui/                    # UI组件
│   ├── lib/
│   │   ├── commands.ts             # Tauri命令定义
│   │   ├── query.ts               # QueryClient配置
│   │   ├── utils.ts               # 工具函数
│   │   └── hermes.ts              # Hermes Gateway连接
│   ├── contexts/                  # React Context
│   │   ├── SectionRefreshContext.tsx  # 刷新上下文
│   │   └── ToastContext.tsx          # Toast通知
│   ├── hooks/
│   │   └── useTauriEvents.ts       # Tauri事件监听
│   └── types.ts                   # 全局类型定义
├── src-tauri/                    # Tauri后端
│   ├── src/
│   │   ├── commands/              # Rust命令
│   │   │   ├── fire.rs           # 火价相关
│   │   │   ├── items.rs          # 物品相关
│   │   │   ├── sections.rs        # 分组相关
│   │   │   ├── alerts.rs         # 预警相关
│   │   │   ├── deals.rs          # 捡漏出货相关
│   │   │   ├── season.rs         # 赛季相关
│   │   │   ├── diagnostics.rs    # 数据源诊断
│   │   │   ├── skills.rs         # Skills相关
│   │   │   ├── strategies.rs     # 策略相关
│   │   │   ├── config.rs         # 配置相关
│   │   │   ├── import_export.rs  # 导入导出
│   │   │   └── openclaw.rs       # OpenClaw相关
│   │   ├── db/                   # 数据库
│   │   │   ├── models.rs         # 数据模型
│   │   │   ├── table_resolver.rs # 表名解析
│   │   │   ├── repo_fire.rs      # 火价仓库
│   │   │   ├── repo_items.rs     # 物品仓库
│   │   │   ├── repo_sections.rs  # 分组仓库
│   │   │   ├── repo_history.rs   # 历史仓库
│   │   │   ├── repo_alerts.rs    # 预警仓库
│   │   │   ├── repo_config.rs    # 配置仓库
│   │   │   ├── repo_realtime_fire.rs    # 实时火价仓库
│   │   │   ├── repo_season_api.rs      # 赛季API仓库
│   │   │   ├── repo_source_diagnostics.rs # 数据源诊断仓库
│   │   │   ├── repo_strategies.rs      # 策略仓库
│   │   │   └── migrations/              # 迁移文件(001-008)
│   │   ├── scheduler/              # 后台任务
│   │   │   ├── fire_task.rs      # 火价采集任务
│   │   │   ├── items_task.rs      # 物品采集任务
│   │   │   ├── history_task.rs    # 快照任务
│   │   │   ├── alert_task.rs     # 预警任务
│   │   │   └── realtime_fire_task.rs  # 实时火价采集
│   │   ├── core/                 # 核心逻辑
│   │   │   ├── state.rs         # 应用状态
│   │   │   ├── events.rs        # 事件定义
│   │   │   ├── config.rs        # 配置加载
│   │   │   └── paths.rs        # 路径工具
│   │   ├── scraper/              # 爬虫
│   │   │   ├── qiandao.rs       # 千岛火价抓取
│   │   │   └── luosi.rs        # 罗四物品抓取
│   │   ├── server/               # 内置服务器模块
│   │   │   ├── config.rs        # 服务器配置
│   │   │   ├── db.rs           # 服务器数据库
│   │   │   └── scraper.rs      # 服务器抓取
│   │   ├── services/             # 服务层
│   │   │   ├── worth_service.rs  # 价值评估
│   │   │   └── notification_service.rs # 通知服务
│   │   ├── bin/
│   │   │   └── server.rs          # 服务器采集器（内置独立server）
│   │   ├── app.rs               # 应用初始化
│   │   ├── lib.rs               # 库导出
│   │   ├── main.rs              # 主入口
│   │   └── tray.rs              # 系统托盘
│   └── Cargo.toml
├── web-server/                   # 独立Web服务器（可选）
│   ├── src/
│   │   └── main.rs              # Axum服务器入口
│   └── static/
│       └── index.html            # 静态页面
└── docs/
    └── DEVELOPMENT_GUIDE.md      # 本文档
```

***

## 4. 数据库设计

### 4.1 核心表（分表架构）

#### 实时表（无赛季后缀，当前赛季数据）

| 表名                  | 说明    | 字段                                                                |
| ------------------- | ----- | ----------------------------------------------------------------- |
| `items_normal`      | 普通服物品 | item\_id, name, item\_type, price, updated\_at                    |
| `items_expert`      | 专家服物品 | 同上                                                                |
| `fire_price_normal` | 普通服火价 | rmb\_per\_10k\_fire, fire\_per\_rmb, increase\_ratio, scraped\_at |
| `fire_price_expert` | 专家服火价 | 同上                                                                |

#### 历史快照表（有赛季后缀）

| 表名                                     | 说明     |
| -------------------------------------- | ------ |
| `item_snapshots_{season}_{mode}`       | 物品价格快照 |
| `fire_price_snapshots_{season}_{mode}` | 火价快照   |

#### 实时火价监控表

| 表名                          | 说明                |
| --------------------------- | ----------------- |
| `item_realtime_fire_prices` | 近3小时物品火价变化，用于捡漏出货 |

### 4.2 数据库表结构

| 表名                          | 说明      | 状态 |
| --------------------------- | ------- | -- |
| `seasons`                   | 赛季表     | ✅  |
| `sections`                  | 分组表     | ✅  |
| `section_items`             | 分组物品关联表 | ✅  |
| `alert_rules`               | 预警规则表   | ✅  |
| `alert_events`              | 预警事件表   | ✅  |
| `strategies`                | 策略表     | ✅  |
| `source_diagnostics`        | 数据源诊断表  | ✅  |
| `item_realtime_fire_prices` | 实时火价监控表 | ✅  |

### 4.3 迁移文件

| 文件                                         | 说明             |
| ------------------------------------------ | -------------- |
| `001_initial.sql`                          | 初始表结构          |
| `002_add_constraints.sql`                  | 添加约束和索引        |
| `003_split_season_tables.sql`              | 分表结构           |
| `004_remove_section_items_fk.sql`          | 移除外键约束         |
| `005_add_season_api_configs.sql`           | 添加API配置        |
| `006_add_season_day.sql`                   | 添加赛季天数字段       |
| `007_add_name_type_to_snapshots.sql`       | 快照表添加name/type |
| `008_create_item_realtime_fire_prices.sql` | 创建实时火价监控表      |

### 4.4 数据库仓库 (Repository)

| 文件 | 说明 | 状态 |
| --- | --- | --- |
| `repo_fire.rs` | 火价数据仓库 | ✅ |
| `repo_items.rs` | 物品数据仓库（含搜索、分页） | ✅ |
| `repo_sections.rs` | 分组管理仓库 | ✅ |
| `repo_history.rs` | 历史快照仓库、火价对比 | ✅ |
| `repo_alerts.rs` | 预警规则和事件仓库 | ✅ |
| `repo_config.rs` | 配置管理仓库 | ✅ |
| `repo_realtime_fire.rs` | 实时火价监控仓库 | ✅ |
| `repo_season_api.rs` | 赛季API配置仓库 | ✅ |
| `repo_source_diagnostics.rs` | 数据源诊断仓库 | ✅ |
| `repo_strategies.rs` | 策略仓库 | ✅ |
| `models.rs` | 数据模型定义 | ✅ |
| `table_resolver.rs` | 表名解析器 | ✅ |

### 4.5 TableResolver

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

***

## 5. 后台任务

### 5.1 任务列表

| 任务                   | 频率   | 说明       |
| -------------------- | ---- | -------- |
| `fire_task`          | 30秒  | 采集火价数据   |
| `items_task`         | 60秒  | 采集物品数据   |
| `history_task`       | 60分钟 | 保存每小时快照  |
| `alert_task`         | 60秒  | 检查监控列表价格倒挂 |
| `realtime_fire_task` | 30秒  | 采集实时火价变化 |

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

***

## 6. API接口

### 6.1 Tauri命令

| 命令                           | 功能       | 状态     |
| ---------------------------- | -------- | ------ |
| **仪表盘**                      | <br />   | <br /> |
| `get_dashboard_summary`      | 获取仪表盘摘要  | ✅      |
| `set_active_market_context`  | 设置市场上下文  | ✅      |
| **火价**                       | <br />   | <br /> |
| `refresh_fire_price`         | 刷新火价     | ✅      |
| `get_fire_history`           | 获取火价历史   | ✅      |
| `get_fire_history_by_season` | 按赛季获取火价  | ✅      |
| `get_fire_price_compare`     | 火价对比     | ✅      |
| `export_fire_history_csv`    | 导出CSV    | ✅      |
| `sync_fire_record`           | 同步火价记录   | ✅      |
| **物品**                       | <br />   | <br /> |
| `refresh_items`              | 刷新物品     | ✅      |
| `search_items`               | 搜索物品     | ✅      |
| `get_item_types`             | 获取物品类型   | ✅      |
| `get_items_price_compare`    | 物品价格对比   | ✅      |
| `get_item_history_by_season` | 物品历史（赛季） | ✅      |
| `get_item_history_by_day`    | 物品历史（天）  | ✅      |
| `sync_items_record`          | 同步物品记录   | ✅      |
| **实时监控**                     | <br />   | <br /> |
| `get_realtime_fire_changes`  | 获取火价变化   | ✅      |
| `seed_realtime_fire_data`    | 生成测试数据   | ✅      |
| **分组**                       | <br />   | <br /> |
| `get_sections`               | 获取分组     | ✅      |
| `create_section`             | 创建分组     | ✅      |
| `update_section`             | 更新分组     | ✅      |
| `delete_section`             | 删除分组     | ✅      |
| `reorder_sections`           | 排序分组     | ✅      |
| `get_section_items`          | 获取分组物品   | ✅      |
| `add_section_item`           | 添加物品到分组  | ✅      |
| `update_section_item`        | 更新分组物品   | ✅      |
| `remove_section_item`        | 移除分组物品   | ✅      |
| **预警**                       | <br />   | <br /> |
| `get_alert_rules`            | 获取预警规则   | ✅      |
| `create_alert_rule`          | 创建预警规则   | ✅      |
| `update_alert_rule`          | 更新预警规则   | ✅      |
| `toggle_alert_rule`          | 切换预警规则   | ✅      |
| `delete_alert_rule`          | 删除预警规则   | ✅      |
| `get_alert_events`           | 获取预警事件   | ✅      |
| **配置**                       | <br />   | <br /> |
| `get_config`                 | 获取配置     | ✅      |
| `save_config`                | 保存配置     | ✅      |
| `get_db_stats`               | 数据库统计    | ✅      |
| `backup_database`            | 备份数据库    | ✅      |
| `restore_database`           | 恢复数据库    | ✅      |
| `export_watchlist_csv`       | 导出CSV    | ✅      |
| `import_watchlist_csv`       | 导入CSV    | ✅      |
| **诊断**                       | <br />   | <br /> |
| `get_source_diagnostics`     | 获取数据源诊断   | ✅      |
| `test_source_connection`      | 测试数据源连接   | ✅      |

### 6.2 服务器API（内置 server.rs）

| 端点 | 功能 | 状态 |
| --- | --- | -- |
| `GET /status` | 服务器状态 | ✅ |
| `GET /fire-history` | 火价历史 | ✅ |
| `GET /fire-history-all` | 整赛季火价历史（批量同步） | ✅ |
| `GET /items-history` | 物品历史（需item_id） | ✅ |
| `GET /items-history-all` | 所有物品历史（批量同步） | ✅ |
| `GET /health` | 健康检查 | ✅ |
| `POST /api/admin/config` | 获取服务器/API 配置（需密码） | ✅ |
| `POST /api/admin/update-config` | 更新基础配置（需密码） | ✅ |
| `POST /admin/init-season` | 初始化新赛季（需密码） | ✅ |
| `POST /admin/update-api-config` | 更新 API 配置（需密码） | ✅ |

> 注意：内置 server 使用手写 TCP HTTP 解析，支持 URL decode 和 CORS 预检。

***

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
│  └── GET /health           - 健康检查                        │
│  管理员 API (需密码):                                      │
│  ├── POST /api/admin/config        - 获取服务器/API 配置      │
│  ├── POST /api/admin/update-config - 更新基础配置             │
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
  - 普通服: mode\_suffix = 1
  - 专家服: mode\_suffix = 31

### 10.5 服务器端数据库表（与客户端一致）

| 表名                                     | 说明              |
| -------------------------------------- | --------------- |
| `fire_price_snapshots_{season}_{mode}` | 火价快照（普通服/专家服）   |
| `item_snapshots_{season}_{mode}`       | 物品价格快照（普通服/专家服） |

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
- `limit`: 返回记录数 (默认: 99999, 最大 1000)\`\`\`

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

***

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

***

## 12. 更新日志

### v3.1 (2026-05-13)

- ✅ 完成8大核心页面UI组件迁移
- ✅ 新增 `PageShell`、`PageHeader`、`Surface` 组件
- ✅ 新增 `MetricCard`、`StatusBadge`、`EmptyState` 组件
- ✅ 修复颜色逻辑：上涨红色，下跌绿色（符合A股习惯）
- ✅ 修复策略推荐榜分数颜色逻辑
- ✅ 修复 `DealsPage` 涨跌幅颜色逻辑
- ✅ 统一所有页面视觉风格
- ✅ 更新 `UI_VISUAL_UNIFICATION_PLAN.md` 设计文档
- ✅ 更新 `DEVELOPMENT_GUIDE.md` 页面功能文档

### v3.0 (2026-05-06)

- ✅ 新增独立 `web-server/` 模块（Axum Web 服务器）
- ✅ 新增 `GET /fire-history-all` 整赛季火价同步接口
- ✅ 修复 server URL decode 参数解析问题
- ✅ 修复 `get_season_start` 返回类型错误
- ✅ 修复 CORS 预检请求处理
- ✅ season 表改为从数据库动态获取，不再硬编码
- ✅ 修复 scraper 未使用变量警告
- ✅ 移除 TypeScript `ignoreDeprecations` 不支持选项
- ✅ 清理 `.gitignore`，添加 `dist-react/` 排除
- ✅ 添加 `ServerAdminPanel.tsx` 服务器管理面板组件
- ✅ 清理过期文档，精简到 3 个核心文档
- ✅ 添加新命令：`get_source_diagnostics`、`test_source_connection`
- ✅ 添加新数据仓库：`repo_season_api.rs`、`repo_source_diagnostics.rs`
- ✅ 项目分析报告更新，修复 P1/P2 问题清单

### v2.8 (2026-05-07)

- ✅ 服务器端添加管理员密码验证机制
- ✅ 服务器端添加 `admin_password` 配置项
- ✅ 服务器端添加 `api_config` 配置项（千岛/刷图小助手 API 参数）
- ✅ 新增管理员 API：`POST /admin/init-season` 初始化新赛季
- ✅ 新增管理员 API：`POST /admin/update-api-config` 更新 API 配置
- ✅ 新增管理员 API：`POST /api/admin/config` 获取当前 API 配置
- ✅ 客户端数据监控页面添加"服务器管理"面板
- ✅ 支持在 UI 上修改服务器 API 配置
- ✅ 支持在 UI 上初始化新赛季
- ✅ 开发文档更新服务器端架构说明

### v2.7 (2026-05-06)

- ✅ 服务器端数据库表结构与客户端统一
- ✅ 表名改为 `fire_price_snapshots_{season}_{mode}` 和 `item_snapshots_{season}_{mode}`
- ✅ 添加 `season_day` 字段到所有快照表
- ✅ 服务器端自动计算物品火价（物品价格 \* 火价比例）
- ✅ 物品存储 `fire_price` 而非原始价格
- ✅ 同步时无需数据格式转换

***

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

数据库迁移必须遵循 [数据库迁移开发指南](DATABASE_MIGRATION_GUIDE.md)。核心流程：

1. 提升 `LATEST_SCHEMA_VERSION`
2. 更新 `001_initial.sql`，让新安装用户直接得到最新 schema
3. 在 `run_legacy_migrations` 添加幂等升级逻辑
4. 必要时更新 `validate_database` 和迁移测试
5. 运行 `cargo test migration_tests --lib` 和 `cargo check`

***

## 8. 项目规划

### 8.1 近期计划

| 优先级 | 功能                 | 预计工时 |
| --- | ------------------ | ---- |
| P0  | 预警规则接入后台任务         | 1-2天 |
| P1  | 预警规则独立管理页面         | 1-2天 |
| P1  | 策略推荐/模板化            | 2-3天 |
| P2  | DataMonitor分页/增量同步 | 1天   |
| P2  | 实时推送通知             | 1天   |
| P2  | 多赛季数据对比            | 1天   |

### 8.2 中期计划

- 数据可视化增强
- 用户行为分析
- 社区数据共享
- 移动端适配

***

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

- ✅ 修复火价普通/专家服隔离（按 season\_id + market\_mode 查询）
- ✅ 修复火价采集后立即入库
- ✅ 修复上下文切换后自动刷新火价缓存
- ✅ 修复捡漏出货使用真实历史快照数据
- ✅ 修复 deal 配置前后端模型一致
- ✅ 修复命令契约漂移（get\_deal\_alerts）
- ✅ 修复 item\_history 写错表问题
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

***

## 14. UI设计标准

详细设计标准请参考 [UI_VISUAL_UNIFICATION_PLAN.md](./UI_VISUAL_UNIFICATION_PLAN.md)

### 14.1 设计原则

- **视觉统一**: 所有页面使用统一的组件系统
- **语义化颜色**: 上涨红色，下跌绿色（符合A股习惯）
- **组件化开发**: 使用 `PageShell`、`PageHeader`、`Surface` 等组件

### 14.2 核心UI组件

| 组件 | 用途 | 状态 |
|------|------|------|
| `PageShell` | 页面容器，控制最大宽度 | ✅ 已实现 |
| `PageHeader` | 页面标题栏 | ✅ 已实现 |
| `Surface` | 面板容器 | ✅ 已实现 |
| `MetricCard` | 指标卡片 | ✅ 已实现 |
| `StatusBadge` | 状态徽章 | ✅ 已实现 |
| `EmptyState` | 空状态提示 | ✅ 已实现 |
| `Toolbar` | 工具栏 | ✅ 已实现 |

### 14.3 语义化颜色规则

| 场景 | 颜色 | 示例 |
|------|------|------|
| 价格上涨 | `text-red-500` | +5.2% |
| 价格下跌 | `text-green-500` | -3.1% |
| 暴涨标签 | `StatusBadge variant="danger"` | 暴涨 |
| 暴跌标签 | `StatusBadge variant="success"` | 暴跌 |
| 出货机会 | 红色边框 | FireChangeCard |
| 捡漏机会 | 绿色边框 | FireChangeCard |

### 14.4 页面迁移状态

| 页面 | 状态 | 使用的组件 |
|------|------|------------|
| `DealsPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, Surface |
| `DashboardStats.tsx` | ✅ 已迁移 | MetricCard, StatusBadge |
| `ItemsPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, MetricCard |
| `DataMonitorPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, Surface |
| `ArbitragePage.tsx` | ✅ 已迁移 | PageShell, PageHeader, MetricCard |
| `StrategiesPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, Surface |
| `AlertsPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, Surface |
| `SettingsPage.tsx` | ✅ 已迁移 | PageShell, PageHeader, Surface |

### 14.5 开发规范

1. **页面结构**: 使用 `PageShell` 包裹页面内容
2. **页面头部**: 使用 `PageHeader` 组件
3. **数据卡片**: 使用 `MetricCard` 组件
4. **面板容器**: 使用 `Surface` 组件
5. **颜色语义**: 上涨红色，下跌绿色

***

## 15. 页面功能详解

详细页面功能逻辑和组件使用请参考 [UI_VISUAL_UNIFICATION_PLAN.md](./UI_VISUAL_UNIFICATION_PLAN.md)

### 15.1 捡漏出货页面 (DealsPage)

**功能**: 实时监控物品价格变化，检测涨跌机会

**核心逻辑**:
1. 每30秒从后端获取实时火价变化数据
2. 根据阈值筛选出货（涨幅≥阈值）和捡漏（跌幅≥阈值）物品
3. 显示5m/30m/1h/3h四个时间段的涨跌幅
4. 计算最大变化率和趋势判断

**颜色规则**:
- 出货机会: 红色边框 + 红色图标
- 捡漏机会: 绿色边框 + 绿色图标
- 涨跌幅: 上涨红色，下跌绿色

**组件使用**:
```tsx
<PageShell size="xl">
  <PageHeader title="捡漏出货" icon={TrendingUp} />
  <Surface>
    {/* 出货列表 */}
    <Surface interactive className="border-red-100">
      {/* 红色边框表示出货 */}
    </Surface>
    {/* 捡漏列表 */}
    <Surface interactive className="border-green-100">
      {/* 绿色边框表示捡漏 */}
    </Surface>
  </Surface>
</PageShell>
```

### 15.2 物品数据页面 (ItemsPage)

**功能**: 搜索和浏览游戏物品价格

**核心逻辑**:
1. 支持关键词搜索（300ms防抖）
2. 类型筛选（动态从数据库获取）
3. 天数筛选（输入第几天）
4. 赛季对比（当前赛季 vs 历史赛季）
5. 价格变化计算和显示

**颜色规则**:
- 价格上涨: 红色
- 价格下跌: 绿色
- 走势箭头: 上涨红色，下跌绿色

**组件使用**:
```tsx
<PageShell size="xl">
  <PageHeader title="物价数据" icon={Database} />
  <MetricCard label="平均价格" value={avg} icon={ArrowUpDown} />
  <MetricCard label="最高价格" value={max} icon={ArrowUp} />
  <MetricCard label="最低价格" value={min} icon={ArrowDown} />
  <Surface padding="md">
    <Toolbar>
      {/* 筛选器 */}
    </Toolbar>
  </Surface>
  <Surface padding="none">
    {/* 数据表格 */}
  </Surface>
</PageShell>
```

### 15.3 数据监控页面 (DataMonitorPage)

**功能**: 管理和监控服务器数据同步

**核心逻辑**:
1. 检测服务器连接状态
2. 显示服务器采集状态（普通服/专家服）
3. 支持数据同步操作
4. 分页同步大数据量

**组件使用**:
```tsx
<PageShell size="xl">
  <PageHeader title="数据监控" icon={Database} />
  <Surface padding="lg">
    {/* 服务器连接状态 */}
    <StatusBadge variant={connected ? "success" : "danger"} />
  </Surface>
  <Surface padding="lg">
    {/* 采集状态卡片 */}
  </Surface>
  <Surface padding="lg">
    {/* 同步操作面板 */}
  </Surface>
</PageShell>
```

### 15.4 套利比价页面 (ArbitragePage)

**功能**: 分解、合成、材料兑换全场景比价分析

**核心逻辑**:
1. 管理配方（分解/合成/兑换）
2. 计算配方成本和产出
3. 计算利润率
4. 按盈亏筛选显示

**颜色规则**:
- 盈利配方: 红色边框
- 亏损配方: 绿色边框
- 利润率: 正红色，负绿色

### 15.5 策略管理页面 (StrategiesPage)

**功能**: 管理游戏策略、成本和产出数据

**核心逻辑**:
1. 创建/编辑/删除策略
2. 配置成本物品和产出物品
3. 计算收益率和净收益
4. 策略推荐榜排序

**颜色规则**:
- 高分策略(80+): 红色
- 中高分(60-79): 橙色
- 中等(40-59): 黄色
- 低分(0-39): 绿色

### 15.6 预警规则页面 (AlertsPage)

**功能**: 设置和管理价格预警规则

**核心逻辑**:
1. 创建预警规则（价格高于/低于）
2. 启用/禁用规则
3. 查看预警事件历史

**组件使用**:
```tsx
<PageShell size="xl">
  <PageHeader title="预警规则" icon={Bell} />
  <Surface padding="none">
    {/* 筛选器 */}
    <SegmentedControl />
    {/* 规则列表 */}
    <Surface interactive>
      <StatusBadge variant={rule.enabled ? "success" : "default"} />
    </Surface>
  </Surface>
</PageShell>
```

### 15.7 设置页面 (SettingsPage)

**功能**: 配置应用参数

**核心逻辑**:
1. 赛季设置
2. 火价监控设置
3. 物品数据设置
4. 价格预警设置
5. 数据库管理

**组件使用**:
```tsx
<PageShell size="lg">
  <PageHeader title="系统设置" icon={Settings} />
  <Surface padding="lg">
    {/* 赛季设置 */}
  </Surface>
  <Surface padding="lg">
    {/* 监控设置 */}
  </Surface>
  <Surface padding="lg">
    {/* 预警设置 */}
  </Surface>
</PageShell>
```

***

## 13. HERMES Skill 集成

### 13.1 概述

AI分析页面现在支持通过HERMES Gateway直接调用已安装的Skills，实现更强大的功能扩展。

### 13.2 核心组件

| 文件                                            | 功能                             |
| --------------------------------------------- | ------------------------------ |
| `src/lib/hermes.ts`                           | HermesGateway连接管理器，WebSocket通信 |
| `src/components/dashboard/SkillSelector.tsx`  | Skill选择器UI组件                   |
| `src/components/dashboard/AIAnalysisPage.tsx` | 集成HERMES连接的AI分析页面              |
| `src-tauri/src/commands/skills.rs`            | Rust后端命令，读取本地skills            |

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
