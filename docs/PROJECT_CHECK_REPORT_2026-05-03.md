# TL Item Monitor Tauri 项目全面检查报告

检查时间：2026-05-03  
范围：React/Vite 前端、Tauri 命令层、Rust 后端、SQLite 迁移、后台任务、独立采集 server、构建与安全配置。

## 1. 总体结论

项目已经具备完整产品雏形：桌面监控首页、物品搜索、分组关注、火价/物价分析、导入导出、独立采集 server、系统通知等模块都已搭建。但当前状态还不适合稳定发布，主要原因不是单个实现缺陷，而是多条契约同时漂移：

- 前端类型定义与 Rust 配置结构不一致，`npm run typecheck` 当前失败。
- 前端 `invoke` 的命令和参数与 Tauri 后端注册/命名不完全一致，部分页面运行时会直接失败。
- 数据库 schema、迁移文件、repo 层和独立 server 使用了不同历史表设计。
- 普通/专家服、赛季上下文没有贯穿火价抓取、历史查询和配置保存链路。
- 若按新库安装，`seasons` 表没有种子数据，启用外键后物品/火价写入存在失败风险。

当前更像“功能快速拼装后的集成中期版本”。下一步建议先做契约收敛和数据模型收敛，再扩 UI 和 AI 功能。

## 2. 已执行验证

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 失败 | 3 个 TypeScript 错误，集中在 `AIAnalysisPage` 和 `SettingsPage` 的配置类型漂移 |
| `npm run vite:build` | 通过 | Vite 可打包，但它不做类型阻断，且刷新了 `dist-react` 构建产物 |
| `cargo check` | 通过 | Rust 编译通过，但有多处 warning |
| `cargo test` | 通过 | 仅覆盖 `worth_service` 的 8 个单元测试，核心 DB/命令/调度没有测试 |
| `cd src && npm run lint` | 失败 | 56 errors、5 warnings，存在未使用变量、`any`、React hooks/purity 问题 |

## 3. 高优先级问题

### P0-1. 新安装数据库可能无法写入核心数据

证据：
- `src-tauri/src/db/migrations/001_initial.sql:10` 创建 `seasons` 表。
- `src-tauri/src/db/migrations/001_initial.sql:21`、`:35`、`:51` 后续 `items`、`fire_price_records`、`item_price_snapshots` 都外键引用 `seasons(id)`。
- `src-tauri/src/app.rs:98` 打开连接后启用 `PRAGMA foreign_keys = ON`。
- 仓库中没有任何 `INSERT INTO seasons` 或 `upsert season` 逻辑。
- `src-tauri/src/db/repo_items.rs:54`、`src-tauri/src/db/repo_fire.rs:5` 直接写入 `ss12` 等 season。

影响：
新数据库中没有 `ss12` 行时，首次抓取物品/火价写入会因外键失败。启动流程里部分错误被忽略，表现可能是界面有内存态数据，但搜索/历史/分组关联全是空。

建议：
启动迁移后执行 `ensure_season(season_id)`；至少种子化 `ss12`、`ss11`，或取消 `seasons` 外键并改为软约束。写入火价、物品、历史快照前统一调用 `ensure_market_context`。

### P0-2. Tauri 命令契约漂移，部分页面运行时失败

证据：
- 前端 `src/lib/commands.ts:507` 调用 `get_deal_alerts`。
- 后端 `src-tauri/src/main.rs:28-95` 的 `generate_handler!` 没有注册 `get_deal_alerts`，仓库中也没有实现。
- 多个 Rust 命令参数使用 snake_case，如 `history_season`、`item_id`、`dest_path`、`strategy_id`，而 Tauri 默认 JS 参数约定通常是 camelCase；前端在 `src/lib/commands.ts:401-496` 大量传 snake_case。

影响：
“捡漏出货”页会直接命令不存在；备份/恢复、告警规则、物品历史、物品价格对比等命令存在参数绑定失败风险。TypeScript 泛型无法发现这些运行时错误。

建议：
建立唯一命令契约：
- Rust 侧所有 command 使用 `#[tauri::command(rename_all = "snake_case")]` 并保持前端 snake_case；或全部改成 camelCase。
- 用一个静态脚本校验 `src/lib/commands.ts` 里的 invoke 名称是否全部在 `generate_handler!` 中注册。
- 给每个命令加一组最小 integration test 或 mock invoke contract test。

