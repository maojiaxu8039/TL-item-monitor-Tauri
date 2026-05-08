# 项目复查报告 Round 5 - 2026-05-08

## 本轮结论

本轮基于提交 `9451bbc fix: 处理 PROJECT_REVIEW_FINDINGS 问题` 进行复查。上一轮 5 个问题中，分页重复拉第一页、管理页导出 endpoint、独立采集服务器动态 `season_id` 校验、预警规则 UI 暴露未实现类型等问题已有不同程度修复。

当前核心构建链路良好，前端类型检查、前端构建、Tauri Rust 检查、格式检查、测试、Clippy、web-server 检查、npm audit 和空白检查均已通过。剩余优化点主要集中在“赛季参数真正生效”“桌面端新赛季时间口径”“分页同步进度/范围语义”“数据库样本状态”和“发布安全加固”。

## 已执行验证

| 检查项 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run vite:build` | 通过 |
| `cd src-tauri && cargo fmt -- --check` | 通过 |
| `cd src-tauri && cargo check --all-targets` | 通过 |
| `cd src-tauri && cargo test` | 通过，32 passed，1 ignored |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | 通过 |
| `cd web-server && cargo check` | 通过 |
| `cd web-server && cargo fmt -- --check` | 通过 |
| `npm audit --audit-level=moderate` | 通过，0 vulnerabilities |
| `git diff --check` | 通过 |

## 上轮 Findings 复查状态

| 上轮问题 | 当前状态 | 说明 |
| --- | --- | --- |
| 分页同步会重复拉第一页 | 已修核心问题，仍有进度语义优化 | `/fire-history-all` 和 `/items-history-all` 已读取 `offset`，数据库查询也已加 `OFFSET ?`。但前端仍把第一页长度当作总数，多页时进度会超过 100%。 |
| 管理页导出类型和赛季选择未真正生效 | 部分修复 | `admin.html` 已使用计算出的 `endpoint`，物品/火价导出类型不再固定火价接口。但后端仍未读取 `season` 查询参数，赛季选择仍不会生效。 |
| 独立采集服务器动态 `season_id` 缺少校验 | 部分修复 | `src-tauri/src/server/db.rs` 已新增 `validate_season_id` 并覆盖初始化、归档、统计等路径。桌面端 `commands/season.rs` 仍有动态表名路径未校验。 |
| 桌面新赛季初始化没有开服时间输入 | 未修复 | 设置页仍只输入 `season_id` 和名称，命令端仍用当前时间写入 `started_at`。 |
| 预警页面暴露尚未实现的规则类型 | 部分修复 | UI 下拉只剩“价格低于/高于”。后台仍保留未实现分支，且物品规则固定查 `season_normal`。 |

## 本轮剩余优化点

| 优先级 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | `src-tauri/src/bin/server.rs:667-822`、`src-tauri/src/server/admin.html:655-657` | 管理页导出传了 `season` 查询参数，但后端 `/fire-history`、`/fire-history-all`、`/items-history-all` 仍固定使用 `state.config.season_id`。 | 管理页选择历史赛季导出时 UI 看似生效，实际仍导出当前配置赛季。 | 后端读取 `season` 或 `season_id` 参数，校验 `ss + 数字` 格式和表存在后再查询；`/season-start` 也应支持同一赛季参数。 |
| P1 | `src-tauri/src/commands/season.rs:153-256`、`src/components/dashboard/SettingsPage.tsx:112-115` | 桌面端初始化新赛季仍不要求显式 `started_at`，且 `season_id` 直接进入动态表名。 | 新赛季天数、跨赛季对比和历史同步基准可能不准；动态表名路径仍缺少统一输入边界。 | 桌面设置页补“开服时间戳”输入；`cmd.initNewSeason` 和 Tauri 命令增加 `started_at` 参数并校验正整数；复用 `TableResolver::is_supported` 或新增共享 `validate_season_id`。 |
| P2 | `src/components/dashboard/DataMonitorPage.tsx:242-245`、`src/components/dashboard/DataMonitorPage.tsx:282-285` | 分页同步的 `job.total` 使用第一页返回长度，而不是服务端总记录数。 | 多页同步时进度会超过 100%，用户无法判断剩余数据量。 | 服务端响应增加 `total`，或前端将分页同步进度改为“已处理 N 条”；不要用第一页条数作为总数。 |
| P2 | `src/components/dashboard/DataMonitorPage.tsx:226-272` | 分页同步开启后，非整赛季范围的语义不一致。火价路径对 `/fire-history` 传 `limit=PAGE_SIZE&offset=...`，物品路径固定 `/items-history-all`，`24h/3d/7d/30d` 选择没有严格约束。 | 用户选择短时间范围再开启分页同步时，可能拉取超出范围的数据；火价短范围还可能因为 `/fire-history` 不支持 `offset` 而重复同一页。 | 分页同步只允许“整赛季”，或服务端统一支持 `range/start/end + limit + offset`。 |
| P2 | `src-tauri/src/scheduler/alert_task.rs:162-191` | 自定义物品预警规则仍固定使用 `season_normal` 查询价格。 | 专家服场景下规则不会按当前市场模式判断，触发结果与用户所在模式不一致。 | 将当前 `market_mode` 传入 `evaluate_rule` / `evaluate_item_rule`，或在规则表中保存 `market_mode`。 |
| P2 | `src-tauri/src/server/db.rs:558-587` | 独立采集服务器归档后只删除 `started_at = 0` 的赛季记录。 | 正常赛季归档后仍会保留在 `/seasons`，但对应快照表已被删除，列表和导出语义容易混乱。 | 归档时明确选择“标记 ended_at 并隐藏/只读”或“删除赛季记录”；避免保留一个表已删除但列表仍可选的赛季。 |
| P2 | `data/tl_monitor.db`、`dev_data/tl_monitor.db` | 仓库内同时存在旧结构 `data/tl_monitor.db` 和当前开发库 `dev_data/tl_monitor.db`。`data` 库缺少 `_migrations`、`season_api_configs`、实时表和 `seasons.is_current/code` 等字段。`dev_data` 中 `ss10.started_at` 为空，`items_normal` 有 933 条 `price <= 0` 记录。 | 本地启动路径或测试脚本若误用旧库会出现结构不一致；0 价格如果进入分析，会影响排序、收益率和预警。 | 明确废弃或迁移 `data/tl_monitor.db`；补齐 `ss10.started_at`；为 0 价格建立“未上架/无价”状态，分析时过滤。 |
| P3 | `src-tauri/src/server/scraper.rs`、`src-tauri/src/scraper/qiandao.rs` | HTTP client 仍启用 `danger_accept_invalid_certs(true)`。 | 发布环境会降低 TLS 校验强度。 | 仅开发环境允许跳过证书校验，生产默认启用正常证书验证。 |
| P3 | `src-tauri/tauri.conf.json:27` | CSP 仍包含 `unsafe-eval`、`unsafe-inline` 和宽泛 localhost/ws 范围。 | 发布环境攻击面偏大。 | 拆分 dev/release CSP，发布版只保留实际需要的来源。 |
| P3 | `server-docker/config/server_config.yaml:2` | 模板 `admin_password` 为空。 | 用户直接部署模板时管理员 API 默认不可用，或误以为已配置。 | 用占位符和启动校验提示强密码；README 中明确首次部署步骤。 |
| P3 | `src/eslint.config.js`、`package.json` | 仓库有 ESLint 配置，但未安装 eslint 相关依赖，也没有 lint 脚本。 | 代码风格和 React Hooks 规则无法在 CI/本地统一执行。 | 补齐 ESLint devDependencies 和 `npm run lint`，或删除未使用配置避免误导。 |

## 数据库只读检查摘要

- `dev_data/tl_monitor.db`：`PRAGMA integrity_check` 返回 `ok`，外键检查无输出；当前赛季数量为 1。
- `dev_data/tl_monitor.db`：`ss10.started_at` 为空，`missing_started_at = 1`。
- `dev_data/tl_monitor.db`：`items_normal = 1964`，其中 `price <= 0` 为 933 条。
- `dev_data/tl_monitor.db`：`item_snapshots_ss12_normal = 458286`，快照重复键检查为 0，孤儿 `section_items` 为 0。
- `data/tl_monitor.db`：完整性 `ok`，但结构明显是旧版，只包含 `seasons` 和 ss11/ss12 快照表，缺少当前主链路所需表。

## 建议修复顺序

1. 先补后端导出赛季参数：让管理页选择的 `season` 真正影响查询和 `/season-start`。
2. 统一桌面端新赛季初始化：显式 `started_at` + `season_id` 校验。
3. 收敛分页同步语义：整赛季分页和短时间范围同步分开处理，进度显示改为真实总数或已处理条数。
4. 修专家服预警判断：规则评估使用当前 `market_mode` 或规则自带市场模式。
5. 清理数据库样本和发布配置：旧库、0 价格、空管理员密码、TLS/CSP/ESLint 等发布前风险分批处理。
