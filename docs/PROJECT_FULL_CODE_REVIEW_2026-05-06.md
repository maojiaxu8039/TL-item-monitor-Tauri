# 项目全面代码检查报告

检查日期：2026-05-06  
检查范围：前端 React/Vite、Tauri 后端 Rust、内置数据同步 server、数据库迁移、后台任务、项目目录与构建产物。  
报告重点：废弃/冗余代码、逻辑问题、功能跑通风险、后续优化顺序。

## 1. 总结结论

当前项目不是“少量样式问题”的状态，而是处在功能快速叠加后的整合期。前端类型检查能通过，但后端当前编译测试失败；另外数据库分表、赛季归档、数据同步、测试数据注入、外部 server 这几块存在互相不完全一致的问题。

最高优先级建议：

1. 先修复 Rust 编译失败，否则无法确认后端功能是否真的跑通。
2. 再统一数据同步接口契约，尤其是 `DataMonitorPage` 与 `src-tauri/src/bin/server.rs` / `src-tauri/src/server/db.rs` 的字段名和参数名。
3. 接着整理数据库迁移链和赛季快照表结构，避免新老数据库漂移。
4. 最后清理重复项目、测试入口、不可达页面和构建产物，降低维护成本。

## 2. 本次验证结果

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 前端 TypeScript 当前无类型错误。 |
| `cargo test` in `src-tauri` | 失败 | `src-tauri/src/db/repo_history.rs` 有 6 个 `i32` / `i64` 类型不匹配错误。 |
| 全量功能自动化测试 | 未继续 | 后端当前无法通过编译测试，全量功能验证应在 Rust 修复后再跑。 |

当前 `cargo test` 的阻断错误集中在：

- `src-tauri/src/db/repo_history.rs:479`
- `src-tauri/src/db/repo_history.rs:480`
- `src-tauri/src/db/repo_history.rs:505`
- `src-tauri/src/db/repo_history.rs:506`
- `src-tauri/src/db/repo_history.rs:569`
- `src-tauri/src/db/repo_history.rs:570`

问题本质：`FirePriceCompareResult` / `ComparePoint` 的 `current_day`、`current_hour`、`day`、`hour` 是 `i64`，但查询与计算得到的是 `i32`，当前没有转换。

## 3. 当前工作区状态风险

工作区当前存在大量未提交变更，不建议直接做清理性删除，先确认这些变更哪些是刻意迁移、哪些是构建产物：

- 根目录多份旧文档被删除，同时 `docs/` 里有新文档，可能是文档迁移，也可能是误删。
- `dist-react/assets/*` 出现旧 hash 文件删除、新 hash 文件新增，说明构建产物被 Git 跟踪，后续每次 build 都会产生大量噪音。
- `src-tauri/src/*.rs` 多个后端文件被修改，包括后台任务、server、history repo。
- `web-server/`、`dev_data/`、`test_price_compare.rs` 是未跟踪内容。
- `src/tsconfig.tsbuildinfo` 被修改，应考虑加入 `.gitignore`。

建议先处理 `.gitignore` 与构建产物策略，再开始删除冗余代码，避免把用户仍需要的文件当作垃圾清掉。

## 4. 需要优先修复的逻辑问题

### P0：后端当前不能通过编译测试

位置：`src-tauri/src/db/repo_history.rs:479-570`

`get_fire_price_compare` 当前返回结构使用 `i64` 字段，但 `season_day` 和 `hour` 是 `i32`。这会直接导致 `cargo test` 失败，任何后端功能跑通都无法确认。

建议：

- 统一 `season_day` / `hour` 的类型。数据库里 `season_day INTEGER`，Rust 对外 API 如果没有大数需求，可统一为 `i32`；如果前端图表全部按 number 使用，也可以在 Rust 返回结构统一 `i64` 并显式转换。
- 修复后立刻跑 `cargo test`。

### P1：数据同步接口契约仍不一致

前端位置：`src/components/dashboard/DataMonitorPage.tsx:35-58`、`src/components/dashboard/DataMonitorPage.tsx:121-183`  
后端位置：`src-tauri/src/bin/server.rs:309-381`、`src-tauri/src/server/db.rs:261-279`、`src-tauri/src/server/db.rs:424-466`

主要问题：