### P0-3. 历史同步写入不存在的表

证据：
- 迁移里有 `item_price_snapshots`：`src-tauri/src/db/migrations/001_initial.sql:51`。
- `repo_history::get_item_history` 从 `item_price_snapshots` 读：`src-tauri/src/db/repo_history.rs:105`。
- 但 `sync_items_record` 走的 `insert_item_snapshot` 写入 `item_history`：`src-tauri/src/db/repo_history.rs:468-470`。

影响：
数据监控页同步物品历史时会在运行时报 `no such table: item_history`。该功能当前不可用。

建议：
删除 `item_history` 残留命名，统一写入 `item_price_snapshots`；若需要记录 `name/item_type/last_time`，应扩展快照表，或新增 `item_history_records` 并同步所有查询。

### P0-4. 普通/专家服火价链路没有真正按模式工作

证据：
- 默认火价抓取固定普通模式：`src-tauri/src/scraper/qiandao.rs:7-9`。
- `refresh_fire_price` 不传 market mode：`src-tauri/src/commands/fire.rs:72-80`。
- 后台火价任务也不传 market mode：`src-tauri/src/scheduler/fire_task.rs:37-39`。
- `get_latest_fire`、`get_fire_history` 不按 season/mode 过滤：`src-tauri/src/db/repo_fire.rs:45-63`。

影响：
切到专家服后，火价仍可能是普通服数据；历史图表会混合不同赛季/模式；分析建议会基于错误数据。

建议：
把 `scrape_fire_price(mode)` 作为唯一入口；`FirePriceSnapshot` 写入和读取都必须显式传 `season_id + market_mode`；前端所有 fire query key 和 Rust 查询条件保持一致。

### P0-5. 前端类型检查失败，说明配置模型已漂移

证据：
- `AIAnalysisPage.tsx:331` 把 `marketMode` 字符串传给 `cmd.getFireHistory(hours: number)`。
- `AIAnalysisPage.tsx:405` 保存 `ai_settings`，但 `AppConfig` 没有该字段。
- `SettingsPage.tsx:150` 构造 `AppConfig` 缺少 `deal` 字段；同时 Rust `AppConfig` 也没有 `deal`。
- 前端 `src/lib/commands.ts:238-245` 的 `AppConfig` 包含 `deal`，Rust `src-tauri/src/core/state.rs:29-37` 不包含。

影响：
当前根目录 `npm run typecheck` 已失败。配置保存会丢字段或写出 Rust 不能识别/前端不能类型通过的结构，后续功能更容易互相覆盖。

建议：
先定义一份 canonical config schema。推荐 Rust `AppConfig` 为源，生成 TS 类型，或用 JSON Schema/Zod 双端共享。把 `deal`、`ai_settings` 明确纳入 schema，或移出配置文件单独存储。

## 4. 功能逻辑问题

### 4.1 设置保存不更新运行态上下文

`SettingsPage.tsx:180-183` 保存了 `season_id`，但 `save_config` 只更新 `state.config`：`src-tauri/src/commands/config.rs:12-22`，不会更新 `state.active_context`。后台任务使用的是 active context，用户改赛季后通常要重启才生效。

优化：
保存配置时如果 `app.season_id` 或 scrape mode 改变，同步更新 active context，并 emit `market-context-changed`。必要时重启调度任务。

### 4.2 TopBar 切换模式存在 stale state 风险

`TopBar.tsx:35-39` 的 `onSuccess` 使用外层 `marketMode` state，而不是 mutation 变量 `newMode`。`handleModeChange` 先 `setMarketMode` 再 `mutate`，在异步完成时可能把 context 设置回旧值。

优化：
`useMutation` 的 `onSuccess(_, newMode)` 直接使用变量；或把切换封装成一个显式函数，先后端成功，再一次性更新本地 state/context。

### 4.3 告警规则 UI 与后台告警任务脱节

证据：
- `AlertsPage.tsx` 存在，但 `Sidebar.tsx` 和 `App.tsx` 没有挂载该页面。
- `repo_alerts::create_alert_event` 和 `update_rule_last_triggered` 没有调用点。
- `scheduler/alert_task.rs` 只检查“当前价 < 购买价”，不读取 `alert_rules`，也不写 `alert_events`。

