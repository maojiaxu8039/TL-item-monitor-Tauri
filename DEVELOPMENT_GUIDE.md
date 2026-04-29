# TL 物品火价监控桌面版 - 开发文档 v1.0

> 本文档记录 TL 物品火价监控桌面版的技术实现细节。
> 最后更新：2026-04-29

---

## 1. 项目概览

### 1.1 技术栈

| 层级 | 技术选型 |
|------|---------|
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI 库 | Tailwind CSS + shadcn/ui |
| 状态管理 | TanStack Query + Zustand |
| 数据库 | SQLite (sqlx) |
| HTTP 客户端 | reqwest |
| 托盘 | tauri-plugin-shell |
| 通知 | tauri-plugin-notification |
| 日志 | tauri-plugin-log |

### 1.2 项目结构

```
TL-item-monitor-Tauri/
├── src/                          # React 前端源码
│   ├── app/                       # 应用入口
│   ├── components/                 # React 组件
│   │   ├── charts/                 # 图表组件
│   │   ├── dashboard/              # 仪表板相关页面
│   │   ├── layout/                 # 布局组件
│   │   └── ui/                    # UI 基础组件
│   ├── contexts/                  # React Context
│   ├── hooks/                     # 自定义 Hooks
│   ├── lib/                       # 工具函数
│   └── public/                    # 静态资源
├── src-tauri/                     # Rust 后端源码
│   └── src/
│       ├── commands/               # Tauri Commands
│       ├── core/                   # 核心模块
│       ├── db/                     # 数据库层
│       │   └── migrations/          # SQL 迁移脚本
│       ├── scheduler/              # 定时任务
│       ├── scraper/                # 数据抓取
│       ├── services/               # 业务服务
│       ├── app.rs                  # 应用入口
│       └── main.rs                 # 主函数
├── dist-react/                     # 前端构建产物
└── package.json
```

---

## 2. 后端实现 (Rust)

### 2.1 Tauri Commands

所有前端-后端通信通过 `invoke()` 调用实现。

| Command | 功能 |
|---------|------|
| `get_dashboard_summary` | 获取仪表板摘要 |
| `get_sections` | 获取关注分组 |
| `get_section_items` | 获取分组内物品 |
| `add_section` | 添加分组 |
| `delete_section` | 删除分组 |
| `add_item_to_section` | 添加物品到分组 |
| `remove_section_item` | 从分组移除物品 |
| `reorder_sections` | 重新排序分组 |
| `refresh_fire_price` | 刷新火价 |
| `refresh_items` | 刷新物品数据 |
| `search_items` | 搜索物品 |
| `get_worth_status` | 获取物品价值评估 |
| `get_fire_history` | 获取火价历史 |
| `get_item_history` | 获取物品历史 |
| `get_strategies` | 获取策略列表 |
| `save_strategy` | 保存策略 |
| `delete_strategy` | 删除策略 |
| `get_alerts` | 获取预警列表 |
| `mark_alert_seen` | 标记预警已读 |
| `export_data` | 导出数据 |
| `import_data` | 导入数据 |
| `get_diagnostics` | 获取诊断信息 |
| `set_active_market_context` | 设置当前赛季/模式 |
| `get_config` | 获取配置 |
| `save_config` | 保存配置 |

### 2.2 数据库模型

#### 核心表结构

```sql
-- 赛季信息
CREATE TABLE seasons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    is_current INTEGER DEFAULT 0
);

-- 物品库
CREATE TABLE items (
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    market_mode TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (season_id, market_mode, item_id)
);

-- 火价记录
CREATE TABLE fire_price_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    market_mode TEXT NOT NULL,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    source TEXT NOT NULL,
    scraped_at INTEGER NOT NULL,
    UNIQUE(season_id, market_mode, scraped_at)
);

-- 关注分组
CREATE TABLE sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    strategy_id TEXT,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0
);

-- 分组内物品
CREATE TABLE section_items (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    market_mode TEXT NOT NULL,
    purchase_fire_price REAL DEFAULT 0,
    count INTEGER DEFAULT 1,
    more_value REAL DEFAULT 0
);

-- 策略配置
CREATE TABLE strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    consider_ratio REAL DEFAULT 1.15
);

-- 预警规则
CREATE TABLE alert_rules (
    id TEXT PRIMARY KEY,
    strategy_id TEXT,
    threshold REAL DEFAULT 0
);

-- 预警事件
CREATE TABLE alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    message TEXT NOT NULL,
    seen INTEGER DEFAULT 0
);
```

### 2.3 数据抓取

#### 2.3.1 罗四 API (主数据源)

