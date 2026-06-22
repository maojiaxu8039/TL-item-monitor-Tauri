# 数据库迁移开发指南

本文档说明 TL Item Monitor 的 SQLite 迁移设计、安装升级行为、开发规范和测试要求。目标是确保新安装、覆盖安装、版本升级都不会覆盖或破坏用户本地数据。

## 1. 核心原则

1. 安装包只更新程序文件，不携带、不复制、不覆盖用户数据库。
2. 用户数据库固定保存在应用数据目录，由迁移器原地升级。
3. 新环境直接创建最新 schema，不从历史 v1 逐条迁移。
4. 旧环境只补跑缺失迁移，迁移前必须先创建备份。
5. 每个迁移必须幂等：重复执行不会报错，也不会重复写脏数据。
6. 禁止无备份的 destructive migration；不得直接丢用户配置、分组、策略、配方、历史数据。
7. 迁移完成后必须做完整性和关键字段校验。

## 2. 数据目录与安装行为

生产环境数据库路径由 `src-tauri/src/core/paths.rs` 统一管理：

```text
Windows: %APPDATA%/com.torchscan.desktop/tl_monitor.db
macOS:   ~/Library/Application Support/com.torchscan.desktop/tl_monitor.db
Linux:   ~/.local/share/com.torchscan.desktop/tl_monitor.db
```

当前 `tauri.conf.json` 的 `identifier` 是 `com.torchscan.desktop`，数据目录名也已统一为 `com.torchscan.desktop`。

**自动迁移机制**：

为了兼容旧版本用户，应用启动时自动检测并迁移数据：

| 旧数据目录 | 新数据目录 | 行为 |
|-----------|-----------|------|
| `com.tlmonitor.app` 存在 | `com.torchscan.desktop` 不存在 | 自动迁移所有数据 |
| 都不存在 | - | 创建新目录 |
| `com.torchscan.desktop` 已存在 | - | 使用新目录，忽略旧目录 |

迁移过程：
1. 检测到旧目录 `com.tlmonitor.app` 存在
2. 创建新目录 `com.torchscan.desktop`
3. 移动所有文件/子目录到新位置
4. 如果移动失败则降级为复制
5. 迁移成功后旧目录为空目录

安装/升级行为：

| 场景 | 数据库行为 |
| --- | --- |
| 新环境首次安装 | 创建空库并直接初始化最新 schema |
| 覆盖安装同版本 | AppData 数据库不动 |
| 新版本覆盖旧版本 | 打开旧库，先备份，再补跑缺失迁移 |
| 迁移失败 | 保留原库和迁移前备份，启动失败并写日志 |
| 卸载后重装 | 只要卸载器未删除 AppData，数据库保留 |
| 用户手动删除 AppData | 按新环境首次安装处理 |

## 3. 迁移入口

迁移入口在 `src-tauri/src/app.rs`：

```rust
const LATEST_SCHEMA_VERSION: i64 = 15;

async fn run_migrations(
    pool: &SqlitePool,
    db_path: &Path,
    db_existed: bool,
) -> Result<(), String>
```

启动流程：

1. `init_app` 在打开数据库前记录 `db_existed`。
2. 连接 SQLite，启用 WAL、foreign keys 等 PRAGMA。
3. `run_migrations` 创建 `_migrations` 表。
4. 判断是否为 fresh database：
   - 数据库文件不存在，或除了 `_migrations` 没有业务表。
5. fresh database：
   - 执行 `001_initial.sql` 作为最新 baseline。
   - 补齐 schema invariants。
   - 把 `_migrations` 标记到 `LATEST_SCHEMA_VERSION`。
6. existing database：
   - 读取当前 `_migrations` 最大版本。
   - 如果低于最新版本，先备份，再补跑缺失迁移。
   - 始终运行 schema repair 和校验。

## 4. Baseline 与历史迁移

`001_initial.sql` 是“当前最新 schema 的新库 baseline”。它用于新安装，不代表最古老的 v1 结构。

历史升级逻辑由 Rust 代码负责：

```rust
run_legacy_migrations(pool, current_version)
```

历史 SQL 文件仍保留在：

```text
src-tauri/src/db/migrations/
```

但有些迁移不能再直接裸跑 SQL，例如：

- `ALTER TABLE ADD COLUMN` 需要用 `add_column_if_missing`。
- 结构冲突表需要先检测字段。
- destructive 操作需要先备份旧表。
- 索引迁移需要先检查表和列存在。

## 5. 备份策略

旧库升级前会自动生成迁移备份：

```text
AppData/com.tlmonitor.app/backups/tl_monitor_migration_v{from}_to_v{latest}_{timestamp}.db
```

备份实现：

1. `PRAGMA wal_checkpoint(TRUNCATE)`
2. `VACUUM INTO 'backup_path'`

