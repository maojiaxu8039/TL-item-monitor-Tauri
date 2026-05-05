# TL Item Monitor Tauri 项目分析报告

日期：2026-05-06  
范围：项目结构、Tauri/Rust 后端、React 前端、独立采集服务、构建测试、代码冗余与业务改进建议。

## 总结

项目当前可以通过 TypeScript 类型检查、前端生产构建、Rust 单元测试和 `web-server` 编译测试，Tauri release 二进制也能生成。但目前不能判定“所有功能已跑通”，因为审查发现多处功能级断点：

- 后台定时任务的生命周期有 P1 问题，可能启动后立刻退出。
- 历史火价/物价对比存在读错表和赛季天数计算错误，分析结果可能失真。
- 数据监控页与独立 server 的接口和字段不匹配，同步功能实际跑不通。
- 赛季归档、新赛季初始化、迁移链存在表结构漂移风险。
- 前端浏览器调试环境会直接触发 Tauri runtime 错误，部分页面仍有调试日志、测试按钮和不可达页面。

建议先修 P1，再补集成测试，最后清理仓库产物和未接通功能。

## 验证结果

已执行：

- `npm run typecheck`：通过。
- `npm run vite:build`：通过。
- `cargo test` in `src-tauri`：通过，15 passed；存在多条 warning。
- `cargo test` in `web-server`：通过，但 0 个测试。
- `npm run build`：前端构建和 release 二进制生成成功，最终 DMG bundling 失败在 `bundle_dmg.sh`。
- 浏览器打开 `http://localhost:5173/`：主页面可渲染，侧边栏页面可切换，但控制台有 Tauri runtime/invoke 错误和 React duplicate key warning；窄宽视口下 TopBar 和卡片文字有挤压错位。

构建备注：

- Tauri 提示 bundle identifier `com.tlmonitor.app` 以 `.app` 结尾，不推荐。
- `npm run build` 会重写 `dist-react/` 的 hashed 产物，导致大量构建产物变更。

## P1 问题

### 1. 后台任务可能启动后立刻退出

位置：`src-tauri/src/main.rs:122-125`、`src-tauri/src/app.rs:1327+`

`start_background_tasks` 返回 `SchedulerHandle`，但调用处没有保存。函数返回后 handle 内的 `broadcast::Sender` 会 drop，任务中的 `abort.recv()` 会立刻完成并进入退出分支。

影响：

- 定时火价抓取不持续运行。
- 物品自动刷新不持续运行。
- 小时快照不持续写入。
- 价格提醒不持续运行。

建议：

- 将 `SchedulerHandle` 放进 `AppState`，或 `app.manage(...)` 保存。
- 后台任务应区分“收到 abort 信号”和“channel closed”，避免 sender drop 被误认为主动停止。
- 为 `run_fire_scrape_task` 等任务加生命周期测试或启动后状态观测。

### 2. 历史火价对比读错表

位置：`src-tauri/src/db/repo_history.rs:430-465`

`get_fire_price_compare` 接收 `history_season`，但通过 `TableResolver::fire_price_table` 解析的是共享实时表，不是 `fire_price_snapshots_{season}_{mode}`。同时 `current_day` 使用 `(timestamp / 86400) % 365`，不是赛季第 N 天。

影响：

- 当前赛季和历史赛季可能读到同一类实时表。
- “同期/同天/同小时”的对比维度错误。
- 火价趋势、风险提示、建议价可能误导用户。

建议：

- 当前和历史都读取 snapshot 表。
- 赛季天数从 `seasons.started_at` 计算，不要用 Unix day modulo。
- 输出 compare data 时用 `season_day` 和小时字段对齐。

### 3. 数据监控同步接口对不上

位置：`src/components/dashboard/DataMonitorPage.tsx:121-183`、`src-tauri/src/bin/server.rs`

前端整赛季火价同步请求 `/fire-history-all`，但独立 server 没有该路由。物品非整赛季同步请求 `/items-history` 却没有传 `item_id`，server 会返回 400。字段也不一致：前端读 `recorded_at/price/name`，server 返回 `scraped_at/fire_price` 等字段。

影响：

- 数据监控页同步火价/物品历史大概率失败。
- 即使请求成功，也可能因为字段不匹配写入空值或错误数据。

建议：

