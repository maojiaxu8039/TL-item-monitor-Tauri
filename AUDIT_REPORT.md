# TL 物品火价监控 — 全面代码审计报告

> 审计时间: 2026-04-29
> 审计范围: Rust 后端 + React 前端 + SQLite 数据库 + 前后端连通性
> 编译状态: cargo check ✅ / tsc ✅ / vite build ✅

---

## 执行摘要

| 类别 | 严重(P0) | 中等问题(P1) | 优化(P2) | 总计 |
|------|---------|------------|---------|------|
| 后端 Rust | 4 | 8 | 6 | 18 |
| 前端 React | 1 | 12 | 10 | 23 |
| 数据库 | 5 | 7 | 6 | 18 |
| 前后端连通 | 3 | 4 | 2 | 9 |
| **合计** | **13** | **31** | **24** | **68** |

---

## 🔴 P0 — 严重问题（影响运行时或数据完整性）

### 1. 【前后端连通】12 个命令参数命名不匹配 — 运行时失效

**问题**: Tauri v2 参数绑定按**精确名称**匹配。前端传 camelCase，Rust 期望 snake_case。

| 命令 | JS 发送 | Rust 期望 | 结果 |
|------|--------|----------|------|
| `set_active_market_context` | `seasonId`, `marketMode` | `season_id`, `market_mode` | 收到空字符串，上下文切换失效 |
| `search_items` | `pageSize` | `page_size` | 收到默认值 0，分页异常 |
| `get_section_items` | `sectionId` | `section_id` | 收到空字符串 |
| `add_section_item` | `sectionId`, `seasonId`, `marketMode`, `itemId`, `purchaseFirePrice`, `moreValue` | 全为 snake_case | 物品添加可能失败或数据错乱 |
| `update_section_item` | `sectionId`, `itemId` | `section_id`, `item_id` | 更新找不到记录 |
| `remove_section_item` | `sectionId`, `itemId` | `section_id`, `item_id` | 删除找不到记录 |
| `evaluate_worth_cmd` | `itemFirePrice`, `purchaseFirePrice`, `considerRatio`, `firePerRmb` | 全为 snake_case | 估值计算收到 0 值 |
| `create_alert_rule` | `strategyId`, `sectionId`, `itemId`, `ruleType`, `cooldownSeconds` | 全为 snake_case | 规则创建数据错乱 |
| `update_alert_rule` | 同上 | 同上 | 更新失效 |
| `backup_database` | `destPath` | `dest_path` | 备份路径为空 |
| `restore_database` | `srcPath` | `src_path` | 恢复路径为空 |
| `get_item_history` | `itemId` | `item_id` | 查询返回空 |

**修复**: `commands.ts` 中所有 invoke payload key 改为 snake_case，或 Rust 端参数改用 camelCase（推荐前端改，工程量小）。

### 2. 【数据库】`insert_fire_record` 使用 plain INSERT — UNIQUE 冲突时崩溃

**位置**: `repo_fire.rs`

`fire_price_records` 有 `UNIQUE(season_id, market_mode, scraped_at)`。`insert_fire_record` 使用普通 `INSERT`，同一时间点重复抓取会触发 **unique constraint violation panic**。

`repo_history::insert_fire_snapshot` 正确使用 `INSERT OR IGNORE`，但同一个逻辑有两套行为。

**修复**: `repo_fire::insert_fire_record` 改为 `INSERT OR IGNORE`。

### 3. 【数据库】无迁移系统 — 上线后无法迭代 schema

**位置**: `app.rs:186-189`

当前实现:
```rust
let migration_sql = include_str!("db/migrations/001_initial.sql");
sqlx::query(migration_sql).execute(pool).await?;
```

问题:
- 全部是 `CREATE IF NOT EXISTS`，现有数据库永远不被修改
- 无版本跟踪表，无法知道当前 schema 版本
- 添加列/约束需要删库重建