```rust
// src-tauri/src/scraper/luosi.rs
const LUOSI_API: &str = "http://115.231.176.101:8080";

pub async fn scrape_items(season_id: &str) -> Result<HashMap<String, ItemInfo>, AppError> {
    let url = format!("{}/get?season_id={}", LUOSI_API, season_id);
    // HTTP GET 请求获取物品数据
}
```

#### 2.3.2 千岛火价 API (火价数据)

```rust
// src-tauri/src/scraper/qiandao.rs
const QIANDAO_API: &str = "https://api.qiandao.com";

// 使用 reqwest 发送 HTTP/2 请求
pub async fn scrape_fire_price() -> Result<FirePriceSnapshot, AppError> {
    let client = reqwest::Client::builder()
        .http2_prior_knowledge()  // 强制 HTTP/2
        .build()?;

    let resp = client
        .post("https://api.qiandao.com/c2c-web/v1/common/currency-spu-price-list")
        .json(&body)
        .send()
        .await?;
    // 解析返回的火价数据
}
```

**注意**：千岛 API 需要 HTTP/2 协议，使用 `http2_prior_knowledge()` 配置。

### 2.4 定时任务

```rust
// src-tauri/src/scheduler/fire_task.rs
pub async fn start_fire_scraper_task(state: AppState) {
    loop {
        tokio::time::sleep(Duration::from_secs(300)).await; // 每 5 分钟
        scrape_fire_price(&state).await?;
    }
}
```

---

## 3. 前端实现 (React)

### 3.1 组件架构

```
components/
├── dashboard/
│   ├── DashboardContent.tsx      # 仪表板主内容
│   ├── GroupCard.tsx             # 分组卡片
│   ├── SortableGroupCard.tsx      # 可拖拽分组
│   ├── SearchBar.tsx            # 搜索栏
│   ├── AddItemModal.tsx         # 添加物品弹窗
│   └── ...
├── layout/
│   ├── TopBar.tsx               # 顶部状态栏
│   ├── Sidebar.tsx               # 侧边导航
│   └── ...
└── ui/                          # shadcn/ui 基础组件
    ├── button.tsx
    ├── input.tsx
    ├── dialog.tsx
    └── ...
```

### 3.2 状态管理

```typescript
// contexts/SectionRefreshContext.tsx
export function SectionRefreshProvider({ children }) {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refreshData = () => {
        setRefreshTrigger(prev => prev + 1);
        queryClient.invalidateQueries();
    };

    return (
        <SectionRefreshContext.Provider value={{ refreshTrigger, refreshData }}>
            {children}
        </SectionRefreshContext.Provider>
    );
}
```

### 3.3 Tauri Commands 调用

```typescript
// lib/commands.ts
export const cmd = {
    async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        return window.__TAURI__.core.invoke(cmd, args);
    },

    async getDashboardSummary() {
        return this.invoke<DashboardSummary>("get_dashboard_summary");
    },

    async refreshFirePrice() {
        return this.invoke("refresh_fire_price");
    },
    // ...
};
```

---

## 4. 已知问题与限制

### 4.1 HTTP/2 火价抓取

千岛 API 要求 HTTP/2 协议，当前实现使用 `reqwest` 的 `http2_prior_knowledge()` 配置。

如果遇到 `FRAME_SIZE_ERROR`，可能需要：
1. 检查网络代理设置
2. 尝试不同的 HTTP/2 配置参数
3. 使用 Node.js `http2` 模块作为临时 fallback

### 4.2 数据库迁移

首次运行会自动执行 `001_initial.sql` 迁移脚本。如需修改表结构，添加新迁移文件 `002_xxx.sql`。

---

## 5. 开发指南

### 5.1 环境要求

- Node.js 18+
- Rust 1.70+
- Xcode Command Line Tools (macOS)
- pnpm 或 npm

### 5.2 开发命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 构建生产版本
npm run build

# Tauri 构建
npm run tauri:build
```

### 5.3 数据库调试

```bash
# 查看数据库
sqlite3 ~/.local/share/com.tlmonitor.app/data/tl_monitor.db ".tables"

# 执行 SQL
sqlite3 ~/.local/share/com.tlmonitor.app/data/tl_monitor.db "SELECT * FROM fire_price_records LIMIT 5;"
```

### 5.4 日志位置

```bash
# macOS
~/Library/Logs/com.tlmonitor.app/
```

---

## 6. 未来规划

- [ ] 完善火价抓取稳定性
- [ ] 添加更多预警策略
- [ ] 实现数据导出/导入功能
- [ ] 添加自动更新功能
- [ ] Windows 版本适配
- [ ] 深色模式支持
