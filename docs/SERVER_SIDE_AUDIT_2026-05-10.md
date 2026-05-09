# 服务器端专项检查报告

日期：2026-05-10（Asia/Shanghai）

## 检查范围

- 正式采集服务：`src-tauri/src/bin/server.rs`、`src-tauri/src/server/*`
- 独立服务端拷贝：`server-standalone/src/*`
- Mock 开发服务：`web-server/src/main.rs`
- Docker 与 NAS 部署配置：`server-docker/*`、`docker/*`

本轮没有修改服务端代码，只新增本检查文档。

## 总体结论

服务端代码可以通过 Rust 编译、Clippy 和测试编译，但存在运行期和部署期高风险问题。最需要优先处理的是赛季表迁移、当前赛季写入口径、公开查询接口的 `season` 参数校验，以及 Docker 环境下火价抓取 fallback 不完整。

其中最关键的一点：正式采集服务在全新数据库启动时会创建 `seasons` 表，但表结构没有 `is_current` 字段；启动日志随后显示“没有活跃的赛季，采集任务暂停”。这会导致新部署看起来服务已启动、健康检查通过，但实际上不会采集数据。

## 验证记录

已通过：

- `cd src-tauri && cargo check --bin server`
- `cd src-tauri && cargo clippy --bin server -- -D warnings`
- `cd src-tauri && cargo test --bin server`：0 tests
- `cd src-tauri && cargo check --lib`
- `cd server-standalone && cargo check`
- `cd server-standalone && cargo clippy -- -D warnings`
- `cd server-standalone && cargo test`：0 tests
- `cd web-server && cargo check`
- `cd web-server && cargo clippy -- -D warnings`
- `cd web-server && cargo test`：0 tests

额外运行期验证：

- 使用临时 `TL_DB_PATH` 和 `TL_CONFIG_PATH` 启动 `cargo run --bin server`。
- 新库 `PRAGMA table_info(seasons);` 只有 `id`、`name`、`started_at`、`ended_at` 四列，没有 `is_current`。
- 启动日志显示：`没有活跃的赛季（已全部归档），采集任务暂停`。

## Findings

### P1：正式服务端的 `seasons.is_current` 迁移缺失，首启采集会暂停

位置：

- `src-tauri/src/server/db.rs:178-186`
- `src-tauri/src/server/db.rs:213-226`
- `src-tauri/src/server/db.rs:756-765`
- 对比：`server-standalone/src/db.rs:214-217`

问题：

正式服务端的 `get_current_season` 查询 `is_current`，但 `run_migrations` 创建 `seasons` 表时没有这个字段。独立版补了 `ALTER TABLE seasons ADD COLUMN is_current INTEGER DEFAULT 0`，说明两套服务端已经不一致。

影响：

- 全新部署会启动成功，但采集循环认为没有活跃赛季，实际不采集。
- `/admin/init-season` 后续会执行 `UPDATE seasons SET is_current = ...`，在正式服务端新库上可能因为缺字段失败。
- `get_current_season` 里 `.ok().flatten()` 会吞掉 SQL 错误，日志只表现为“没有活跃赛季”，排查成本高。

建议：

- 在正式服务端迁移里补 `is_current INTEGER NOT NULL DEFAULT 0`。
- 首次 seed `ss12/ss11` 后，至少把 `config.season_id` 或最新赛季设为当前赛季。
- `get_current_season` 不要吞掉 SQL 错误，应返回 `Result<Option<String>, String>` 并记录真实数据库错误。
- 增加一个临时 SQLite 库的迁移测试，断言 `seasons` 表包含 `is_current` 且至少存在一个当前赛季。

### P1：采集逻辑检查了当前赛季，但写入仍使用配置文件里的旧赛季

位置：

- `src-tauri/src/bin/server.rs:1401-1410`
- `src-tauri/src/bin/server.rs:1468-1474`
- `src-tauri/src/bin/server.rs:1504-1511`

问题：

`collect_all_modes` 先查询数据库当前活跃赛季并打印日志，但后续写入火价和物品快照时仍传入 `state.config.season_id`。如果管理员通过 `/admin/init-season` 初始化新赛季，数据库的当前赛季已经变化，但运行中的 `state.config` 不会自动更新。

影响：

- 新赛季初始化后触发的首次采集可能仍写入旧赛季表。
- 日志显示“当前活跃赛季 A”，实际写入“配置赛季 B”，排查时容易误判。
- 归档旧赛季后，只要配置仍指向旧赛季，采集和查询语义会分裂。