**修复**: 改用 `sqlx::migrate!("./migrations").run(pool).await?`，拆分多文件迁移。

### 4. 【数据库】PRAGMA foreign_keys = ON 只在迁移连接生效

**位置**: `migrations/001_initial.sql` 末尾

SQLite 的 `PRAGMA foreign_keys` **不持久化**。新连接默认关闭外键检查。即使声明了 `ON DELETE CASCADE`，也不会执行。

**修复**: 在 `app.rs` 创建 pool 后立即执行:
```rust
sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await?;
```

### 5. 【数据库】6 个外键缺失 + section_items 无 UNIQUE

**缺失外键**:
- `items.season_id` → `seasons(id)`
- `fire_price_records.season_id` → `seasons(id)`
- `item_price_snapshots.season_id` → `seasons(id)`
- `section_items` → `items` 复合外键
- `alert_rules.strategy_id` → `strategies(id)`
- `alert_events.rule_id` → `alert_rules(id)`

**缺失 UNIQUE**: `section_items` 没有 `(section_id, season_id, market_mode, item_id)` 唯一约束，重复添加同一物品会产生多行，导致 `update/remove_section_item` 的 `(section_id, item_id)` WHERE 条件匹配到多行。

### 6. 【后端】`scraper/qiandao.rs` 关闭 TLS 证书验证

**位置**: `scraper/qiandao.rs:47`

```rust
.danger_accept_invalid_certs(true)
```

**安全风险**: 中间人攻击可篡改火价数据。

**修复**: 仅 debug 构建允许，release 必须移除。

### 7. 【后端】`scheduler/history_task.rs` 多处 unwrap

```rust
.with_minute(0).unwrap()
.with_second(0).unwrap()
.with_nanosecond(0).unwrap()
```

整点计算在边缘时间（如 23:59）可能 panic，导致定时调度线程崩溃。

### 8. 【前后端类型】`DbStats` 前后端结构完全不同

**Rust 返回**（3 个字段）: `item_count`, `db_record_count`, `db_size_kb`
**TS 期望**（6 个字段）: `fire_count`, `item_count`, `section_count`, `db_size_kb`, `last_fire_at`, `last_items_at`

`get_db_stats` 命令实际返回和前端接口完全不匹配。

### 9. 【前后端类型】`FirePriceUI.scraped_at` 类型不匹配

**Rust**: `String`（格式 `"2024-01-15 08:30:00"`）
**TS**: `number`（期望 Unix 时间戳）

前端拿到字符串做数值运算会得 `NaN`。

### 10. 【前端】`tsconfig.json` `strict: false`

关闭严格模式意味着:
- `noImplicitAny: false` — 未标注类型的变量自动为 `any`
- `strictNullChecks: false` — `null` 可赋值给任意类型
- 大量潜在运行时错误在编译期无法发现

---

## 🟡 P1 — 中等问题（影响可靠性/可维护性）

### 后端

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | `let _ =` 静默丢弃 21 处错误 | events.rs, scheduler/, commands/ | DB 写入失败、事件发送失败无日志 |
| 2 | `bulk_insert_items` 无事务 | `repo_items.rs` | 部分批次失败留下脏数据 |
| 3 | `reorder_sections` 无事务 | `repo_sections.rs` | 排序部分更新导致顺序错乱 |
| 4 | `update_section_item` 无事务（最多 4 个 UPDATE） | `repo_sections.rs` | 部分字段更新成功 |
| 5 | `repo_fire::get_fire_history` 返回 `Vec<serde_json::Value>` | `repo_fire.rs` | 表现层类型泄漏到 repo |
| 6 | `repo_fire::insert_fire_record` / `repo_history::insert_fire_snapshot` 依赖 `core::state::FirePriceSnapshot` | 两个文件 | 跨层依赖，repo 应只依赖 `db::models` |
| 7 | `refresh_items` 命令是空实现 | `commands/fire.rs:81-83` | 返回成功但实际什么都没做 |
| 8 | `get_diagnostic` 从未被调用 | `repo_source_diagnostics.rs:93` | 死代码 |
| 9 | `core::state::Item` 未使用 | `core/state.rs:75-81` | 死结构体 |
| 10 | `db/errors.rs` 注释完全错误 | `db/errors.rs` | 误导维护者 |
| 11 | 2 个冗余索引 | `idx_items_season_mode`, `idx_snapshots_unique` | 浪费空间 |
| 12 | `alert_events` 表有 schema 但从无写入路径 | 整个项目 | 预警事件无法持久化 |

