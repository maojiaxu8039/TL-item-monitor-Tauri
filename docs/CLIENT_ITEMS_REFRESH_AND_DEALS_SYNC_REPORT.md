# 客户端物品刷新与捡漏出货同步问题排查报告

检查时间：2026-05-12  
检查范围：Tauri 客户端、Rust 后端命令、后台任务、SQLite 迁移、前端 React Query 刷新链路

## 1. 背景与目标

当前客户端需要满足两个核心目标：

1. 物品价格数据每 5 分钟自动更新一次。
2. “捡漏出货”页面依赖的实时价格变化表也要同步更新，用于计算 5 分钟、30 分钟、1 小时、3 小时的价格涨跌。

本次检查重点是确认物品刷新链路是否完整，以及刷新后是否会同步写入捡漏出货所需的数据表。

## 2. 当前结论

代码里已经有一部分实时价格表和写入逻辑，但链路没有完全打通。主要问题是：

- 后台定时刷新存在不严格按 5 分钟执行的风险。
- 手动刷新物品只更新主物品表，没有写入捡漏出货实时表。
- `item_realtime_prices` 迁移文件没有接入迁移流程，并且包含 SQLite 不支持的 SQL。
- 前端收到 `items-updated` 事件后没有刷新捡漏出货页面使用的 query。
- 实时价格表没有 `season_id` 和 `market_mode`，普通服、专家服、不同赛季的数据存在混用风险。
- 当前 TypeScript 类型检查失败，说明前后端类型定义已经出现不一致。

因此，当前表现很容易出现：物品主表看起来更新了，但“捡漏出货”页面没有跟着变化，或者没有足够历史样本计算 5m/30m/1h/3h 涨跌。

## 3. 关键问题明细

### 3.1 后台 5 分钟刷新定时器实现不稳

相关文件：

- `src-tauri/src/scheduler/items_task.rs`
- `src-tauri/src/scheduler/fire_task.rs`

当前 `items_task.rs` 先创建 10 秒 interval，执行成功或失败后又重新创建配置间隔的 interval：

```rust
let mut ticker = tokio::time::interval(Duration::from_secs(10));
...
ticker = tokio::time::interval(Duration::from_secs(interval_secs));
```

Tokio 的 `interval` 新建后第一次 tick 通常会很快触发。如果在循环内反复重建 ticker，可能造成任务并不是严格等待 300 秒后再执行下一次。

建议改为以下模式之一：

- 使用 `loop { 执行刷新; sleep(interval_secs).await; }`
- 或重建 `interval` 后先消费一次 tick，再进入下一轮等待。

推荐使用 `sleep`，语义更清楚，适合这种“执行完成后等待 N 秒”的采集任务。

### 3.2 手动刷新没有同步写入捡漏出货实时表

相关文件：

- `src-tauri/src/commands/fire.rs`
- `src/components/layout/TopBar.tsx`

顶部“获取最新数据”按钮调用：

```ts
await cmd.refreshFirePrice()
await cmd.refreshItems()
```

但是后端 `refresh_items` 当前只做了：

- 调用接口抓取物品。
- 写入 `items_normal` 或 `items_expert`。
- 更新内存 cache。
- 更新 `last_items_reload`。

它没有做：

- 写入 `item_realtime_prices`。
- 清理旧实时记录。
- emit `items-updated` 事件。

这会导致手动刷新后，物品列表可能是新的，但“捡漏出货”页面仍然读旧的实时价格变化数据。

### 3.3 `item_realtime_prices` 迁移没有接入，且 SQL 不兼容 SQLite

相关文件：

- `src-tauri/src/app.rs`
- `src-tauri/src/db/migrations/011_create_item_realtime_prices.sql`

当前 `run_migrations` 只应用到 v10，没有应用 v11：

```rust
if current_version < 10 {
    apply_sql_migration(...);
}
```

并且 v11 迁移文件里存在：

```sql
COMMENT ON TABLE item_realtime_prices IS '捡漏出货专用表：存储物品实时价格，只保留最近3小时数据';
```

这是 PostgreSQL 语法，SQLite 不支持，会导致迁移失败。

建议：

- 删除 `COMMENT ON TABLE`。
- 在 `run_migrations` 中接入 v11。
- 使用幂等 SQL，保证旧数据库升级和新数据库初始化都能正常创建实时表。

