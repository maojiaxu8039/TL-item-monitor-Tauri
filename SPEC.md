# TL物品火价监控 - 重构技术规格文档

## 一、项目概述

**项目名称**：TL物品火价监控（TL Fire Monitor）
**技术栈**：Tauri 2.0 + Rust 后端 + Vanilla JS/CSS 前端
**定位**：火炬之光游戏物品火价实时监控桌面应用
**参考设计**：第二张截图的 UI 风格（浅色主题 + 深色侧边栏 + 卡片式布局）

---

## 二、设计规范

### 2.1 配色方案

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景 | `#FFFFFF` | 纯白主区域 |
| 内容区卡片 | `#F7F8FA` | 浅灰蓝区块 |
| 侧边栏背景 | `#2F3B52` | 深蓝灰 |
| 侧边栏文字 | `#FFFFFF` | 白色图标+文字 |
| 标题/重要文字 | `#1F2A3C` | 深灰 |
| 普通文字 | `#6B7280` | 中灰 |
| 主色调/高亮 | `#3B82F6` | 蓝色（按钮、开关、选中态） |
| 火价高亮 | `#FF9F0D` | 橙色 |
| RMB/成功 | `#10B981` | 绿色 |
| 警告/不值 | `#EF4444` | 红色 |
| 边框/分隔线 | `#E5E7EB` | 浅灰 |
| 表格表头 | `#F3F4F6` | 更浅的灰 |

### 2.2 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  侧边栏(220px)  │              主内容区                      │
│                 │  ┌──────────────────────────────────────┐ │
│  Logo + 标题    │  │  顶部状态栏（火价卡片 | 总火 | 总RMB）  │ │
│                 │  ├──────────────────────────────────────┤ │
│  ● 监控面板  ←当前│  │  配置区（折叠：模式/间隔/开关/路径）   │ │
│  ○ 物品库    │  ├──────────────────────────────────────┤ │
│  ○ 数据记录  │  │  搜索栏（搜索框 + 类型筛选 + 导入/导出） │ │
│  ○ 火价走势  │  ├──────────────────────────────────────┤ │
│  ○ 设置      │  │                                      │ │
│                 │  │  板块卡片列表（可折叠/拖拽）          │ │
│  ─────────────  │  │  ┌──────────────────────────────┐  │ │
│                 │  │  │ 板块名 | 总火 | 总RMB | 操作  │  │ │
│  [用户头像]      │  │  │  物品列表（名称/火价/RMB/值得）│  │ │
│  在线状态       │  │  └──────────────────────────────┘  │ │
│                 │  │                                      │ │
│                 │  └──────────────────────────────────────┘ │
│                 │  ┌──────────────────────────────────────┐ │
│                 │  │  底栏状态：最后抓取时间 / DB条目数    │ │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 组件规范

- **侧边栏**：深色背景，白色图标/文字，当前选中项左侧蓝色竖线高亮（4px）
- **状态卡片**：白色圆角卡片，带图标 + 数值 + 标签
- **配置面板**：可折叠，白色背景，紧凑布局
- **板块卡片**：圆角卡片，顶部有彩色标识条，左侧可折叠展开物品列表
- **表格**：无竖线，仅横线分隔，表头浅灰背景，行间距舒适
- **开关**：蓝色开启态，灰色关闭态，滑动动画
- **按钮**：蓝色主按钮（#3B82F6），橙色辅助按钮（#FF9F0D）

---

## 三、功能模块

### 3.1 监控面板（首页）

**功能**：
- 显示当前火价（元/万火），橙色大字
- 实时总火价和总 RMB 汇总（来自所有板块）
- 点击火价数字 → 打开火价走势弹窗
- 板块管理：增删改，支持拖拽排序
- 每个板块内物品列表，支持增删
- 物品 Worth 评估（当前价 vs 基准more/火）
- 手动输入火价覆盖

**板块数据结构**：
```json
{
  "id": "string",
  "name": "string",
  "items": [
    {
      "id": "string",
      "name": "string",
      "type": "string",
      "price": 0,
      "count": 1,
      "more_per_fire": 0,
      "last_time": null
    }
  ]
}
```

**评估逻辑**：
- `more_per_fire` = 基准值（元/万火）÷ 当前火价
- 当前物品价值 = price × count × more_per_fire
- 评估：`值`（≥基准价的100%）| `可考虑`（80-100%）| `不值`（<80%）

### 3.2 物品库

**功能**：
- 分页展示数据库中所有物品
- 支持关键词搜索
- 显示物品名称/类型/价格/最后更新时间
- 点击物品 → 快速添加到指定板块

### 3.3 数据记录

**功能**：
- 火价历史走势折线图（ECharts）
- 时间范围选择：24小时 / 7天 / 30天
- 显示最高价、最低价、均价、涨跌幅

### 3.4 火价走势

**功能**：
- 独立火价走势页面/弹窗
- 折线图展示火价本身（元/万火）随时间变化
- 显示涨幅数据（百分比）

### 3.5 设置

