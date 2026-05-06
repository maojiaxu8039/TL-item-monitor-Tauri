# TL Item Monitor Tauri 项目复查报告

生成日期：2026-05-06  
复查范围：前端、Tauri 后端、数据库迁移与表结构、后台任务、业务逻辑、构建与测试、冗余/占位代码

## 1. 总体结论

当前项目整体状态已经明显改善，核心构建链路和测试链路可以跑通：

- 前端 TypeScript 类型检查通过。
- 前端 Vite 构建通过。
- Tauri 后端测试通过。
- 独立 `web-server` 测试通过。
- Tauri 应用构建通过，并成功生成 macOS `.app`。

不过，项目仍存在几类需要继续处理的问题：

- 赛季基础数据存在不一致，会直接影响历史价格对比结果。
- 部分数据库表覆盖范围和业务入口不完全匹配。
- 后台任务调度逻辑仍有响应延迟或首次执行时机问题。
- 数据同步 UI 对部分失败的反馈不够准确。
- `web-server` 与 Tauri 内置 server 的 API 形状不统一，容易造成后续维护混乱。
- 项目中仍存在少量占位功能、mock 分析和开发辅助代码。

建议优先修复会影响业务结果正确性的 P1/P2 问题，再处理体验、清理和维护性问题。

## 2. 验证结果

本次复查执行了以下验证：

```bash
npm run typecheck
npm run vite:build
cd src-tauri && cargo test
cd web-server && cargo test
npm run build
```

结果：

- `npm run typecheck`：通过。
- `npm run vite:build`：通过。
- `src-tauri cargo test`：通过，18 个测试全部成功。
- `web-server cargo test`：通过，目前 0 个测试。
- `npm run build`：通过，成功构建 release binary 和 macOS `.app`。

构建过程中仍有一个 Tauri 警告：

- `src-tauri/tauri.conf.json` 的 identifier 为 `com.tlmonitor.app`，以 `.app` 结尾，Tauri 提醒该后缀可能与 macOS bundle 扩展名混淆。
- 该问题不阻塞当前构建，但如果要修改 identifier，建议放在下一个较大的版本节点处理，因为它可能影响应用身份、本地数据路径和升级兼容性。

## 3. 重点问题清单

### 3.1 [P1] SS11 赛季开始时间不一致，历史对比可能偏移一年

涉及文件：

- `src-tauri/src/core/constants.rs`
- `src-tauri/src/server/db.rs`
- `src-tauri/src/app.rs`
- `src-tauri/src/db/repo_fire.rs`
- `src-tauri/src/db/repo_history.rs`

问题说明：

`constants.rs` 中 `ss11` 的 `start_timestamp` 当前为 `1736985600`，该时间戳对应 `2025-01-16 00:00:00 UTC`。但项目其他位置把 SS11 当作 `2026-01-16` 使用。

例如：

- server fallback 中 `ss11` 使用 `1768521600`。
- debug seed 中使用 `2026-01-16T00:00:00Z`。
- fire repo 测试注释和测试数据也按 `2026-01-16` 处理。

影响：

历史火价和物品价格对比依赖赛季开始时间计算 `season_day`。如果 SS11 时间错一年，跨赛季对比会出现严重偏差，导致价格趋势和同比结论失真。

建议修复：

- 将 `ss11` 常量修正为 `1768521600`。
- seed `seasons` 表时补齐 `started_at`。
- 为已有数据库增加迁移，修正 `ss11`、`ss12`、`ss10` 的空值或错误 `started_at`。
- 历史对比逻辑优先使用数据库 `seasons.started_at`，常量只作为 fallback。

### 3.2 [P1] seed 了 SS10，但表结构保障只覆盖 SS12/SS11

涉及文件：

- `src-tauri/src/app.rs`
- `src-tauri/src/db/table_resolver.rs`
- `src-tauri/src/commands/fire.rs`

问题说明：

应用初始化时会 seed `ss10`，但 `TableResolver::supported_combinations()` 目前只返回 `ss12` 和 `ss11` 的表组合。也就是说，系统存在 `ss10` 这个赛季入口，但初始化阶段不会保证 `ss10` 对应的快照表存在。

影响：

如果前端或配置切换到 `ss10`，后端可能查询不存在的表，例如 `item_snapshots_ss10_normal`，导致功能报错。

建议修复：

可以选择以下方案之一：

1. 如果短期不支持 SS10，则不要 seed `ss10`，并在切换赛季时校验目标赛季是否受支持。
2. 如果需要支持 SS10，则将 `TableResolver`、迁移、快照表创建逻辑扩展到 SS10。
3. 更进一步，可以让表创建逻辑基于 `seasons` 表动态创建，而不是写死赛季列表。