### 3.4 前端事件刷新没有包含捡漏出货 query

相关文件：

- `src/hooks/useTauriEvents.ts`
- `src/components/dashboard/DealsPage.tsx`
- `src/contexts/SectionRefreshContext.tsx`

`DealsPage` 使用的 queryKey 是：

```ts
["realtime-fire-changes"]
```

但全局事件监听中，收到 `items-updated` 后只刷新了：

- `items-search`
- `sections`
- `section-items`
- `dashboard-summary`

没有刷新：

- `realtime-fire-changes`

所以即使后台任务正确 emit 了 `items-updated`，捡漏出货页面也不会立即重新拉取数据，只能等自身 60 秒轮询或用户手动点击刷新。

建议：

- 在 `items-updated` 里 invalidate `["realtime-fire-changes"]`。
- 在 `market-context-changed` 里也 invalidate `["realtime-fire-changes"]`。
- `DealsPage` 的 queryKey 加上 `seasonId` 和 `marketMode`，避免上下文切换后缓存混用。

### 3.5 实时价格表缺少赛季和模式字段

相关文件：

- `src-tauri/src/db/migrations/011_create_item_realtime_prices.sql`
- `src-tauri/src/db/repo_item_realtime_prices.rs`

当前实时表结构只有：

```sql
item_id TEXT NOT NULL,
name TEXT NOT NULL,
fire_price REAL NOT NULL,
scraped_at INTEGER NOT NULL
```

缺少：

```sql
season_id TEXT NOT NULL,
market_mode TEXT NOT NULL
```

这会导致：

- 普通服和专家服价格混在一起。
- 当前赛季和历史赛季价格混在一起。
- 切换市场上下文后，“捡漏出货”可能显示错误模式的数据。

建议实时表改为：

```sql
CREATE TABLE IF NOT EXISTS item_realtime_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    market_mode TEXT NOT NULL,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(season_id, market_mode, item_id, scraped_at)
);
```

推荐索引：

```sql
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_context_time
ON item_realtime_prices(season_id, market_mode, scraped_at);

CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_context_item_time
ON item_realtime_prices(season_id, market_mode, item_id, scraped_at);
```

### 3.6 `get_price_changes` 没有按上下文过滤

相关文件：

- `src-tauri/src/commands/items.rs`
- `src-tauri/src/db/repo_item_realtime_prices.rs`

当前命令：

```rust
pub async fn get_realtime_fire_changes(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<repo_item_realtime_prices::ItemPriceChange>, String> {
    repo_item_realtime_prices::get_price_changes(&state.db).await
}
```

它没有传入当前 `season_id` 和 `market_mode`，数据库查询也没有上下文过滤。

建议改为：

```rust
let ctx = state.active_context.read().clone();
repo_item_realtime_prices::get_price_changes(
    &state.db,
    &ctx.season_id,
    ctx.market_mode.as_str(),
).await
```

对应 SQL 增加：

```sql
WHERE season_id = ?
  AND market_mode = ?
  AND scraped_at > ?
```

### 3.7 TypeScript 类型定义不一致

相关文件：

- `src/lib/commands.ts`
- `src-tauri/src/commands/types.rs`
- `src/components/layout/TopBar.tsx`

Rust 里的 `DashboardSummary` 已经有：

```rust
pub history_fire: Option<FirePriceUI>,
```

但 TypeScript 里的 `DashboardSummary` 没有 `history_fire` 字段。当前 `npm run typecheck` 会失败：

```text
Property 'history_fire' does not exist on type 'DashboardSummary'.
```

建议补齐：

```ts
history_fire: FirePriceUI | null;
```

## 4. 推荐修复方案

### 4.1 抽取统一物品刷新落库函数

建议新增一个统一函数，例如：

```rust
async fn persist_refreshed_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
    scraped_at: i64,
) -> Result<(), AppError>
```

函数内部统一负责：

1. 写入 `items_normal` 或 `items_expert`。
2. 批量写入 `item_realtime_prices`。
3. 清理 3 小时前实时记录。

然后以下入口全部复用：

- 后台 `run_items_reload_task`
- 手动 `refresh_items`
- 设置页 `reload_items`
- 启动初始化导入