影响：
用户创建的告警规则不会触发，最近预警记录永远为空。后台每分钟可能重复通知同一批物品，没有 cooldown/quiet hours。

优化：
决定保留哪套告警模型：若保留规则系统，后台任务按 `alert_rules` 计算、写入 `alert_events`、更新 `last_triggered_at`，并遵守冷却/免打扰；若只做“值得买”提醒，则删除未完成规则 UI。

### 4.4 数据监控页与独立 server API 不匹配

证据：
- `DataMonitorPage.tsx:122` 请求 `/fire-history-all`，server 没有该路由。
- `DataMonitorPage.tsx:157` 请求 `/items-history-all?season_id=...&market_mode=...`，server 实现只读取 `mode` 和 `limit`。
- `server/bin` 手写 HTTP query 解析，末尾参数会带 `HTTP/1.1`，例如 `limit=168 HTTP/1.1` 导致解析失败回默认值。
- Tauri CSP `connect-src 'self'`：`src-tauri/tauri.conf.json:26`，生产环境会阻止前端 fetch `http://localhost:8080` 和第三方 AI API。

影响：
同步“全赛季”火价不可用；同步物品历史可能读错模式/时段；AI 分析和本地 server 连接在生产包里可能被 CSP 拦截。

优化：
使用 axum/warp/tauri command 代替手写 HTTP；补齐 `/fire-history-all`；统一查询参数；CSP 中显式允许用户配置的 local server 或改由 Rust command 代理请求。

### 4.5 导入导出 CSV 格式不一致

证据：
- UI 文案说 CSV 为 `section_id,item_id,item_name,item_type,price,count,more_per_fire`。
- 后端 `import_watchlist_csv` 实际按 `section_id,season_id,market_mode,item_id,purchase_fire_price,count,more_value` 解析。
- 后端只检查 `record.len() >= 3`，但会继续读取 3 以后字段，缺失时默认 `item_id=""`、价格 0。

影响：
用户按界面说明导入会错列，可能导入空 item 或失败。

优化：
导入导出共用一份 CSV schema；强校验 header；逐行返回具体错误；支持兼容旧格式时做显式版本字段。

## 5. 架构与代码质量问题

### 5.1 前端有两套 package 和 node_modules

根目录 `package.json` 使用 Vite 6、React 19.1、Tauri API 2.5；`src/package.json` 使用 Vite 8、React 19.2、Tauri API 2.10，并有独立 `src/node_modules`。根 `vite.config.ts` 的 root 又指向 `src`。

风险：
不同开发者在根目录或 `src/` 目录运行脚本，会得到不同依赖、不同 lint/type 行为，构建结果不稳定。

优化：
保留根目录唯一前端包管理入口；删除或合并 `src/package.json`、`src/package-lock.json`、`src/node_modules`。若需要 monorepo，用 workspace 明确配置。

### 5.2 构建链路不会阻断类型错误

`package.json:8` 的 `build` 只是 `tauri build`，`tauri.conf.json:6-10` 没有 `beforeBuildCommand`。当前 `npm run vite:build` 可以通过，即使 `npm run typecheck` 失败。

优化：
根脚本改为：
- `check`: `npm run typecheck && cd src-tauri && cargo check`
- `build:web`: `npm run typecheck && vite build`
- Tauri `beforeBuildCommand`: `npm run build:web`

### 5.3 迁移和 repo 层有未完成的分表重构残留

存在 `002_split_tables.sql` 和 `repo_split.rs`，但桌面 app 的 `run_migrations` 只执行 `001_initial.sql` 与 `002_add_constraints.sql`。独立 server 又使用 `fire_history_normal/items_history_normal` 分表。三套模型同时存在。

优化：
选一种模型：
- 推荐桌面端统一单表：`season_id + market_mode + scraped_at` 复合索引，减少重复代码。
- 独立 server 同步到桌面也写同一 schema。
- 删除未使用的 split migration/repo，避免误导。

### 5.4 错误处理过度吞掉失败