### 3.3 [P2] 火价/物品后台任务在 interval sleep 期间不能及时响应 abort

涉及文件：

- `src-tauri/src/scheduler/fire_task.rs`
- `src-tauri/src/scheduler/items_task.rs`

问题说明：

火价任务和物品任务在完成一次抓取后，会直接 `sleep(interval_secs)`。在这个 sleep 期间，任务不会响应 abort 信号，也不会及时读取新的配置。

影响：

- 应用关闭或重启任务时，后台任务可能最多延迟一个完整周期才退出。
- 用户调整抓取间隔后，配置不会立即生效。
- 如果某个周期较长，会造成后台任务控制体验不稳定。

建议修复：

- 使用 `tokio::select!` 同时等待 interval 和 abort。
- 或使用 `tokio::time::interval` / `interval_at` 管理周期 tick。
- 每次 tick 前重新读取配置，让运行中任务更快感知配置变化。

### 3.4 [P2] 小时快照首次写入时机错误

涉及文件：

- `src-tauri/src/scheduler/history_task.rs`

问题说明：

当前逻辑先等待到下一个整点，然后进入循环；但循环内部又先 sleep 3600 秒，再执行快照写入。这会导致到达整点后没有立即记录，而是再等一小时。

影响：

整点快照会错过第一次预期写入，历史数据可能缺少关键时间点。

建议修复：

- 初始等待到下一个整点后立即执行一次快照。
- 之后再每 3600 秒执行一次。
- 或直接使用 `interval_at(next_hour, Duration::from_secs(3600))`。

### 3.5 [P2] 数据同步前端对部分失败反馈不准确

涉及文件：

- `src/components/dashboard/DataMonitorPage.tsx`

问题说明：

数据同步过程中，单条记录写入失败时只打印 `console.error`，最终成功 toast 主要根据成功数量显示。这样会出现“部分甚至大量失败，但用户看到同步成功”的情况。

影响：

- 用户难以及时发现同步不完整。
- 数据缺口可能被误认为已同步成功。
- 后续分析结果可能基于不完整数据。

建议修复：

- 同步时统计 `success` 和 `failed`。
- 记录首个失败原因或失败样例。
- 如果 `failed > 0`，toast 应显示“部分成功”而不是“成功”。
- 可以在 UI 中增加最近一次同步详情。

### 3.6 [P2] Tauri 内置 server 与独立 web-server API 不统一

涉及文件：

- `src-tauri/src/bin/server.rs`
- `web-server/src/main.rs`
- `src/components/dashboard/DataMonitorPage.tsx`

问题说明：

Tauri 内置 server 与独立 `web-server` 都承担了类似“本地数据服务”的角色，但接口路径和返回结构不一致。

例如：

- Tauri server 使用 `/fire-history`、`/items-history-all` 等接口。
- `web-server` 使用 `/api/dashboard`、`/api/fire/history`、`/api/items` 等接口。

影响：

- 前端接入时容易混淆到底应该调用哪个服务。
- 两套接口会增加维护成本。
- `web-server` 当前更像 mock/demo 服务，但项目结构上没有明确标注。

建议修复：

- 明确唯一权威 API。
- 如果 `web-server` 只是演示或调试工具，建议移动到 `examples/` 或 `tools/`。
- 如果要保留两个 server，应共享 DTO 类型和路由定义，避免结构漂移。

### 3.7 [P3] Dashboard 统计仍存在占位值

涉及文件：

- `src-tauri/src/commands/fire.rs`

问题说明：

`get_dashboard_summary` 中 `db_record_count` 仍然是 `0`，属于占位实现。

影响：

Dashboard 展示的数据记录数不可信，容易误导用户判断当前数据库状态。

建议修复：

- 接入真实的 `repo_items::get_db_record_count`。
- 如果统计较慢，可以缓存或异步加载。

### 3.8 [P3] 火价实时写入使用 INSERT OR IGNORE，重复时间戳会丢弃更新

涉及文件：

- `src-tauri/src/db/repo_fire.rs`

问题说明：

实时火价写入使用 `INSERT OR IGNORE`。如果同一 `scraped_at` 的数据后续被修正，新的值会被静默忽略。

影响：

- 数据修正无法覆盖旧值。
- 如果抓取任务重试生成同一时间戳，最新数据可能不会入库。
- 目前该写入路径也没有补齐 `season_day` 字段。

建议修复：

- 改为 `INSERT ... ON CONFLICT(scraped_at) DO UPDATE`。
- 写入时同步计算并保存 `season_day`。
- 如果存在多服务器、多区服维度，唯一键应考虑 server/region/season 等字段。

### 3.9 [P3] 项目仍存在少量占位、mock 和开发辅助代码

涉及文件：