- 前端整赛季接口传 `season_id` 和 `market_mode`，但 server 的 `/fire-history-all`、`/items-history-all` 读取的是 `mode`，并且使用 `state.config.season_id`，传入的 `season_id` 实际被忽略。
- 前端 expert 整赛季同步 URL 是 `?market_mode=season_expert`，server 没读这个字段，所以会默认走 normal。
- 非整赛季物品同步请求 `/items-history?mode=...&limit=...`，但 server `/items-history` 要求 `item_id`，否则返回 400。
- 前端 `FireHistoryRecord` 期待 `recorded_at`、`created_at`，server 返回 `scraped_at`、`season_day`。
- 前端 `ItemsHistoryRecord` 期待 `name`、`item_type`、`price`、`last_time`、`recorded_at`，server 返回 `item_id`、`fire_price`、`scraped_at`、`season_day`，`name` 还是 `None`。

影响：

- 数据监控页看起来能点，但同步结果会出现字段 undefined、模式错、物品非整赛季直接失败等问题。

建议：

- 定义一份共享 DTO：server 输出什么字段，前端就声明什么字段。
- `/fire-history`、`/fire-history-all`、`/items-history`、`/items-history-all` 统一支持 `season_id`、`mode` 或 `market_mode`，不要混用。
- 如果“同步所有物品”是业务需求，非整赛季也应调用 `/items-history-all?limit=...`，而不是调用单物品接口。

### P1：数据库迁移链不完整，v8 SQL 语法非法

迁移执行位置：`src-tauri/src/app.rs:280-310`  
迁移文件：`src-tauri/src/db/migrations/005_add_season_api_configs.sql` 到 `008_create_item_realtime_fire_prices.sql`  
v8 问题位置：`src-tauri/src/db/migrations/008_create_item_realtime_fire_prices.sql:3-12`

问题：

- `run_migrations` 只显式应用到 v4，但目录里已经有 v5-v8。
- v8 在 `CREATE TABLE` 内写了 `INDEX idx_item_scraped (...)`，SQLite 不支持这种写法，应使用独立 `CREATE INDEX`。

影响：

- 新功能表可能只靠 `ensure_*` 补建，迁移记录与实际 schema 会漂移。
- 老用户数据库升级路径不可信。

建议：

- 把 v5-v8 纳入统一迁移执行。
- 修正 v8 为：
  - `CREATE TABLE ...`
  - `CREATE INDEX IF NOT EXISTS idx_item_scraped ON item_realtime_fire_prices(item_id, scraped_at DESC);`
- 增加一个空库迁移测试和旧库升级测试。

### P1：赛季归档与新赛季初始化的快照表结构不一致

位置：

- `src-tauri/src/commands/season.rs:97-109`
- `src-tauri/src/commands/season.rs:171-180`
- `src-tauri/src/commands/season.rs:414-443`
- `src-tauri/src/commands/season.rs:470-507`

问题：

- 归档目标 item snapshot 表只创建 `item_id/fire_price/scraped_at`，但源表可能有 `name/item_type/season_day`。
- `copy_table_data` 会按源表所有列插入目标表，目标缺列时会报错。
- 新赛季初始化创建的 item snapshot 表也缺 `name/item_type`，与 v7 “给 snapshots 增加 name/type” 的意图冲突。

影响：

- 归档赛季时可能失败。
- 新赛季创建后，物品历史对比与搜索页面可能拿不到名称、类型、赛季天。

建议：

- 抽出统一的建表函数，归档表、新赛季表、迁移表都复用同一 schema。
- `copy_table_data` 改为取源表与目标表列交集，或目标表严格镜像源表。

### P1：启动时会注入测试数据

位置：`src-tauri/src/app.rs:454-483`、`src-tauri/src/app.rs:489`、`src-tauri/src/app.rs:798`、`src-tauri/src/app.rs:1104`

`seed_seasons` 每次数据库初始化都会调用 `seed_test_data_for_all_seasons`。这类测试数据逻辑应只在开发环境或显式命令下运行。

影响：

- 生产/真实用户数据库可能被写入模拟 SS11/SS12 数据。
- 历史分析看起来有数据，但可能混入测试来源，业务判断失真。

建议：

- 默认关闭测试数据注入。
- 用配置项或 debug-only 命令控制。
- 将 `seed_test_data_for_ss11`、`seed_test_data_for_ss12`、`seed_test_data_for_all_seasons` 移到开发工具模块或测试 fixture。

### P1：实时表与赛季表模型混用

位置：