### 前端

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | 6 个 Tauri 事件只监听 1 个 | `core/events.rs` vs 前端 | 实时更新失效 |
| 2 | `SearchResult` TS 缺少 `page`, `page_size` | `commands.ts` | 类型不完整 |
| 3 | `FireHistoryItem.created_at` 前端期望但后端不返回 | `commands.ts` vs `repo_fire.rs` | 幽灵字段 |
| 4 | 6 个文件使用相对导入 `../../lib/commands` | 多个 dashboard 组件 | 应统一为 `@/lib/commands` |
| 5 | `GroupCard.tsx` 硬编码 "待评估"  badge | `GroupCard.tsx:163` | Worth 评估未接入 |
| 6 | `GroupCard.tsx` RMB 价格硬编码 `61.87 / 10000` | `GroupCard.tsx:158` | 应使用实时火价 |
| 7 | `SettingsPage` 使用 `useEffect` + 裸 Promise，无取消 | `SettingsPage.tsx:47` | 组件卸载后可能 setState |
| 8 | `TopBar.tsx` 本地 state 与 context 可能不同步 | `TopBar.tsx:13` | 模式切换失败时 UI 显示错误 |
| 9 | `ItemsPage.tsx` 双重复位 page | 行 121 + 311 | 竞态条件 |
| 10 | `SeasonPage.tsx` 硬编码 `qiandao / luosi` | `SeasonPage.tsx:205` | 应显示 record.source |
| 11 | `SettingsPage.tsx` 硬编码 JSON 路径 | `SettingsPage.tsx:20` | 机器特定路径 |
| 12 | `HelpPage.tsx` 快捷键文档未实现 | `HelpPage.tsx:73` | Ctrl+R/K/W 无实际绑定 |

### 数据库

| # | 问题 | 影响 |
|---|------|------|
| 1 | `items` / `section_items` 默认 season 为 `'ss12'` | 下赛季需改 schema |
| 2 | `alert_events` schema 与 SPEC 不一致 | 缺少 `title`，多了 `seen/created_at/section_item_id` |
| 3 | `section_items` 有 `last_time TEXT` 但 SPEC 未定义 | schema 漂移 |
| 4 | `repo_items::search_items` LIKE 未转义 `%` `_` | 用户搜索特殊字符行为异常 |
| 5 | `SectionItem` 模型有 3 个计算字段依赖 JOIN | 直接 `SELECT * FROM section_items` 会运行时错误 |
| 6 | 缺少索引：`alert_events(triggered_at)`, `alert_rules(strategy_id)` | 查询全表扫描 |
| 7 | `export_watchlist_csv` N+1 查询 | 性能问题 |

---

## 🟢 P2 — 优化建议

### 代码规范
1. **统一 color palette**: 全项目使用 `slate-*`，废弃 `gray-*` 和自定义 theme token
2. **启用 tsconfig strict 模式**: 逐步修复类型错误
3. **添加 Rust unit tests**: 当前 0 个测试
4. **添加 ErrorBoundary**: 防止单个页面错误崩溃整个应用
5. **提取 DashboardContent 到独立文件**: 当前与 App.tsx 耦合

### 性能
6. **GroupCard 移除 per-row motion 动画** 或限制最大动画数量
7. **StrategiesPage N+1 查询** → 页面级批量获取
8. **ItemsPage columns useMemo 依赖不稳定** → 稳定化依赖

