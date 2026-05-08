# 项目复查问题记录 Round 6

日期：2026-05-08  
范围：项目代码、桌面端、独立采集服务器、数据库使用路径复查  
基准：`5daa09b fix: Round5 复查问题修复`

## 本轮结论

上一轮关键修复后，项目整体构建和静态检查通过，策略管理加载卡住与千岛 sidecar 路径错误已不再是当前主要风险。本轮剩余问题集中在赛季初始化口径、数据同步范围语义、独立服务器归档状态，以及策略聚合错误可观测性。

## Review Findings

| 优先级 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P2 | `src-tauri/src/commands/season.rs:153-179` | 新赛季开服时间仍可留空。桌面端已经加了开服时间输入，但 UI 文案仍允许留空，后端也会在缺省时写入当前时间；同时 `season_id` 进入动态表名前未先用 `TableResolver::is_supported` 校验。 | 赛季天数、跨赛季对比、历史同步基准可能不准确；动态表名路径仍缺少统一输入边界。 | 桌面端将开服时间改为必填；Tauri 命令拒绝 `started_at <= 0` 或缺省值；创建表前校验 `season_id` 和 `market_mode`。 |
| P2 | `src/components/dashboard/DataMonitorPage.tsx:225-268` | 分页同步和时间范围语义不一致。火价非整赛季范围会请求 `/fire-history?limit=500&offset=...`，但服务端把 `limit` 当小时数且不支持 `offset`；物品分页始终请求 `/items-history-all`，忽略 `24h/3d/7d/30d`。 | 用户选择短范围时可能同步超出范围的数据；火价短范围分页可能重复请求或语义错位。 | 分页同步仅允许“整赛季”，或服务端统一支持 `range/start/end + limit + offset`，并让火价和物品路径口径一致。 |
| P2 | `src-tauri/src/server/admin.html:640-657` | 管理页导出范围仍按当前赛季计算。最终数据请求带了 `season` 参数，但前面的 `/season-start` 没有带所选赛季；物品导出还把按天范围换算后的 `limit` 当行数使用。 | 导出历史赛季短范围数据时，cutoff 可能按当前赛季计算；物品导出范围选择与实际导出行数不匹配。 | `/season-start` 请求附带所选 `season`；物品历史接口增加按时间范围过滤，或 UI 对物品导出禁用短范围选择并明确说明。 |
| P2 | `src-tauri/src/server/db.rs:558-582` | 归档后赛季记录和快照表状态不一致。`archive_season` 删除 4 张快照表，但只在 `started_at = 0` 时删除 `seasons` 记录。 | 正常赛季归档后仍会出现在 `/seasons` 列表里，后续导出/统计可能选到一个表已经不存在的赛季。 | 归档时明确标记 `ended_at` 并在列表/导出中隐藏或只读，或删除赛季记录；避免保留“记录存在但表已删除”的状态。 |
| P3 | `src-tauri/src/db/repo_strategy_detail.rs:388-392` | 策略聚合会静默吞掉单个策略错误。`get_all_strategies_with_costs` 遇到某个策略查询错误时直接 `continue`。 | 页面会少显示策略但没有错误提示，排查数据异常困难。 | 至少记录 `warn`，并考虑向前端返回部分失败信息；若策略核心数据损坏，应展示降级状态而不是静默隐藏。 |

## 验证记录

- `npm run typecheck`：通过
- `npm run vite:build`：通过
- `cd src-tauri && cargo fmt -- --check`：通过
- `cd src-tauri && cargo check --all-targets`：通过
- `cd src-tauri && cargo test`：通过，33 passed，1 ignored
- `cd src-tauri && cargo clippy --all-targets -- -D warnings`：通过
- `cd web-server && cargo fmt -- --check && cargo check`：通过
- `git diff --check`：通过

## 数据库只读检查摘要

- `dev_data/tl_monitor.db`：`PRAGMA integrity_check` 返回 `ok`。
- `dev_data/tl_monitor.db`：`strategy_details = 4`、`strategy_costs = 5`、`strategy_outputs = 5`。
- `dev_data/tl_monitor.db`：`item_snapshots_ss12_normal = 458286`，未发现 `(item_id, scraped_at)` 重复键。
- `dev_data/tl_monitor.db`：`ss10.started_at` 为空，仍建议补齐。
- `dev_data/tl_monitor.db`：`items_normal` 中 `price <= 0` 有 933 条，建议建模为“无价/未上架”，分析和预警默认过滤。
- `data/tl_monitor.db`：integrity ok，但 schema 明显旧于当前开发库，仅包含快照表和旧版 `seasons` 字段，建议迁移或明确废弃，避免误用。

## 建议修复顺序

1. 强制桌面端新赛季初始化必须传入有效 `started_at`，并校验 `season_id`。
2. 收敛数据同步范围语义：分页同步只做整赛季，或补齐服务端范围分页。
3. 修正独立管理页导出：所选赛季贯穿 `/season-start` 和数据查询。
4. 统一归档语义：归档后赛季是隐藏、只读还是删除，必须和表状态一致。
5. 给策略聚合错误增加日志和前端可见的部分失败提示。