建议：

- `get_current_season` 返回的 `current_season` 应作为本轮采集唯一赛季 ID。
- 如果仍希望配置文件决定当前赛季，则初始化/归档接口必须同步更新配置并热更新 `state.config`。
- 在采集日志里同时记录 `current_season` 和最终写入表名。

### P1：公开历史查询接口的 `season` 参数进入动态表名前未校验

位置：

- `src-tauri/src/bin/server.rs:700-703`
- `src-tauri/src/bin/server.rs:738-742`
- `src-tauri/src/bin/server.rs:795-798`
- `src-tauri/src/bin/server.rs:836-839`
- `src-tauri/src/server/db.rs:529-555`
- `src-tauri/src/server/db.rs:834-846`
- `src-tauri/src/server/db.rs:886-898`

问题：

`/fire-history`、`/items-history`、`/items-history-all`、`/fire-history-all` 会读取 URL 中的 `season`，再拼进动态表名。代码里已有 `validate_season_id`，但这些查询路径没有调用。

影响：

- 公开接口可以用任意 `season` 触发动态 SQL 解析错误，造成 500 噪音。
- 动态表名属于 SQL 参数无法绑定的场景，必须在拼接前白名单校验。
- 与管理员接口相比，公开查询接口的安全边界更弱。

建议：

- 所有以 `season_id` 生成表名的函数入口都先调用 `validate_season_id`。
- 对 `limit`、`offset`、`min_day`、`max_day` 也做范围约束。
- 查询不存在表时返回明确的 404/400，而不是 SQL 原始错误包装成 500。

### P2：定时采集日志说“下次整点”，实际按启动完成后一小时循环

位置：

- `src-tauri/src/bin/server.rs:1365-1383`
- `src-tauri/src/bin/server.rs:1388-1396`

问题：

代码计算了 `next_hour` 和 `wait_secs`，但没有睡到这个时间点。启动采集完成后进入循环，每次固定 `sleep(SECONDS_PER_HOUR)`。

影响：

- 如果 17:51 启动，日志会说下次 18:00，但实际下一次大约在 18:51。
- 数据点不再稳定落在整点，影响趋势图、按小时同步和排查日志。

建议：

- 首次采集后使用 `sleep_until(next_hour)`。
- 后续每轮重新计算下一整点，而不是固定睡 3600 秒。
- 文档里的“每小时整点自动采集”需要和实现保持一致。

### P2：Docker 火价抓取 fallback 仍可能不可用

位置：

- `src-tauri/src/server/scraper.rs:171-180`
- `src-tauri/src/server/scraper.rs:203-260`
- `server-docker/Dockerfile:18-27`
- `server-docker/Dockerfile.prebuilt:3-13`

问题：

火价 Rust 抓取失败后会 fallback 到 `node resources/qiandao_fire.cjs|mjs`，但 `server-docker/Dockerfile` 只复制服务端二进制，没有复制 resources，也没有安装 Node。`Dockerfile.prebuilt` 复制了 `/app/resources`，但运行镜像仍没有 Node。

影响：

- Rust 路径一旦因为接口签名、Header 或证书等原因失败，Docker 部署中的 fallback 会继续失败。
- 本地可用、NAS/Docker 不可用的概率较高。

建议：

- 要么让 Rust 抓取路径完整可靠，删除 Node fallback。
- 要么 Docker 镜像明确安装 Node，并复制/挂载 `qiandao_fire.cjs` 或 `qiandao_fire.mjs`。
- 启动时检测 fallback 依赖，不满足就给出清晰日志。

### P2：部署配置存在明显安全弱点

位置：

- `server-docker/config/server_config.yaml:1`
- `docker/server_config.yaml:1`
- `src-tauri/src/server/scraper.rs:27-31`
- `src-tauri/src/server/scraper.rs:171-180`

问题：

部署配置中提交了弱管理员密码示例；HTTP client 允许无效 TLS 证书；千岛请求使用了 `Bearer undefined` 这类占位 Header。

影响：

- 如果容器端口暴露到局域网或公网，管理员接口风险较高。
- 接受无效证书会削弱 HTTPS 保护。
- 占位鉴权 Header 可能随着上游接口策略变化而失效。

建议：

- 配置模板只保留占位值，不提交真实或弱口令。
- 支持从环境变量注入管理员密码，例如 `TL_ADMIN_PASSWORD`，并在启动时拒绝空密码/弱密码。
- 默认不要 `danger_accept_invalid_certs(true)`，除非通过显式配置打开。
- 明确千岛 API 的签名和鉴权策略，避免依赖占位 Header。