这样可以避免“某些入口更新主表，某些入口更新实时表”的不一致问题。

### 4.2 修正后台刷新节奏

建议将 `run_items_reload_task` 主循环改成：

```rust
loop {
    tokio::select! {
        result = abort.recv() => {
            // handle abort
            break;
        }
        _ = async {
            run_once().await;
            let config = load_config().unwrap_or_default();
            tokio::time::sleep(Duration::from_secs(config.scrape.items_reload_interval.max(60))).await;
        } => {}
    }
}
```

或者更清晰地把 `run_once` 和 `sleep` 分开。重点是：每次采集完成后明确等待 300 秒。

### 4.3 补齐事件通知和前端 query 刷新

后端 `refresh_items` 成功后 emit：

```rust
let _ = app.emit("items-updated", serde_json::json!({
    "count": count,
    "updated_at": now
}));
```

前端 `useTauriEvents` 增加：

```ts
queryClient.invalidateQueries({ queryKey: ["realtime-fire-changes"] });
```

`SectionRefreshContext.refreshData` 也建议增加这条 invalidate。

### 4.4 让捡漏出货页面 query 绑定当前上下文

建议 `DealsPage` 改为：

```ts
const { marketContext } = useSectionRefresh();

const { data: fireChanges = [], isLoading, refetch } = useQuery({
  queryKey: ["realtime-fire-changes", marketContext.seasonId, marketContext.marketMode],
  queryFn: () => cmd.getRealtimeFireChanges(),
  refetchInterval: 60000,
  staleTime: 30000,
});
```

### 4.5 清理旧命名和重复表

当前代码里还残留 `item_realtime_fire_prices` 命名，例如：

- `TableResolver::realtime_fire_prices_table()`
- 数据库里也存在旧表 `item_realtime_fire_prices`

建议统一为 `item_realtime_prices`，避免后续开发误用旧表。

## 5. 验证清单

修复后建议按以下顺序验证：

1. 启动应用，确认数据库迁移版本到 11。

```sql
SELECT MAX(version) FROM _migrations;
```

预期结果：

```text
11
```

2. 确认实时表结构包含上下文字段。

```sql
PRAGMA table_info(item_realtime_prices);
```

预期包含：

- `season_id`
- `market_mode`
- `item_id`
- `name`
- `fire_price`
- `scraped_at`

3. 手动点击“获取最新数据”，确认主表和实时表都更新。

```sql
SELECT MAX(updated_at) FROM items_normal;
SELECT MAX(scraped_at) FROM item_realtime_prices WHERE market_mode = 'season_normal';
```

两个时间应接近。

4. 等待至少两轮 5 分钟刷新，确认实时表有多个采样点。

```sql
SELECT COUNT(DISTINCT scraped_at)
FROM item_realtime_prices
WHERE season_id = 'ss12'
  AND market_mode = 'season_normal';
```

预期大于等于 2。

5. 打开“捡漏出货”页面，确认数据会随物品刷新自动变化。

重点观察：

- 5m 变化不再长期为空。
- 30m、1h、3h 在运行足够时间后逐步出现。
- 切换普通服/专家服后不混用数据。

6. 运行类型和 Rust 检查。

```bash
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

预期都通过。

## 6. 建议处理优先级

P0：

- 修复 v11 迁移并接入 `run_migrations`。
- 手动刷新和后台刷新都写入 `item_realtime_prices`。
- 实时表增加 `season_id`、`market_mode`，查询按上下文过滤。

P1：

- 修复定时器，保证 300 秒刷新节奏稳定。
- 前端事件 invalidate `realtime-fire-changes`。
- `DealsPage` queryKey 绑定当前上下文。

P2：

- 清理旧表/旧命名 `item_realtime_fire_prices`。
- 补齐 TypeScript 类型定义。
- 收敛 debug 日志，避免后台任务日志过多。

## 7. 最终建议

不要只在 `items_task.rs` 里局部补写实时表。更稳妥的做法是先抽出统一的物品刷新持久化函数，再让后台任务、手动刷新、启动初始化、设置页刷新都走同一个函数。这样后续不管哪个入口触发物品更新，都能保证主表、实时变化表、前端事件和页面缓存同步更新。