**配置项**：
| 字段 | 类型 | 默认值 |
|------|------|--------|
| 火价模式 | 下拉 | 赛季普通 / 赛季专家 |
| 抓取间隔（秒） | 数字 | 300（最小60） |
| 自动抓取 | 开关 | 开 |
| 物品数据源 | 下拉 | local / etoru / luosi |
| JSON路径 | 文本 | data/full_table.json |
| 重载间隔（秒） | 数字 | 300（最小60） |
| 自动重载 | 开关 | 开 |

**操作**：保存配置后立即应用并触发一次抓取

---

## 四、后端 API 设计

### 4.1 HTTP API（前端通信）

**Base URL**：`http://127.0.0.1:19899`

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | `/health` | 健康检查 | `{"ok": true}` |
| GET | `/api/fire-price` | 获取当前火价 | `{"price_per_wan": 0.0, "record_time": "", "update_time": "", "source": ""}` |
| GET | `/api/items` | 获取物品列表 | `{"items": [...], "count": 0}` |
| GET | `/api/config` | 获取配置 | `{"input": {...}}` |
| POST | `/api/config` | 保存配置 | `{"status": "ok"}` |
| POST | `/api/scrape-fire` | 触发火价抓取 | `{"ok": true, "price_per_wan": 0.0}` |
| GET | `/api/sections` | 获取板块列表 | `[...]` |
| POST | `/api/sections` | 保存板块列表 | `{"ok": true}` |
| GET | `/api/db/stats` | 数据库统计 | `{"item_count": 0, "log_count": 0}` |
| GET | `/api/db/items?page=1&page_size=100&keyword=` | 分页查询物品 | `{"items": [...], "total": 0}` |
| GET | `/api/db/fire-history?item_id=&hours=24` | 物品火价历史 | `{"history": [...]}` |
| GET | `/api/db/fire-record-history?hours=24` | 火价记录历史 | `{"history": [...]}` |

### 4.2 Rust 命令（Tauri IPC - 系统操作）

| 命令 | 参数 | 说明 |
|------|------|------|
| `get_fire_price` | - | 获取火价（通过 State） |
| `get_items` | - | 获取物品列表 |
| `get_config` | - | 获取配置 |
| `set_config` | `input: AppConfig` | 保存配置 |
| `trigger_scrape_fire` | - | 触发火价抓取 |
| `trigger_items_reload` | - | 触发物品重载 |
| `get_sections` | - | 获取板块列表 |
| `save_sections` | `sections: Vec<Section>` | 保存板块列表 |
| `get_db_stats` | - | 数据库统计 |
| `get_fire_history` | `hours: u64` | 火价历史 |
| `get_item_history` | `item_name, hours` | 物品火价历史 |
| `import_csv` | `csv_content: String` | 导入 CSV |
| `export_csv` | - | 导出 CSV |

### 4.3 数据流

```
┌─────────────────────────────────────────────────────────┐
│  Rust Backend（Tauri App）                              │
│                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐  │
│  │ HTTP Server │   │  Background   │   │  SQLite   │  │
│  │ :19899      │   │  Threads     │   │  DB       │  │
│  └──────┬──────┘   └──────┬───────┘   └─────┬─────┘  │
│         │                 │                  │        │
│  ┌──────┴──────────────────┴──────────────────┴─────┐  │
│  │              Arc<AppState> (RwLock)              │  │
│  │  fire_price / items_data / config / sections     │  │
│  └──────────────────────────────────────────────────┘  │
│         ↑↓ invoke / fetch                              │
│  ┌──────┴─────────────────────────────────────────┐  │
│  │  Frontend（Vanilla JS/CSS, 嵌入dist/index.html） │  │
│  │  fetch('http://127.0.0.1:19899/api/...')         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 五、数据模型

### 5.1 AppConfig

```rust
struct AppConfig {
    fire_price_mode: String,        // "赛季普通" | "赛季专家"
    scrape_enabled: bool,
    scrape_interval: u64,           // 秒
    items_source: String,           // "local" | "etoru" | "luosi"
    json_path: String,
    reload_interval: u64,           // 秒
    auto_reload: bool,
    access_code: String,
}
```

### 5.2 FirePriceRecord

```rust
struct FirePriceRecord {
    id: Option<i64>,
    item_name: String,
    price: f64,          // 物品价格（火）
    unit: String,
    timestamp: String,
    category: String,
}

struct FirePriceResponse {
    success: bool,
    data: Option<Vec<FirePriceRecord>>,
    error: Option<String>,
    source: String,
}
```

### 5.3 ItemData

```rust
struct ItemData {
    id: Option<i64>,
    name: String,
    category: String,
    rarity: String,
    updated_at: String,
}
```

### 5.4 Section

```rust
struct Section {
    id: String,
    name: String,
    items: Vec<SectionItem>,
}