### P2：手写 HTTP 解析缺少读超时和并发保护

位置：

- `src-tauri/src/bin/server.rs:284-399`
- `src-tauri/src/bin/server.rs:236-254`

问题：

每个 TCP 连接都会 `tokio::spawn` 一个任务，然后循环读取请求直到 Header/body 完整。当前没有读超时、连接并发上限或慢请求保护。

影响：

- 慢连接可以长期占住任务。
- 公开 API 的 `limit` 默认可到 99999，且没有最大值限制，查询大表时可能造成较高内存和 SQLite 压力。

建议：

- 优先考虑 Axum/Hyper 这类成熟 HTTP 栈。
- 如果继续手写，应加入 read timeout、最大连接数、最大 Header 长度、`limit` 上限和统一错误响应。

### P2：正式服务端与独立服务端重复实现且已经漂移

位置：

- `src-tauri/src/bin/server.rs`
- `src-tauri/src/server/*`
- `server-standalone/src/*`
- `src-tauri/src/core/constants.rs`
- `server-standalone/src/constants.rs`

问题：

正式服务端和 `server-standalone` 是大段重复代码。当前已出现版本号不同、迁移不同的问题：正式服务端版本为 `3.2.0`，独立版为 `3.3`；独立版补了 `is_current` 字段，正式版没有。

影响：

- 修复容易只修一边。
- Docker/NAS 脚本有的构建 `src-tauri` 服务，有的构建 `server-standalone`，线上到底运行哪套逻辑不够清晰。

建议：

- 收敛为一个共享 crate 或单一服务端入口。
- Docker/NAS 构建脚本统一来源，文档明确推荐路径。
- 版本号只保留一个来源。

### P3：`INSERT OR IGNORE` 可能让采集状态高估实际写入量

位置：

- `src-tauri/src/server/db.rs:415-439`
- `src-tauri/src/server/db.rs:462-489`

问题：

火价和物品快照都使用 `INSERT OR IGNORE`。物品插入只要 SQL 执行成功就 `count += 1`，即使因为唯一约束被忽略也会计数。

影响：

- 重复采集同一整点时，日志和状态可能显示保存了 N 条，但实际数据库没有新增。
- 排查数据缺口时容易被状态误导。

建议：

- 使用 `execute` 返回的 `rows_affected()` 统计真实新增数量。
- 火价也记录被忽略的情况，例如 `duplicate timestamp ignored`。

### P3：Mock web-server 与正式 API 不兼容，部署时需要隔离

位置：

- `web-server/src/main.rs:320-354`

问题：

`web-server` 明确是 Mock Server，端口同样监听 8080，CORS permissive，接口路径是 `/api/*`，和正式采集服务不是同一套协议。

影响：

- 如果部署或联调时误启动 mock，会出现健康检查正常但数据全是模拟值。

建议：

- 在 README 和脚本里明确 `web-server` 仅开发演示使用。
- 避免生产部署脚本引用 `web-server`。
- Mock 健康检查返回中保留 `mock: true` 是好事，前端也可在管理页显示该标记。

## 建议修复顺序

1. 修复 `seasons.is_current` 迁移和首启默认当前赛季，同时让 `get_current_season` 暴露真实错误。
2. 修改 `collect_all_modes`，用数据库当前赛季作为实际写入赛季，或彻底改成配置文件单一来源。
3. 给所有动态表名入口补 `validate_season_id`，并限制公开查询的 `limit/offset`。
4. 修正定时采集为真正整点触发。
5. 收敛正式服务端与 `server-standalone` 的重复代码。
6. 决定 Docker 火价 fallback 策略：完整支持 Node，或删除 fallback 并强化 Rust 抓取。
7. 清理部署配置中的弱口令和 TLS/鉴权占位逻辑。

## 运维核对清单

- 启动后确认 `/status` 的 `last_collection` 不为空，不能只看 `/health`。
- 检查数据库：`SELECT id, is_current, started_at, ended_at FROM seasons;`
- 检查当前采集表是否有最新整点数据：`fire_price_snapshots_<season>_<mode>` 和 `item_snapshots_<season>_<mode>`。
- Docker 镜像如果依赖 Node fallback，确认容器内 `node --version` 和资源脚本都存在。
- 管理密码不要使用仓库里的示例值，部署时通过环境变量或私有配置注入。