- `src-tauri/src/db/table_resolver.rs:10-26`
- `src-tauri/src/db/table_resolver.rs:52-60`
- `src-tauri/src/db/repo_items.rs:55-81`

当前 `TableResolver::items_table` / `fire_price_table` 明确忽略 `season_id`，实时表是共享表；但很多 repo 函数仍保留 `season_id` 参数，部分地方又硬编码 `"ss12"`。

具体例子：

- `repo_items::get_items_count` 忽略传入 season，硬编码 `ss12`。
- `repo_items::bulk_insert_items` 忽略传入 season，硬编码 `ss12`。
- `supported_combinations()` 只列出 ss11/ss12，但 `seed_seasons` 里还插入 ss10。

影响：

- 切换赛季时，实时数据与历史快照数据容易混淆。
- 新赛季初始化后，通用统计/搜索可能仍按 ss12 逻辑跑。

建议：

- 明确系统模型：实时表是否永远只代表“当前赛季”。
- 如果是，命名和 API 层不要再传 season_id，避免误导。
- 如果不是，就恢复按赛季分表或增加 `season_id` 列。

### P2：搜索分页和筛选不准确

位置：`src-tauri/src/db/repo_items.rs:7-50`

问题：

- `_day_filter`、`_type_filter` 参数完全没有使用。
- `total` 返回当前页 `items.len()`，不是符合条件的总记录数。

影响：

- 前端分页总数不准。
- 类型筛选、赛季天筛选无效。

建议：

- 查询列表和 `COUNT(*)` 共用同一套 WHERE 条件。
- 如果实时表没有 `season_day`，day filter 应明确只对 snapshot 查询生效，前端也要禁用或切换数据源。

### P2：普通浏览器调试会触发 Tauri runtime 错误

位置：`src/hooks/useTauriEvents.ts:15-78`

hook 在普通 Vite 浏览器环境直接调用 `listen`。在 Tauri 内是合理的，但在 `localhost:5173` 调试时会出现 Tauri runtime 相关错误。

建议：

- 增加 runtime guard，例如检测 `window.__TAURI_INTERNALS__` 或封装安全的 `safeListen`。
- 普通浏览器下跳过事件订阅，只保留 UI 渲染。

### P2：实时捡漏任务不可控退出

位置：`src-tauri/src/app.rs:1368-1373`、`src-tauri/src/scheduler/realtime_fire_task.rs:8-32`

主后台任务的 `SchedulerHandle` 现在已经被保存到 `AppState`，这修复了之前 sender 立即 drop 的大问题。但新增的 `run_realtime_fire_price_collect_task` 没有 abort receiver，也不在 `SchedulerHandle` 中。

影响：

- App 生命周期内大概率没问题，但后续如果要重启任务、切换配置、测试清理或优雅退出，会缺少控制入口。

建议：

- 给 realtime task 增加 abort channel。
- 把它纳入 `SchedulerHandle`。

## 5. 可清理或合并的冗余/废弃代码

### 5.1 嵌套前端项目 `src/package.json` 与 `src/node_modules`

位置：`src/package.json`、`src/package-lock.json`、`src/node_modules/`

根目录已经有主 `package.json`，`src/` 下还有一套 Vite/package 配置，依赖版本还与根目录不一致，例如 React、Tauri API、Vite、TypeScript 都是不同版本。

影响：

- 新人或自动化脚本容易误入 `src/` 执行 npm 命令。
- 依赖版本漂移，排查问题时会混乱。
- `src/node_modules` 体积约 294M。

建议：

- 如果 `src/package.json` 不是刻意保留的独立 demo，应删除 `src/package.json`、`src/package-lock.json`、`src/node_modules/`。
- 只保留根目录包管理。

### 5.2 `web-server/` 与 Tauri 内置 server 重复

位置：

- `web-server/`
- `src-tauri/src/bin/server.rs`
- `src-tauri/src/server/db.rs`
- `src-tauri/src/server/scraper.rs`

当前存在两套 server：

- `web-server/` 是独立 Axum 项目，且未跟踪。
- `src-tauri/src/bin/server.rs` 是 Tauri 项目里的手写 TCP HTTP server。

影响：

- API 行为可能不一致。
- 数据同步、字段映射、调试入口都可能分叉。
- `web-server/target` 体积约 724M。

建议：

