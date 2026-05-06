# TL 物品火价监控 - 项目分析报告

**生成时间**: 2026-05-06
**项目路径**: `/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri`

---

## 一、项目概览

### 1.1 项目架构

```
TL-item-monitor-Tauri/
├── src/                          # React 前端 (TypeScript)
│   ├── app/                      # 主应用组件
│   ├── components/               # UI 组件
│   │   ├── dashboard/            # 仪表盘相关页面
│   │   ├── charts/               # 图表组件
│   │   └── ui/                   # 通用 UI 组件
│   ├── lib/                      # 工具函数和命令封装
│   └── contexts/                 # React Context
├── src-tauri/                    # Rust 后端 (Tauri 框架)
│   ├── src/
│   │   ├── bin/server.rs         # Web Server 入口
│   │   ├── commands/             # Tauri 命令层
│   │   ├── core/                 # 核心模块 (配置、状态、错误)
│   │   ├── db/                   # 数据库层 (repositories)
│   │   ├── scheduler/            # 定时任务调度器
│   │   ├── scraper/              # 数据抓取模块
│   │   ├── services/             # 业务服务层
│   │   └── server/               # 服务端模块 (双写)
│   └── resources/                # 资源文件
└── web-server/                   # 独立 Web Server (Axum)
```

### 1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + TypeScript | - |
| 前端构建 | Vite | - |
| UI 库 | Tailwind CSS | - |
| 桌面框架 | Tauri | 2.x |
| 后端语言 | Rust | 2021 edition |
| 数据库 | SQLite | sqlx 0.8 |
| HTTP 客户端 | reqwest | 0.12 |
| 异步运行时 | tokio | 1.x |
| Web 框架 | Axum | (web-server) |

---

## 二、代码质量检查

### 2.1 编译和测试

✅ **Cargo Build**: 通过
✅ **Cargo Test**: 18 个测试全部通过
⚠️ **Cargo Clippy**: 1 个警告

```rust
warning: items after a test module
   --> src/db/repo_fire.rs:32:1
```

### 2.2 代码问题汇总

#### 问题 1: 测试模块位置不规范 (Clippy Warning)

**文件**: `src-tauri/src/db/repo_fire.rs`
**问题**: `mod tests` 定义在文件末尾，但之后还有公共函数
**建议**: 将 `mod tests` 移到第一个公共函数之前

```rust
// 当前结构 (不规范)
// ... 公共函数 ...
// mod tests { ... }  // 测试在最后

// 建议结构
// mod tests { ... }  // 测试在前
// ... 公共函数 ...
```

#### 问题 2: 硬编码的 API 配置

**文件**: `src-tauri/src/scraper/qiandao.rs`
**问题**: API tag_id 和 spec_id 硬编码在代码中

```rust
let (tag_id, spec_id) = if mode == "专家" {
    ("1560055", "267417")  // 专家服
} else {
    ("1560053", "267416")  // 普通服
};
```

**建议**: 这些值应从配置文件读取，当前 SeasonApiConfig 中已支持此功能，但 fallback 代码未使用

#### 问题 3: 潜在的双写问题

**问题**: 代码中存在两套数据抓取和存储逻辑

1. **Server 模块** (`src-tauri/src/server/`): 用于服务端双写
2. **Scheduler 模块** (`src-tauri/src/scheduler/`): 用于客户端定时任务
3. **Scraper 模块** (`src-tauri/src/scraper/`): 实际抓取逻辑

**现状**:
- `server/db.rs`: 有独立的数据库操作逻辑
- `db/repo_*.rs`: 有独立的数据库操作逻辑
- 两边可能有重复的表结构定义

**建议**: 统一使用一套数据库操作逻辑，避免维护两份代码

---

## 三、数据库分析

### 3.1 表结构

#### 实时表 (按模式分表，无赛季后缀)

| 表名 | 用途 |
|------|------|
| `items_normal` | 普通服物品实时数据 |
| `items_expert` | 专家服物品实时数据 |
| `fire_price_normal` | 普通服火价实时数据 |
| `fire_price_expert` | 专家服火价实时数据 |

#### 快照表 (按赛季和模式分表)

| 表名 | 用途 |
|------|------|
| `fire_price_snapshots_{season}_{mode}` | 火价历史快照 |
| `item_snapshots_{season}_{mode}` | 物品价格历史快照 |
| `item_realtime_fire_prices` | 近3小时火价变化记录 |

### 3.2 数据库问题

#### 问题 1: 冗余的 season_id 字段

**现象**: 实时表 (`items_normal`) 没有季节后缀，但插入时总是传入 `season_id` 参数，虽然最终表名不包含 season。

```rust
pub fn items_table(_season_id: &str, market_mode: &str) -> String {
    // _season_id 参数被忽略！
    format!("items_{}", mode_suffix)
}
```

**建议**: 实时表查询不需要 season_id 参数，应简化 API

#### 问题 2: 模型字段不完整

**文件**: `src-tauri/src/db/models.rs`
**问题**: `Item` 模型缺少 `season_day` 字段，但 `items` 表有该字段

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Item {
    pub item_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub name: String,
    pub item_type: String,
    pub source: String,
    pub price: f64,
    pub last_time: Option<i64>,
    pub updated_at: i64,
    // 缺少: pub season_day: Option<i32>,
}
```

#### 问题 3: TODO 注释

```rust
// commands/fire.rs:43
db_record_count: 0, // TODO: implement for split tables
```

**建议**: 实现跨赛季/模式的记录计数功能

---

## 四、业务逻辑分析

### 4.1 数据流

```
数据源 (Luosi API / Qiandao API)
    ↓