- 统一 server API DTO 和前端 DTO。
- 增加 `/fire-history-all` 或前端改用已有路由。
- 物品批量同步统一使用 `/items-history-all`，或补充服务端按时间段返回所有物品的接口。
- 将 `scraped_at`/`recorded_at`、`fire_price`/`price` 命名统一。

### 4. 赛季归档会复制失败

位置：`src-tauri/src/commands/season.rs:97-104`、`src-tauri/src/commands/season.rs:414-449`

归档目标表只创建了部分列，但 `copy_table_data` 会按源表的全部列插入。源快照表包含 `season_day`，部分 item snapshot 表还包含 `name`、`item_type`，目标表没有这些列。

影响：

- 归档时可能报 `no column named season_day/name/item_type`。
- 赛季归档流程不可靠，后续新赛季初始化会被阻塞。

建议：

- 归档表使用 `CREATE TABLE target AS SELECT * FROM source WHERE 0` 或按源表 schema 动态建表。
- 如果只归档部分字段，则 copy 时也只选择目标存在的字段。
- 为 `archive_season` 加临时数据库集成测试。

## P2 问题

### 5. 搜索分页和筛选不正确

位置：`src-tauri/src/db/repo_items.rs:14-48`

`day_filter` 和 `type_filter` 参数被忽略；`total` 使用当前页 `items.len()`，不是全量 count。

影响：

- 物价数据页筛选不生效。
- 分页总数错误，下一页/总页数会错。
- 按赛季天筛选的 UI 与后端行为不一致。

建议：

- SQL 增加 `item_type` 条件。
- 如果 `day_filter` 面向历史快照，应切到 snapshot 表查询。
- 单独执行 `COUNT(*)` 作为 total。

### 6. 迁移链不完整且 v8 SQL 无效

位置：`src-tauri/src/app.rs:295-316`、`src-tauri/src/db/migrations/008_create_item_realtime_fire_prices.sql`

运行迁移只显式处理到 v4，但目录已有 v5-v8。v8 在 `CREATE TABLE` 内写 `INDEX idx_item_scraped (...)`，这不是 SQLite 合法语法。

影响：

- 老数据库升级可能缺列/缺表。
- 新功能依赖的表结构可能靠 `ensure_split_tables` 部分兜底，导致迁移记录和真实 schema 不一致。

建议：

- 将迁移改为列表驱动，自动按版本执行 `001` 到最新。
- 修正 v8：先 `CREATE TABLE`，再 `CREATE INDEX`。
- 对已有用户数据库做幂等 ALTER 时，先查 `PRAGMA table_info`。

### 7. 浏览器/Vite 调试环境会报 Tauri runtime 错

位置：`src/hooks/useTauriEvents.ts:15-17`

普通浏览器中没有 Tauri runtime，`listen` 会触发 `transformCallback` 相关错误。

影响：

- Vite 浏览器调试体验较差。
- 控制台噪音会掩盖真实前端错误。

建议：

- 封装 `isTauriRuntime()` 判断。
- 非 Tauri 环境跳过 `listen`，或提供 mock adapter。
- `cmd.invoke` 层也可做统一 fallback，给页面展示“需在 Tauri 内运行”的友好状态。

## 前端显示与交互问题

- 窄宽视口下 TopBar、统计卡片和按钮文字出现挤压竖排，建议给主内容区、TopBar 控件设置最小宽度、换行策略或响应式隐藏次要信息。
- `Sidebar` 底部“小窗模式”按钮没有 `onClick`，属于未接通功能。
- `SeasonPage`、`DataRecordsPage`、`AlertsPage` 有实现但当前路由不可达，需决定是恢复入口还是删除。
- `DealsPage` 存在“生成测试数据”按钮和 `alert()`，生产版建议隐藏到开发开关后，或改成正式空状态引导。
- `ItemsPage`、`ItemPriceTrendModal`、`SearchBar`、`AIAnalysisPage` 有多处 `console.log` 调试输出，建议生产前清理。
- `useTauriEvents` 在 React StrictMode 下会重复触发错误日志，修 runtime guard 后也要确认 unlisten 时机。

## 后端与数据模型问题