- `src/components/layout/Sidebar.tsx`
- `src/components/dashboard/PriceAnalysisPage.tsx`
- `src/components/dashboard/DashboardStats.tsx`
- `src-tauri/src/commands/items.rs`
- `src-tauri/src/db/repo_realtime_fire.rs`

问题说明：

当前项目里仍有一些功能入口或代码明显偏开发阶段：

- “小窗模式”按钮没有实际动作。
- 价格分析中仍有 mock 分析逻辑。
- 部分组件仍使用 `any[]`。
- Rust 侧仍保留 seed 测试数据相关命令。

影响：

- 用户可能点击到不可用功能。
- mock 结果可能被误认为真实业务分析。
- 类型约束不足会降低后续改动安全性。
- 测试数据命令如果在生产环境可用，有误操作风险。

建议修复：

- 对未完成入口增加明确 gating，或暂时隐藏。
- mock 分析替换为真实分析，或明确标注为开发功能。
- 收紧前端 DTO 类型，减少 `any`。
- Rust 测试/seed 命令使用 `debug_assertions` 或 feature flag 限制。

## 4. 数据库与迁移检查

当前数据库迁移链路相比之前已经更完整，近期修复点包括：

- 后续迁移改为更幂等的表/字段检查。
- item snapshot 表结构补齐了 `name`、`item_type`、`season_day` 等字段。
- 部分历史快照写入逻辑已经补齐元数据。

仍建议继续加强：

- 为 `seasons.started_at` 增加补齐迁移。
- 对所有支持赛季统一执行表结构 ensure。
- 把“支持哪些赛季”从硬编码逐步迁移到配置或数据库驱动。
- 为关键历史对比查询增加 fixtures 测试，覆盖跨赛季、缺失日期、空历史表等场景。

## 5. 前端检查

当前前端类型检查和构建通过，说明基础工程状态可用。

仍建议优化：

- 数据同步流程需要区分全部成功、部分成功、全部失败。
- 未完成功能入口应隐藏或增加明确状态。
- 对 Dashboard、价格分析、数据同步页面的 DTO 类型继续收紧。
- 普通浏览器环境与 Tauri runtime 环境的差异已经有所处理，但后续新增 invoke/listen 时仍应统一走安全封装。

## 6. 后端检查

当前 Tauri 后端测试通过，且核心构建通过。

仍建议优化：

- 后台任务统一使用可取消的 interval 模式。
- 赛季时间和上下文切换逻辑统一收口，避免多处 fallback 不一致。
- 对实时表和历史表的写入策略统一处理冲突更新。
- 对 seed/mock/test-only 命令做环境隔离。

## 7. 业务逻辑检查

最需要关注的是“赛季日”和“历史对比”的可信度。该项目的核心价值是价格趋势、历史对比和预警，因此以下数据必须一致：

- 当前赛季 ID。
- 赛季开始时间。
- 赛季日计算方式。
- 实时表与历史表的字段含义。
- 前端展示字段与后端 DTO。

如果赛季时间或历史表选择不一致，应用虽然能运行，但展示出来的业务结论会错。

建议新增以下业务测试：

- SS12 当前数据与 SS11 历史数据按相同 season_day 对比。
- 缺少历史赛季数据时返回清晰空态。
- 切换赛季后，火价、物品、预警上下文都同步变化。
- 同步接口返回部分失败时，前端展示正确状态。
- 小时快照任务在整点立即写入。

## 8. 推荐修复优先级

### 第一优先级：业务正确性

1. 修正 SS11 时间常量。
2. 为 `seasons.started_at` 增加补齐迁移。
3. 统一历史对比使用的赛季开始时间来源。
4. 决定是否支持 SS10，并同步修复 seed、表创建、赛季切换校验。

### 第二优先级：后台任务可靠性

1. 重构 fire/items scheduler 的 sleep 模式。
2. 修复 history scheduler 首次整点写入。
3. 增加后台任务相关测试或可观测日志。

### 第三优先级：前端体验与同步可信度

1. 数据同步展示部分失败状态。
2. 未完成功能入口隐藏或标注。
3. 收紧 DTO 类型，减少 `any`。

### 第四优先级：维护性清理

1. 明确 `web-server` 定位。
2. 清理 mock/demo/test-only 代码。
3. 更新历史 review 文档，避免已修问题和当前问题混在一起。
4. 评估是否在下个大版本修改 Tauri identifier。

## 9. 当前风险判断

当前项目可以构建和运行，基础链路没有明显阻塞问题。

但如果直接依赖当前历史对比结果做业务判断，仍有风险。主要原因是 SS11 赛季时间不一致、SS10 表覆盖不完整、小时快照首次写入时机偏差。这些问题不一定会导致应用崩溃，但会影响数据结论可信度。

建议在继续扩展功能之前，先完成赛季时间与历史对比链路的修复。