抓取模块 (scraper/)
    ↓
数据库存储 (db/repo_*.rs)
    ↓
定时任务 (scheduler/)
    ↓
状态缓存 (core/state.rs)
    ↓
前端展示 (React components/)
```

### 4.2 核心业务流程

#### 火价抓取
1. Scheduler 调用 `scraper/qiandao.rs::scrape_by_mode()`
2. 优先使用 Node.js 脚本 (`resources/qiandao_fire.mjs`)
3. 失败则 fallback 到 Rust reqwest
4. 结果存入 `fire_price_normal/expert` 表
5. 同步更新 `AppState.fire_price`

#### 物品抓取
1. Scheduler 调用 `scraper/luosi.rs::scrape_items()`
2. 根据赛季和模式计算 API season_id
3. 结果存入 `items_normal/expert` 表
4. 同步更新 `AppState.items_cache`

### 4.3 业务逻辑问题

#### 问题 1: SeasonApiConfig 未完全使用

**文件**: `src-tauri/src/core/state.rs`
**问题**: `SeasonApiConfig` 定义了 API 配置，但在抓取时 fallback 代码仍使用硬编码值

```rust
// fire_task.rs 中直接使用硬编码的 mode_str
let mode_str = match ctx.market_mode {
    MarketMode::SeasonExpert => "专家",
    _ => "普通",
};
// 没有使用 SeasonApiConfig 中的 qiandao_tag_id 等
```

#### 问题 2: 配置热更新不完整

**文件**: `src-tauri/src/scheduler/items_task.rs`
**问题**: 每 10 秒重新加载配置文件，但只读取 `auto_reload` 和 `items_reload_interval`

```rust
let fresh_config = match crate::core::config::load_config() {
    // ...
};
if !fresh_config.scrape.auto_reload {
    continue;
}
```

**建议**: 应该定期检查更多配置项，或者使用文件监听

#### 问题 3: 错误处理不一致

**现象**: 部分函数使用 `AppError`，部分使用 `String`

```rust
// 有些返回 Result<T, AppError>
pub async fn get_season_start(...) -> Result<i64, AppError>

// 有些返回 Result<T, String>
pub async fn insert_fire_record(...) -> Result<FirePriceRecord, String>
```

**建议**: 统一错误处理方式

---

## 五、优化建议

### 5.1 高优先级

| # | 问题 | 建议 |
|---|------|------|
| 1 | 测试模块位置 | 将 `mod tests` 移到文件顶部 |
| 2 | 硬编码 API 配置 | 使用 `SeasonApiConfig` 替代硬编码 |
| 3 | 冗余 season_id 参数 | 简化 `TableResolver` API |
| 4 | Item 模型缺少字段 | 添加 `season_day` 字段 |

### 5.2 中优先级

| # | 问题 | 建议 |
|---|------|------|
| 5 | 双写代码重复 | 统一使用一套数据库操作 |
| 6 | 错误类型不一致 | 统一使用 `AppError` |
| 7 | TODO 注释 | 实现 `db_record_count` 功能 |
| 8 | SeasonInfo 重复 | `core/constants.rs` 和 `server/db.rs` 各有一份 |

### 5.3 低优先级

| # | 问题 | 建议 |
|---|------|------|
| 9 | 配置热更新 | 使用文件监听替代轮询 |
| 10 | 前端代码审查 | 检查 React 组件的 TypeScript 类型 |
| 11 | 文档缺失 | 为核心模块添加文档注释 |

---

## 六、测试覆盖

### 6.1 Rust 测试

| 模块 | 测试数 | 状态 |
|------|--------|------|
| `db/table_resolver` | 5 | ✅ 通过 |
| `services/worth_service` | 8 | ✅ 通过 |
| `core/constants` | 3 | ✅ 通过 |
| `db/repo_fire` | 2 | ✅ 通过 |

**总计**: 18 个测试，100% 通过

### 6.2 缺失的测试

- `scraper/` 模块无单元测试
- `commands/` 模块无集成测试
- `scheduler/` 模块无测试

---

## 七、安全考虑

### 7.1 CSP 配置

```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; ..."
```

⚠️ `unsafe-eval` 可能带来安全风险，考虑限制其使用范围

### 7.2 硬编码凭证

⚠️ 代码中包含 API 相关配置，建议：
1. 将敏感配置移至环境变量
2. 不在代码中明文存储

### 7.3 外部请求

- `danger_accept_invalid_certs(true)` - 忽略证书验证，仅用于开发环境

---

## 八、总结

### 8.1 优点

1. ✅ 模块化设计清晰，职责分离良好
2. ✅ 数据库设计合理，支持多赛季/模式
3. ✅ 测试覆盖了核心业务逻辑
4. ✅ 定时任务实现完整
5. ✅ 提供了 Node.js 和 Rust 双实现

### 8.2 需要改进

1. ⚠️ 存在代码重复（server/ vs db/）
2. ⚠️ API 配置硬编码
3. ⚠️ 测试覆盖不全面
4. ⚠️ 错误处理不统一

---

*本报告由自动化分析工具生成*