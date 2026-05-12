# TL Monitor 发布前检查与优化报告

## 结论

当前项目适合继续打磨后发布给小范围用户使用，但不建议立刻发布。主要原因不是功能复杂度，而是发布链路和数据库迁移存在几个会影响“新安装用户”的阻塞问题。

本次检查覆盖：React 前端、Tauri/Rust 后端、SQLite schema 与迁移、server-standalone、Docker 配置、CI、基础安全、备份恢复与发布体验。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，但有 1 个 warning：`src/components/ui/button.tsx` Fast Refresh 导出规则 |
| `npm run vite:build` | 通过，生产前端产物可构建 |
| `cargo test` in `src-tauri` | 失败：32 passed, 1 failed, 1 ignored |
| `cargo test` in `server-standalone` | 通过，0 tests |
| 当前 SQLite `PRAGMA integrity_check` | `ok` |
| 当前 SQLite `PRAGMA foreign_key_check` | 无错误 |
| `cargo build --bin server --release` in `src-tauri` | 失败：不存在 `server` bin target |

当前本地数据库主要数据量：

| 表 | 行数 |
| --- | ---: |
| `items_normal` | 1,966 |
| `items_expert` | 0 |
| `fire_price_normal` | 735 |
| `fire_price_expert` | 0 |
| `item_realtime_prices` | 115,994 |
| `alert_events` | 0 |

`item_realtime_prices` 及其索引已经是当前数据库的主要体积来源。对 10 人以内使用不是问题，但需要确保清理、checkpoint、备份策略可靠。

## P0：发布前必须修

### 1. 干净安装的数据库迁移不可靠

这是当前最大风险。现有数据库能跑，不代表新用户第一次安装能跑。

证据：

- `src-tauri/src/db/migrations/001_initial.sql` 已经创建 `strategy_outputs.realtime_value`，但 `010_add_realtime_value_to_outputs.sql` 又执行 `ALTER TABLE strategy_outputs ADD COLUMN realtime_value...`，干净库复现会报 `duplicate column name: realtime_value`。
- `001_initial.sql` 创建的是 `item_realtime_prices(item_name, price)`，而 `011_create_item_realtime_prices.sql` 和 Rust repo 代码使用的是 `name, fire_price`。如果从当前 `001_initial.sql` 初始化，`011` 因为 `CREATE TABLE IF NOT EXISTS` 不会修正旧列，后续插入和索引会失败。
- `001_initial.sql` 里还有旧版 `strategy_details/strategy_costs/strategy_outputs` 结构，`009_create_strategy_detail_tables.sql` 也是 `CREATE TABLE IF NOT EXISTS`，不会把旧表变成新表；`015_add_performance_indexes.sql` 又依赖 `label/difficulty/is_realtime/fire_price` 等列。
- `run_migrations` 没有把每个迁移包进事务；如果中途失败，可能留下半迁移状态。

建议：

- 选定一种迁移策略：要么把 `001_initial.sql` 固定成最早 schema，让后续迁移真正补齐；要么把 `001_initial.sql` 更新成最终 schema，同时让后续迁移能判断列是否存在再执行。
- 给所有 `ALTER TABLE ADD COLUMN` 改成 `add_column_if_missing` 这类幂等逻辑。
- 对 destructive migration 增加数据迁移或备份，不要直接 drop。
- 增加 CI smoke test：创建空 SQLite，完整跑一遍迁移，再检查关键表列和索引。

关键文件：

- `src-tauri/src/db/migrations/001_initial.sql`
- `src-tauri/src/db/migrations/009_create_strategy_detail_tables.sql`
- `src-tauri/src/db/migrations/010_add_realtime_value_to_outputs.sql`
- `src-tauri/src/db/migrations/011_create_item_realtime_prices.sql`
- `src-tauri/src/db/migrations/015_add_performance_indexes.sql`
- `src-tauri/src/app.rs`

### 2. Dockerfile 构建目标错误

`server-docker/Dockerfile` 执行：

```dockerfile
cargo build --release --bin server
```

但 `src-tauri` 当前只有 `tl-monitor` bin target，没有 `server`。我实测：

```text
error: no bin target named `server`
help: available bin targets:
    tl-monitor
```

建议：

- 如果正式服务端是 `server-standalone`，Dockerfile 应改为从 `server-standalone` 构建。
- 如果正式服务端已改为 GitHub Actions 产物 + `Dockerfile.prebuilt`，那就移除或重命名旧 Dockerfile，避免误用。
- README、`docs/PROJECT_OVERVIEW.md` 和 `server-docker/README.md` 需要统一“正式部署路径”。

### 3. Rust 单测失败：SS12 开服时间不一致

失败项：

```text
core::constants::tests::test_get_season_start_ss12
left: Some(1776420000)
right: Some(1776384000)
```

影响：

- 赛季天数计算
- 跨赛季价格对比
- 历史火价按天/小时匹配

建议：

- 统一以数据库 `seasons.started_at` 为主，常量只作为兜底。
- 修正 `src-tauri/src/core/constants.rs` 的常量或测试。
- 把“赛季起点”写进发布检查清单。

## P1：发布前强烈建议修

### 4. 默认管理员密码被提交到仓库

`server-docker/config/server_config.yaml` 和 `src-tauri/server_config.yaml` 中都有 `admin_password: "8039"` / `'8039'`。

建议：