典型位置：
- 启动火价写库 `let _ = repo_fire::insert_fire_record(...)`。
- 后台诊断更新多处 `let _ = ...`。
- 启动物品 bulk insert 失败时部分分支只返回内存 items，没有显式错误。

优化：
区分“可忽略 telemetry 失败”和“业务写库失败”。核心写库失败必须进入 UI 状态、日志和诊断表，不能静默。

### 5.5 安全边界偏宽

风险点：
- `withGlobalTauri: true`。
- CSP 使用 `unsafe-eval`、`unsafe-inline`，且 `connect-src 'self'` 又与实际业务 fetch 冲突。
- Tauri capability 允许 `$HOME/**` 文本读写。
- `reqwest` 使用 `danger_accept_invalid_certs(true)`。
- 物品 API 是硬编码明文 HTTP IP。

优化：
收紧 capabilities 到 app data 目录和用户选择路径；去掉无必要的 `withGlobalTauri`；AI/local server 网络请求尽量走 Rust command 代理；移除 invalid cert 接受；把外部 API 配置化并做超时、重试和错误分类。

## 6. 优化路线图

### 第一阶段：止血与可运行性（1-2 天）

1. 修复 `npm run typecheck` 三个错误。
2. 实现或移除 `get_deal_alerts`；保证所有 `invoke` 名称后端都存在。
3. 统一 Tauri command 参数命名策略，批量修正 snake/camel。
4. 修复 `insert_item_snapshot` 写错表。
5. 为 `seasons` 增加种子/ensure 逻辑。
6. 给 `tauri.conf.json` 增加 `beforeBuildCommand`，让构建先跑 typecheck。

### 第二阶段：数据模型收敛（2-4 天）

1. 确定桌面与 server 共用的最终 SQLite schema。
2. 删除 `repo_split.rs` 或完成迁移接入，避免双模型。
3. 所有火价/物品/历史查询都加 `season_id + market_mode`。
4. 增加迁移测试：空库迁移、旧库迁移、外键写入、重复快照去重。
5. 为导入导出 CSV 定义 schema 并加 round-trip test。

### 第三阶段：运行态和调度稳定化（3-5 天）

1. 保存配置后同步 active context，并 emit 事件刷新前端。
2. 后台任务按配置动态 sleep，配置变化时能立即生效。
3. 火价任务抓取后按策略决定是否每次入库，或只入当前表+小时快照，但 UI 语义要一致。
4. 告警系统接入 `alert_rules`、`alert_events`、cooldown 和 quiet hours。
5. 给 scraper 增加 source diagnostics 的一致记录和 retry/backoff。

### 第四阶段：前端质量与体验（持续）

1. 合并根目录和 `src/` 的 package/node_modules。
2. 打开 TS strict，先从 `noImplicitAny` 和命令类型开始。
3. 清理 lint 的未使用 imports、`any`、hooks 问题。
4. 把 `src/types.ts` 与 `src/lib/commands.ts` 的重复类型合并。
5. 为核心页面加错误态：命令不存在、参数错误、DB 写入失败、CSP/network 失败。

### 第五阶段：发布安全与工程化（持续）

1. capabilities 最小化，限制 fs 到 app data 和用户选择文件。
2. CSP 根据实际网络策略重写，避免 `unsafe-eval`。
3. Git 忽略或移除 `dist-react`、`src/tsconfig.tsbuildinfo` 等生成物，除非明确采用提交构建产物策略。
4. CI 增加：typecheck、lint、cargo check、cargo test、迁移测试、invoke contract check。
5. 发布前做一次真实 Tauri 包冒烟测试：首次安装、切换专家服、导入 CSV、同步 server、恢复 DB、通知权限。

## 7. 推荐修复顺序

最建议先按这个顺序推进：

1. 命令契约：`get_deal_alerts`、snake/camel、sync 表名。
2. 数据库启动：`ensure_season` + migration test。
3. 火价上下文：抓取/查询全部带 `season_id + market_mode`。
4. 配置 schema：补齐 `deal`、`ai_settings` 或移除前端残留。
5. 构建质量门禁：typecheck 阻断 build。
6. server/DataMonitor/API/CSP 一起收敛。

完成前 3 项后，核心监控功能才算真正稳定；完成前 5 项后，项目才适合进入可发布版本。