### 架构
9. **domain-specific hooks**: `useSections()`, `useAlertRules()` 替代单文件 cmd 对象
10. **全局事件监听 hook**: 统一处理 6 个 orphaned Tauri events
11. **统一 invalidateQueries 策略**: 所有 mutation 完成后调用 `refreshData()`

---

## 前后端连通性测试结果

### 命令注册映射（45 个命令）

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 完全连通 | 30 | 前后端都有，参数类型匹配 |
| 🔴 参数不匹配 | 12 | 前端 camelCase / 后端 snake_case |
| ⚠️ 类型不匹配 | 2 | `DbStats`, `FirePriceUI.scraped_at` |
| ⚠️ 字段不匹配 | 1 | `FireHistoryItem.created_at` 幽灵字段 |
| ❌ 有后端无前端 | 2 | `get_items_stats`, `reload_items` |
| ❌ 有前端无后端 | 0 | — |

### 事件系统映射（7 个事件）

| 事件 | 后端发射 | 前端监听 | 状态 |
|------|---------|---------|------|
| `fire-price-updated` | ✅ | ✅ (SeasonPage) | 正常 |
| `items-updated` | ✅ | ❌ | 🔴 孤儿 |
| `market-context-changed` | ✅ | ❌ | 🔴 孤儿 |
| `task-status-changed` | ✅ | ❌ | 🔴 孤儿 |
| `alert-triggered` | ✅ | ❌ | 🔴 孤儿 |
| `config-changed` | ✅ | ❌ | 🔴 孤儿 |
| `database-stats-updated` | ✅ | ❌ | 🔴 孤儿 |

---

## 功能完整性评估

### 已实现功能

| 模块 | 功能 | 状态 |
|------|------|------|
| 火价抓取 | 千岛 API 抓取 | ✅ 可用 |
| 物品抓取 | 刷图小助手 API | ✅ 可用 |
| 火价历史 | 存储/查询/趋势 | ✅ 可用 |
| 物品历史 | 存储/查询 | ✅ 可用 |
| 板块管理 | CRUD + 排序 | ✅ 可用 |
| 策略管理 | CRUD | ✅ 可用 |
| 预警规则 | CRUD + 启停 | ✅ 可用 |
| 导入导出 | CSV / 备份恢复 | ✅ 可用 |
| 数据源诊断 | 状态记录 | ✅ 可用 |

### 缺失/未接入功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| Worth 评估 UI 接入 | 后端有 `evaluate_worth_cmd`，前端 GroupCard 硬编码 "待评估" | P1 |
| 预警事件持久化 | `alert_events` 表有 schema 但无写入 | P1 |
| 预警触发通知 | `alert-triggered` 事件发射但前端无监听 | P1 |
| 实时任务状态 | `task-status-changed` 事件孤儿 | P2 |
| 配置变更同步 | `config-changed` 事件孤儿 | P2 |
| 小窗模式 | SPEC 预留，未实现 | P3 |
| 自由布局 | SPEC 预留，未实现 | P3 |
| 自动更新 | tauri-plugin-updater 未注册 | P3 |

---

## 修复优先级建议

### 立即修复（阻塞发布）
1. 修复 12 个命令参数命名（snake_case ↔ camelCase）
2. `insert_fire_record` 改为 `INSERT OR IGNORE`
3. 修复 `DbStats` / `FirePriceUI.scraped_at` 类型不匹配
4. 启用 `PRAGMA foreign_keys = ON` 每连接

### 本周修复
5. 实现最小迁移系统（版本表 + ALTER 支持）
6. 添加 `section_items` UNIQUE 约束
7. 补全 6 个缺失外键
8. 添加全局事件监听 hook（处理 6 个孤儿事件）
9. `tsconfig.json` 启用 `strict: true`

### 本月优化
10. 统一 color palette（slate）
11. 给关键 repo 函数加事务
12. 实现 `create_alert_event` repo 函数
13. 添加 Rust unit tests
14. 移除所有死代码