- 选择唯一权威 server。
- 如果只需要内置 server，删除或归档 `web-server/`。
- 如果希望用 Axum，建议反过来替换 `src-tauri/src/bin/server.rs` 的手写 HTTP 解析逻辑。

### 5.3 不可达或半废弃前端页面

位置：

- `src/app/App.tsx:13` 的 `SeasonPage` lazy import
- `src/app/App.tsx:61` 注释说明 season 路由已移除
- `src/components/dashboard/SeasonPage.tsx`
- `src/components/dashboard/DataRecordsPage.tsx`
- `src/components/dashboard/AlertsPage.tsx`

问题：

- `SeasonPage` 被 lazy import，但页面条件分支已经没有 `page === "season"`。
- `DataRecordsPage`、`AlertsPage` 存在导出，但没有在 `PageId` 和 Sidebar 路由里使用。

建议：

- 如果这些页面已被新页面替代，删除文件与 import。
- 如果只是暂时隐藏，补一份 TODO 和路线图，不要让它们变成长期幽灵页面。

### 5.4 测试数据入口与临时测试文件

位置：

- `src-tauri/src/app.rs:489`、`src-tauri/src/app.rs:798`、`src-tauri/src/app.rs:1104`
- `src-tauri/src/db/repo_realtime_fire.rs:237`
- `src-tauri/src/commands/items.rs:484`
- `src/components/dashboard/DealsPage.tsx:176-180`
- `test_price_compare.rs`

问题：

- 测试数据生成函数混在正式 app 初始化和 command 里。
- Deals 页面存在“生成测试数据”按钮，并用 `alert()` 提示。
- 根目录有未跟踪的 `test_price_compare.rs`。

建议：

- 生产 UI 不显示测试数据按钮。
- 测试数据入口移动到 debug/dev-only 命令。
- 根目录临时测试文件删除或移入 `src-tauri/tests/`。

### 5.5 调试日志与 mock 分析

位置：

- `src/components/dashboard/ItemsPage.tsx`
- `src/components/dashboard/ItemPriceTrendModal.tsx`
- `src/components/dashboard/SearchBar.tsx`
- `src/components/dashboard/AIAnalysisPage.tsx`
- `src/lib/hermes.ts`
- `src/components/dashboard/PriceAnalysisPage.tsx:276`

问题：

- 多处 `console.log("[DEBUG] ...")` 会污染浏览器控制台。
- `PriceAnalysisPage` 的 `generateMockAnalysis(items: any[])` 会让用户以为是正式分析结果。

建议：

- 用统一 logger，开发环境输出，生产环境静默。
- mock 分析必须改名/标记为示例，或替换成真实算法。
- `any[]` 改成明确类型。

### 5.6 构建产物和发布文件不应长期跟踪

位置：

- `dist-react/`
- `TL-Monitor-Windows.zip`
- `tl-monitor-windows.exe`
- `src/tsconfig.tsbuildinfo`
- `dev_data/`

问题：

- `dist-react` hash 文件每次构建都会变化，当前 Git 状态已经出现大量删除/新增。
- zip/exe 是发布产物，不建议和源码一起维护。
- `dev_data` 是本地运行数据，容易很大且包含环境状态。

建议 `.gitignore` 增加：

```gitignore
dist-react/
web-server/target/
dev_data/
*.tsbuildinfo
*.db
*.sqlite
*.sqlite3
*.exe
*.zip
```

如果必须提交 `dist-react` 给 Tauri release，建议单独约定构建产物提交策略，不要混在功能 PR 里。

## 6. 前端显示与交互问题

### 小窗模式按钮没有行为

位置：`src/components/layout/Sidebar.tsx:67-75`

“小窗模式”按钮只有 UI，没有 `onClick`。用户点击没有反馈。

建议：

- 接入 Tauri window API 实现小窗。
- 或暂时禁用按钮并加 tooltip。
- 如果不准备做，删除入口。

### 数据监控页的同步反馈可能误导

位置：`src/components/dashboard/DataMonitorPage.tsx:115-204`

由于接口字段不一致，循环里单条同步失败只 `console.error`，最后仍可能 toast “已同步 N 条”。如果所有字段 undefined 但命令层没有严格校验，会写入脏数据；如果单条失败很多，也缺少失败数展示。

建议：

- 同步结果展示成功数、失败数、第一条失败原因。
- DTO 字段缺失时直接阻断，不要继续写库。

### 普通浏览器调试体验不稳定