struct SectionItem {
    id: String,
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    price: f64,
    count: i32,
    more_per_fire: f64,
    last_time: Option<i64>,
}
```

---

## 六、技术实现

### 6.1 依赖

```
[dependencies]
tauri = { version = "2", features = ["tray-icon", "devtools"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full", "rt-multi-thread"] }
rusqlite = { version = "0.32", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json", "gzip", "blocking"] }
chrono = { version = "0.4", features = ["serde"] }
log = "0.4"
env_logger = "0.11"
parking_lot = "0.12"
flate2 = "1"
```

### 6.2 前端技术

- **HTML/CSS/JS**：纯原生，无框架依赖
- **图表**：ECharts（CDN 或本地 bundle）
- **布局**：Flexbox + CSS Grid，响应式
- **通信**：fetch() HTTP 调用（推荐）或 Tauri IPC invoke()
- **状态管理**：原生 JS STATE 对象
- **持久化**：localStorage（板块配置）+ Rust SQLite（历史数据）

### 6.3 后端任务

| 任务 | 触发方式 | 说明 |
|------|---------|------|
| 火价抓取 | 定时器（scrape_interval）| Node.js subprocess → qiandao_fire.js |
| 物品重载 | 定时器（reload_interval）| reqwest HTTP → 刷图小助手 API |
| 火价入库 | 每小时 | log_fire_price_record + log_fire_price |
| 物品同步 | 每小时 | upsert_items 到 SQLite |

### 6.4 火价抓取（Node.js subprocess）

```bash
node qiandao_fire.js <mode>
# mode: 普通 | pro
# 输出: JSON { ten_k, fire_per_rmb, increase_ratio, ... }
```

### 6.5 物品数据源

**刷图小助手**（主要）：
```
GET http://115.231.176.101:8080/get?season_id=1401
Response: { item_id: { name, price, last_time, ... }, ... }
```

---

## 七、文件结构

```
TL-item-monitor-Tauri/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       └── main.rs          # 所有 Rust 代码（命令、HTTP服务器、后台任务）
├── dist/                     # 前端（由构建命令生成）
│   ├── index.html
│   ├── styles/
│   │   └── main.css
│   ├── scripts/
│   │   └── app.js
│   └── assets/
│       ├── logo.png
│       └── chart.umd.min.js
├── qiandao_fire.js          # Node.js 火价抓取脚本
├── SPEC.md                  # 本文档
└── README.md
```

---

## 八、开发计划

### Phase 1：基础架构 ✅ 已完成（但需修复）
- [x] Tauri 2.0 项目初始化
- [x] Rust SQLite 数据库
- [x] Rust HTTP 服务器（端口 19899）
- [x] 板块 CRUD（Rust State + JSON 持久化）
- [x] 前端 HTML 基础布局

### Phase 2：核心功能
- [ ] 前端 - 新 UI 实现（浅色主题 + 深色侧边栏）
  - [ ] 侧边栏导航
  - [ ] 顶部状态栏（火价卡片 + 总火 + 总RMB）
  - [ ] 配置面板（折叠式）
  - [ ] 搜索栏 + 类型筛选
  - [ ] 板块卡片列表
  - [ ] 底栏状态
- [ ] 前端 - 监控面板 Tab
  - [ ] 板块增删改
  - [ ] 物品增删（搜索添加）
  - [ ] Worth 评估显示
  - [ ] 手动火价输入
- [ ] 前端 - 物品库 Tab
- [ ] 前端 - 数据记录 Tab（火价走势图表）
- [ ] 前端 - 火价走势 Tab
- [ ] 前端 - 设置 Tab

### Phase 3：后端完善
- [ ] 配置保存（YAML → Rust State）
- [ ] 火价抓取（Node.js subprocess 集成）
- [ ] 物品重载（刷图小助手 API）
- [ ] 定时任务调度
- [ ] SQLite 历史数据写入/查询

### Phase 4：系统集成
- [ ] 系统托盘
- [ ] 原生通知（飞书/webhook 扩展）
- [ ] 导入/导出 CSV
- [ ] Windows .exe 构建

---

## 九、原项目功能对照

| 原项目功能 | 重构后实现 |
|-----------|-----------|
| 赛季/专家模式切换 | ✅ 配置面板 |
| 定时火价抓取 | ✅ Rust 定时器 + Node.js subprocess |
| 定时物品重载 | ✅ Rust 定时器 + reqwest |
| 板块管理（增删改/拖拽） | ✅ 前端 JS + Rust State |
| 物品搜索 + 添加到板块 | ✅ 前端搜索 + API |
| Worth 评估（值/可考虑/不值） | ✅ 前端 JS 评估逻辑 |
| 火价历史走势 | ✅ ECharts 折线图 |
| SQLite 数据持久化 | ✅ rusqlite |
| 每小时火价入库 | ✅ Rust 定时任务 |
| 原生通知 | ✅ 托盘菜单（扩展：飞书） |
| 导入/导出 CSV | ✅ Rust + 前端 |
| 手动输入火价 | ✅ 前端输入框 |
| 自动浏览器打开 | ✅ Tauri window 配置 |
| 深色主题 | ❌ → 改为浅色主题（参考截图） |
