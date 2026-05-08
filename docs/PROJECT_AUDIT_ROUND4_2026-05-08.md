# 项目复查报告 Round 4 - 2026-05-08

## 本轮结论

本轮确认“识图助手”业务已从前端入口、路由类型和页面组件中移除；文档中的待开发规划、目录说明和旧 API 说明也已同步清理。

核心构建链路状态良好：前端类型检查、前端构建、Tauri Rust 检查、格式检查、测试、Clippy、web-server 检查均已通过。当前剩余优化点主要集中在新赛季管理链路、配置生效语义、发布安全加固和类型质量。

## 已执行验证

| 检查项 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run vite:build` | 通过 |
| `cd src-tauri && cargo check --all-targets` | 通过 |
| `cd src-tauri && cargo fmt -- --check` | 通过 |
| `cd src-tauri && cargo test` | 通过，32 passed，1 ignored |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | 通过 |
| `cd web-server && cargo check` | 通过 |
| `cd web-server && cargo fmt -- --check` | 通过 |
| `npm audit --audit-level=moderate` | 通过，0 vulnerabilities |
| 文档改动空白检查 | 通过 |
| Docker 构建验证 | 未执行，本机未检测到 `docker` |

补充说明：全仓 `git diff --check` 目前会被已有业务文件中的尾随空格阻断，涉及 `src-tauri/src/db/repo_sections.rs`、`src-tauri/src/server/admin.html`、`src/components/dashboard/ItemPriceTrendModal.tsx`。这些不是本轮文档改动引入，建议提交前统一清理。

## 已同步的文档调整

- `docs/DEVELOPMENT_GUIDE.md` 已标记“识图助手”整板块取消，不再开放入口，也不进入后续规划。
- 已从待开发功能、目录结构和近期计划中移除 `ImageAssistPage.tsx` / 识图助手相关条目。
- 已将旧的公开 `GET /api-config` 文档口径改为当前的管理员接口 `POST /api/admin/config`。
- 已补充核对策略管理、预警规则、数据监控三块状态：策略收益分析和数据监控已不是占位；预警规则已有命令/数据表基础，但缺少独立 UI 和按规则执行的后台任务闭环。

## 三模块核对结论

| 模块 | 当前状态 | 证据 | 仍需补齐 |
| --- | --- | --- | --- |
| 策略管理 | 已开发主体功能，不是占位 | `StrategiesPage.tsx` 已接入 `getAllStrategiesWithCosts`、`createStrategyDetail`、`addStrategyCost`、`addStrategyOutput`、`refreshStrategyFirePrices`；后端有 `strategy_details`、`strategy_costs`、`strategy_outputs` 表和对应命令。 | 策略推荐、策略模板、批量复用能力。 |
| 预警规则 | 后端基础已开发，产品闭环未完成 | `alert_rules` / `alert_events` 表、CRUD 命令和 Tauri 事件监听存在；设置页有价格预警开关。 | 没有独立预警规则页面；`alert_task` 当前检查监控列表价格倒挂，未按 `alert_rules` 逐条判断；事件创建函数未形成完整触发链路。 |
| 数据监控 | 已开发并可用 | `DataMonitorPage.tsx` 有服务器状态、采集状态、火价/物品同步、整赛季选项和 `ServerAdminPanel`；server 已提供 `/fire-history-all`、`/items-history-all`。 | 分页/增量同步、部分失败明细和大数据量同步体验。 |

## 本轮新增复查问题

复查背景：`started_at` 主链路已补齐，桌面管理面板、`serverAdmin.initSeason` 和内置 `admin.html` 均已把开服时间戳作为必填并提交。本轮新增问题集中在内置管理页导出、API 配置保存、赛季查询口径和归档语义。

| 优先级 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | `src-tauri/src/server/admin.html:809` | API 配置保存读取了错误的密码输入框。配置页密码框是 `cfg-password`，但 `saveApiConfig()` 读取 `admin-password`。 | 用户在配置页输入密码后仍无法保存 API 配置，保存入口基本不可用。 | 统一读取 `cfg-password`，或抽成一个共享密码输入/状态，避免两个密码框语义分叉。 |
| P2 | `src-tauri/src/server/admin.html:655` | 物品历史导出仍然请求火价接口。代码计算了 `endpoint`，但实际 `fetch` 写死为 `/fire-history-all`。 | 选择“物品历史”导出时会拿到火价历史，导出内容与 UI 选择不一致。 | 使用计算出的 `endpoint` 发起请求，并按火价/物品两类数据分别生成导出文件。 |
| P2 | `src-tauri/src/bin/server.rs:755` | 导出赛季选择没有后端效果。UI 拼接了 `season` 查询参数，但 `/fire-history-all` 和 `/items-history-all` 固定使用 `state.config.season_id`。 | 管理页选择历史赛季看似生效，实际仍导出当前配置赛季。 | 后端读取 `season` 或 `season_id` 查询参数，并校验对应赛季表存在后再查询。 |
| P2 | `src-tauri/src/server/db.rs:145` | `/season-start` 仍可能返回 `0`。`get_season_start()` 有常量兜底，但公开 `get_season_start_time()` 直接返回数据库值。 | 已有数据库中 `ss11`/`ss12` 若仍保留 `started_at = 0`，管理页按时间范围导出时无法正确限制范围。 | 让 `get_season_start_time()` 复用同一兜底逻辑，或迁移时补写已有记录的有效 `started_at`。 |
| P2 | `src-tauri/src/server/db.rs:558` | 归档后有效赛季记录仍保留。`archive_season()` 删除快照表，但只在 `started_at = 0` 时删除 `seasons` 记录。 | 正常赛季归档后仍出现在 `/seasons`，下次迁移又可能创建空表，归档状态混乱。 | 改为标记 `ended_at` 并在列表/导出中区分归档状态，或明确删除/隐藏该赛季记录。 |

本轮验证结果：`npm run typecheck`、`npm run vite:build`、`cargo check --all-targets`、`cargo test`、`cargo clippy --all-targets -- -D warnings`、`cargo fmt -- --check`、`web-server cargo check/fmt`、`npm audit --audit-level=moderate` 均通过。`git diff --check` 仍被尾随空格阻断，涉及 `src-tauri/src/server/admin.html`、`src/components/dashboard/ServerAdminPanel.tsx`、`src-tauri/src/db/repo_sections.rs`、`src/components/dashboard/ItemPriceTrendModal.tsx`。

## 剩余优化建议

| 优先级 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| P1 | `src/components/dashboard/ServerAdminPanel.tsx`、`src/lib/commands.ts` | 后端初始化新赛季已要求 `started_at > 0`，但桌面管理面板仍只输入并提交 `season_id`，该路径会初始化失败。 | 桌面面板补充“开服时间戳”输入，`serverAdmin.initSeason` 增加 `started_at` 参数，并在提交前校验正整数。 |
| P2 | `src-tauri/src/server/admin.html` | HTML 管理页标注 `started_at` 必填，但前端仍允许空值或 `0` 提交，由后端报错兜底，体验不一致。 | 在提交前阻断空值、非数字和小于等于 0 的值，并给出明确提示。 |
| P2 | `src-tauri/src/server/db.rs`、`src-tauri/src/bin/server.rs` | 默认赛季迁移仍写入 `started_at = 0`，公开 `/season-start` 读取原值，可能返回 `0` 或 `null`；采集链路则用了常量兜底，两边口径不完全一致。 | 迁移时写入已知赛季常量，或让 `get_season_start_time` 复用同一套兜底逻辑。 |
| P2 | `src-tauri/src/bin/server.rs` | `POST /api/admin/update-config` 保存到配置文件后没有更新运行时 `state.config`，但返回“配置已保存”，容易让用户以为立即生效。 | 要么改为热更新内存配置，要么响应和 UI 明确提示“重启后生效”。 |
| P2 | `src/components/dashboard/AIAnalysisPage.tsx` | 默认 Gateway Token 写在前端代码中，用户配置也写入 `localStorage`。 | 发布版改为首次启动生成/读取本地安全配置，敏感 token 优先放到系统安全存储或后端配置。 |
| P3 | `src-tauri/src/server/scraper.rs` | HTTP 客户端启用了 `danger_accept_invalid_certs(true)`。 | 仅在开发环境允许跳过证书校验，生产配置默认启用 TLS 校验。 |
| P3 | `src-tauri/tauri.conf.json` | CSP 仍包含 `unsafe-eval`、`unsafe-inline` 和较宽的 localhost/ws 连接范围。 | 发布前收紧 CSP，只保留实际需要的来源和指令。 |
| P3 | `src/tsconfig.json` | `strict`、`noUnusedLocals`、`noUnusedParameters` 仍关闭。 | 分阶段开启严格检查，先从共享类型和新改动模块开始。 |

## 建议修复顺序

1. 先修新赛季初始化链路：桌面面板补 `started_at`，HTML 管理页做前端校验。
2. 再统一赛季开始时间口径，避免 API、采集和迁移各用不同规则。
3. 配置保存接口明确“立即生效”还是“重启生效”。
4. 发布前处理 token 存储、TLS 校验、CSP 和 TypeScript 严格模式。