位置：`src/hooks/useTauriEvents.ts`

普通 Vite 浏览器不是最终运行环境，但它是开发阶段最常用的视觉检查入口。当前 Tauri event hook 会让 console 出错，影响前端显示检查。

建议：

- 加 runtime guard 后再进行浏览器视觉检查。

## 7. 后端业务功能可改进点

### 赛季模型需要中心化

当前赛季开始时间、支持赛季、实时表归属分散在多个地方：

- `seed_seasons` 写死 ss12/ss11/ss10。
- `TableResolver::supported_combinations()` 只支持 ss12/ss11。
- `repo_fire.rs` 有 TODO：生产应从 seasons 表读取赛季开始日期。
- 测试数据函数写死 SS11/SS12 日期。

建议建立 `SeasonService`：

- 读取 `seasons` 表中的当前赛季。
- 提供 `calculate_season_day(season_id, timestamp)`。
- 提供支持的 snapshot 表列表。
- 新赛季初始化、归档、历史对比都通过它。

### 数据表 schema 应由一个地方生成

现在 schema 出现在 migration、`ensure_split_tables`、`init_new_season`、archive create functions、server db init 中，容易互相漂移。

建议：

- 保留 migration 作为权威 schema。
- 运行时只做必要的兼容性 ensure。
- 新赛季表创建复用同一个 SQL builder。

### 手写 HTTP server 建议替换

`src-tauri/src/bin/server.rs` 自己解析 request、query、response。对于当前业务量可用，但随着接口越来越多，容易出现参数解析和 CORS/错误响应不一致。

建议：

- 如果保留本地 server，优先使用 Axum。
- 如果只是辅助同步，考虑直接走 Tauri command，减少 HTTP server 这一层。

### 历史快照需要保证名称和类型完整

物品历史分析依赖 `name`、`item_type`、`season_day`，但部分插入函数和新赛季建表不完整。

建议：

- `insert_item_price_snapshots`、`insert_item_snapshot` 统一写入 `name`、`item_type`、`season_day`。
- 对旧表补迁移。
- 前端图表不要用缺失名称的数据做展示。

## 8. 建议清理顺序

第一阶段：让项目重新可验证

1. 修复 `repo_history.rs` 的类型错误。
2. 跑通 `cargo test`。
3. 跑通 `npm run typecheck`。
4. 启动 Tauri 或 Vite，做一次核心页面视觉检查。

第二阶段：修复会写坏数据的业务链路

1. 统一数据同步 API DTO。
2. 修复 DataMonitor 的 mode/season 参数。
3. 修复 item history all / single item 的调用边界。
4. 给 sync command 增加字段校验。

第三阶段：修复数据库生命周期

1. 纳入 v5-v8 迁移。
2. 修 v8 SQLite 语法。
3. 统一 snapshot schema。
4. 修复归档 copy 逻辑。
5. 关闭默认测试数据注入。

第四阶段：清理冗余

1. 删除或合并 `src/package.json` 这套嵌套前端项目。
2. 决定 `web-server/` 是否保留。
3. 删除不可达页面或补路由。
4. 删除临时测试文件和生产 UI 测试按钮。
5. 整理 `.gitignore` 和构建产物跟踪策略。

## 9. 建议保留的改动

当前后台任务已有一个正确方向的修复：

- `src-tauri/src/main.rs:122-128` 将 `start_background_tasks` 返回的 `SchedulerHandle` 保存进 `state.scheduler_handle`。
- `src-tauri/src/core/state.rs:12` 增加了 `scheduler_handle`。
- fire/items/history/alert task 对 abort channel closed/lagged 的处理比之前更清晰。

这部分思路应保留。但因为当前后端编译失败，还需要在修复后通过测试和实际启动验证。

## 10. 最终判断

项目主体功能方向是清楚的：火价采集、物品价格、赛季历史对比、捡漏分析、数据同步和 AI 分析都已经有页面或后端雏形。但当前最大问题是“同一个业务概念在多个层里长成了不同形状”：

- season/mode 参数不统一。
- realtime/snapshot 表边界不统一。
- migration/ensure/init/archive schema 不统一。
- server DTO 与前端 DTO 不统一。
- 测试数据与生产数据入口不统一。

如果先做大规模 UI 或功能新增，会继续放大这些不一致。建议先完成一轮“数据模型与接口契约收口”，然后再继续优化体验和功能。