不要用简单文件复制替代这套流程。SQLite WAL 模式下，直接复制 `.db` 可能漏掉 `.db-wal` 中尚未 checkpoint 的数据。

## 6. Schema Repair

每次启动都会运行关键 schema repair，保护曾经被半迁移版本影响过的用户库。

当前 repair 覆盖：

- `strategy_details` 旧结构冲突。
- `strategy_detail_costs` / `strategy_detail_outputs` 缺表或缺列。
- `item_realtime_prices` 老列名 `item_name/price` 到 `name/fire_price`。
- `arbitrage_ingredients` / `arbitrage_outputs` 缺 `item_name` 或旧结构。
- 赛季和实时/快照表兜底创建。
- 关键索引按字段存在性创建。

不兼容旧表会被重命名为：

```text
{table}_legacy_{timestamp}
```

优先迁移可映射字段；无法安全映射时保留 legacy 表，避免数据直接丢失。

## 7. 新增迁移流程

新增数据库变更时按以下步骤做：

1. 确认是否真需要 schema 变更。
2. 将 `LATEST_SCHEMA_VERSION` 加 1。
3. 更新 `001_initial.sql`，让新安装用户直接得到最终结构。
4. 在 `run_legacy_migrations` 中新增 `if current_version < N` 分支。
5. 新增迁移必须幂等。
6. 如果是新增列，用 `add_column_if_missing`。
7. 如果是新增表，用 `CREATE TABLE IF NOT EXISTS`。
8. 如果是新增索引，用 `create_index_if_columns_exist` 或先显式检查字段。
9. 如果要改表结构，使用 rename-create-copy-validate，不直接 drop。
10. 更新 `validate_database` 的关键字段校验，如该变更属于启动必需 schema。
11. 添加或更新迁移测试。
12. 运行验证命令。

## 8. 禁止模式

不要提交以下迁移写法：

```sql
ALTER TABLE some_table ADD COLUMN new_column TEXT;
```

应使用：

```rust
add_column_if_missing(pool, "some_table", "new_column", "TEXT").await?;
```

不要提交：

```sql
DROP TABLE user_table;
```

应使用：

```text
ALTER TABLE user_table RENAME TO user_table_legacy_{timestamp}
CREATE TABLE user_table (...)
INSERT INTO user_table (...) SELECT ... FROM user_table_legacy_{timestamp}
```

不要让索引迁移假设字段一定存在：

```sql
CREATE INDEX idx_x ON table_that_may_be_old(missing_column);
```

应使用字段检测后创建。

## 9. 事务规范

普通 SQL 迁移通过 `apply_sql_migration` 执行，该函数会：

1. 开启事务。
2. 执行 SQL。
3. 写入 `_migrations`。
4. 提交事务。

复杂迁移如果不能放进单个 SQL 字符串，也要保持“执行迁移”和“记录版本”在同一个逻辑步骤里。失败时不得写入 `_migrations`。

## 10. 校验规范

迁移后会运行：

```sql
PRAGMA integrity_check;
```

并检查关键表字段：

- `strategy_details`
- `strategy_detail_outputs`
- `item_realtime_prices`
- `seasons`

`foreign_key_check` 当前只记录 warning，不阻止启动。原因是历史库可能存在旧数据引用问题，阻止启动会影响用户恢复数据。

## 11. 测试要求

至少运行：

```bash
cd src-tauri
cargo test migration_tests --lib
cargo check
```

当前迁移测试覆盖：

- fresh database 初始化最新 schema。
- legacy database 从旧结构升级，修复冲突表并生成迁移备份。

新增迁移时建议补充以下场景：

- 从 `LATEST_SCHEMA_VERSION - 1` 升级。
- 目标列已存在时重复执行。
- 旧表存在但字段不完整。
- 迁移中断后再次启动。
- 用户数据行在迁移后仍存在。

## 12. 发布前检查清单

发布 Windows 安装包前确认：

1. `tauri.conf.json` 没有把 `data/tl_monitor.db` 放进 `bundle.resources`。
2. `paths.rs` 的生产数据目录没有改名。
3. `LATEST_SCHEMA_VERSION` 与新增迁移一致。
4. `001_initial.sql` 是最新完整 schema。
5. 旧库升级前会创建备份。
6. `cargo test migration_tests --lib` 通过。
7. `cargo check` 通过。
8. 用一个空 AppData 环境试装启动。
9. 用一个旧版本 AppData 环境覆盖安装启动。

## 13. 恢复建议

如果用户升级后启动失败：

1. 让用户保留整个 `com.tlmonitor.app` 目录。
2. 查看 `startup_error.log` 或应用日志。
3. 找到 `backups/` 下最近的 `tl_monitor_migration_*.db`。
4. 可通过应用内恢复数据库功能或手动替换 `tl_monitor.db` 恢复。
5. 不要让用户先卸载并清理 AppData，这会丢失现场。