- 仓库只保留 `server_config.example.yaml`。
- 真实密码通过环境变量或部署时挂载配置注入。
- 发布前轮换当前密码。
- 文档中的示例 curl 不要带真实密码。

### 5. 备份恢复对 WAL 模式不安全

桌面端使用 WAL，但 `backup_database` 只复制主 `.db` 文件，未处理 `.db-wal` / `.db-shm`，可能备份到不完整状态。`restore_database` 在连接池仍打开时直接覆盖 DB，也有风险。

建议：

- 备份前执行 checkpoint，或使用 SQLite backup API。
- 恢复时先关闭连接池，或要求重启前只选择文件、重启后执行替换。
- `.gitignore` 增加 `*.db-wal`、`*.db-shm`，当前仓库已有未跟踪的 `data/tl_monitor.db-wal` 和 `data/tl_monitor.db-shm`。

### 6. Tauri 权限和 CSP 偏宽

当前配置：

- `withGlobalTauri: true`
- CSP 包含 `script-src 'unsafe-eval'`、`style-src 'unsafe-inline'`
- capabilities 允许较宽的 `$HOME/**` 读写、shell open、process exit

对本地小工具不是灾难，但发布版建议最小化权限，尤其是文件读写范围。

建议：

- 只开放应用数据目录、用户通过 dialog 选择的文件、导入导出需要的路径。
- 如果没有必要，关闭 `withGlobalTauri`。
- 审查是否真的需要 `process:allow-exit`、`shell:allow-open` 和宽泛 FS 权限。

### 7. 采集端关闭 TLS 校验

`src-tauri/src/scraper/qiandao.rs` 使用 `danger_accept_invalid_certs(true)`，Node fallback 也用了 `rejectUnauthorized: false`。

如果这是为兼容第三方 API 指纹问题而保留，建议在代码注释和发布文档里明确风险；否则应恢复证书校验。

### 8. 切换市场上下文时刷新缓存写到了克隆状态

`set_active_market_context` 里使用 `Arc::new((*state).clone())`，这会复制 `AppState` 的锁和缓存，异步任务更新的是克隆出来的 `items_cache`，不是应用真正持有的 state。

建议：

- 改成克隆原始 `Arc<AppState>`，不要 clone `AppState` 本体。
- 增加一个切换赛季/模式后的缓存刷新测试或手动验证步骤。

### 9. 服务端 HTTP 实现需要加超时

`server-standalone` 手写 HTTP 读取循环，有 64KB 限制和限流，但没有读超时。内网小规模使用可以接受，但公网或 NAS 暴露时容易被慢连接拖住。

建议：

- `read` 包 `tokio::time::timeout`。
- 默认绑定 `127.0.0.1`，公网访问交给反向代理。
- 管理接口走 HTTPS 代理，不直接暴露明文密码。

## P2：可逐步优化

### 10. 启动路径太依赖外部 API

桌面端启动时会立即抓火价和物品数据。网络慢或第三方 API 抖动时，用户会感觉应用启动慢。

建议：

- 启动先显示本地缓存。
- 抓取任务后台执行，通过状态栏提示“正在刷新”。
- 首次安装无缓存时再显示引导状态。

### 11. 桌面端和独立服务端逻辑重复

目前桌面端和 `server-standalone` 都有 scraper、DB schema、配置、赛季逻辑。后续维护容易出现一个修了另一个没修。

建议：

- 抽公共 Rust crate：`schema`、`scraper`、`season`、`models`。
- 或明确 `server-standalone` 是唯一采集服务端，桌面端只保留本地查看和同步。

### 12. CI 还缺发布前质量门禁

建议新增：

- `npm run typecheck`
- `npm run lint -- --max-warnings=0`
- `cargo test` for `src-tauri`
- `cargo test` for `server-standalone`
- fresh SQLite migration smoke test
- Docker build test
- Tauri build artifact smoke test

### 13. 日志和调试输出可以清理

代码中有一些 `[DEBUG]` tracing 和前端 `console.log`。发布前建议保留必要错误日志，移除开发期日志。

### 14. 当前数据规模下性能整体可接受

对 10 人以内使用，React Query、SQLite、当前索引和 2k 级物品量是足够的。后续真正需要优化的点是：

- `LIKE '%keyword%'` 搜索增长后可改 FTS5。
- `item_realtime_prices` 保留策略和 checkpoint。
- 历史对比查询需要固定 explain plan 和索引验证。

## 推荐发布顺序

1. 修复迁移体系，确保空库完整初始化成功。
2. 修复 SS12 时间常量/测试，保证 `cargo test` 通过。
3. 修复或移除错误 Dockerfile，统一服务端发布路径。
4. 移除真实管理员密码，改成 example config + 环境变量/部署配置。
5. 修复 WAL 备份恢复。
6. 收紧 Tauri capabilities 和 CSP。
7. 跑完整发布命令：`npm run typecheck`、`npm run lint`、`npm run vite:build`、`cargo test`、server build、Docker build。
8. 打包一个内部版本给 1-2 人试用，再正式给小范围用户。

## 小项目发布建议

按“不超过十人使用”的规模，没必要过度工程化。修完 P0 和核心 P1 后，可以发布。建议暂时不要投入复杂监控平台、复杂权限系统或大型数据库迁移框架；更值得做的是把安装、备份、迁移、配置这几件事做稳。