- `seed_seasons` 会启动时执行 `seed_test_data_for_all_seasons`，生产工具不应自动写入测试/模拟历史数据。
- `seed_test_data_for_ss11`、`seed_test_data_for_ss12` 未使用，且包含清空实时表逻辑，建议移到 dev-only 工具或删除。
- `TableResolver::supported_combinations()` 只支持 ss11/ss12，新赛季初始化后很多通用查询不会自动覆盖新赛季。
- `calculate_season_day` 多处硬编码 ss11/ss12 开始日期，应改为从 `seasons.started_at` 读取。
- `get_db_stats` 和 dashboard 的 `db_record_count` 仍是 TODO/0。
- `insert_item_price_snapshots` 和 `insert_item_snapshot` 没有写入 `name`、`item_type`、`season_day`，但后续分析和搜索又依赖这些字段。
- `list_seasons` 对 item/fire count 使用共享实时表，会导致每个赛季的统计数相似或错误。

## 独立 server 问题

- `web-server/` 是一个独立 Axum mock server，数据全部内存生成，和 Tauri server bin 不是同一套实现，需要明确它的定位。
- `src-tauri/src/bin/server.rs` 用手写 TCP HTTP parser，稳定性和安全性不如 Axum/Hyper，建议合并到 Axum 实现。
- server API 没有 CORS OPTIONS 处理细节、URL decode、完整 body 读取保障。
- server 侧 `get_season_start` 注释和实际 timestamp 不一致，需要校正。

## 仓库卫生与冗余

当前 `.gitignore` 只有：

```gitignore
node_modules/
src-tauri/target/
dist/
*.log
.DS_Store
```

建议补充：

```gitignore
dist-react/
dev_data/
web-server/target/
*.tsbuildinfo
*.db
*.sqlite
*.sqlite3
```

需要确认后再执行清理：

- `dist-react/` 当前已被 git 跟踪，每次构建都会产生 hash 文件删除/新增。
- `src/package.json`、`src/package-lock.json`、`src/node_modules/` 像是旧嵌套前端项目，和根目录 npm 项目重复。
- `web-server/target` 约 724M，`src/node_modules` 约 294M，`dev_data` 约 144M，`src-tauri/target` 约 23G。
- 根目录 `test_price_compare.rs` 是临时测试文件形态，建议迁到正式 Rust test 或删除。

## 建议修复顺序

1. 保存 `SchedulerHandle`，修复后台任务生命周期。
2. 统一历史数据模型：实时表只放当前最新，历史分析全部读 snapshot 表。
3. 修复 DataMonitor 与 server API 的路由和字段契约。
4. 修复归档/新赛季初始化 schema，补集成测试。
5. 完整执行 v5-v8 迁移，修 v8 SQL。
6. 修复物品搜索分页、类型筛选、day filter。
7. 给 Tauri API 增加 runtime guard，让 Vite 浏览器调试无错误。
8. 清理 debug 日志、测试按钮、不可达页面和仓库产物。

## 业务改进建议

- 建立“数据源诊断中心”：按数据源显示最近成功/失败、耗时、记录数、错误详情，减少用户只看到“没有数据”的困惑。
- 历史对比应以“赛季第 N 天 + 小时”对齐，支持当前赛季和任意历史赛季横向比较。
- 物品数据页可增加“数据可信度”：最新采集时间、数据源、是否来自实时表或快照。
- 捡漏出货功能应基于用户关注列表和阈值，不建议默认暴露“生成测试数据”。
- 新赛季流程建议做成向导：归档当前赛季、确认 API 参数、初始化表、执行首次采集、验证数据。
- AI 分析建议只读结构化摘要数据，避免直接依赖大量 UI 状态或日志。

## 可交付检查清单

- [ ] 后台任务启动后 2 分钟仍在运行。
- [ ] 火价定时抓取会写入实时表和快照表。
- [ ] 物品刷新会更新实时表，并能按类型/名称分页搜索。
- [ ] 小时快照包含 `item_id/name/item_type/fire_price/season_day/scraped_at`。
- [ ] ss12 vs ss11 火价对比按赛季天对齐。
- [ ] 数据监控同步 24h/7d/整赛季均可成功。
- [ ] 归档当前赛季可生成可查询 archive DB。
- [ ] 初始化新赛季后列表、设置、采集、分析都能识别新赛季。
- [ ] 普通浏览器打开 Vite 页面无 Tauri runtime 控制台错误。
- [ ] `npm run build` 能完成最终 bundle，或明确只构建 app 不打 dmg 的命令。
