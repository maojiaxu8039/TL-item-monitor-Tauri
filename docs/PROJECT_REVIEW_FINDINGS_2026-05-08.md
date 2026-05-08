# Project Review Findings - 2026-05-08

## 本轮结论

本轮复查重点覆盖数据监控同步、独立采集服务器管理页、动态赛季数据库表、桌面赛季管理和预警规则闭环。

当前构建和主要检查整体可用，但仍有 3 个 P1 和 2 个 P2 问题建议优先处理。P1 主要影响整赛季同步、管理页导出准确性和动态 SQL 安全边界；P2 主要影响新赛季时间口径和预警规则产品一致性。

## Findings

| 优先级 | 位置 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | `src/components/dashboard/DataMonitorPage.tsx:231-266` | 分页同步会重复拉第一页。前端循环追加 `offset`，但服务端 `/fire-history-all` 和 `/items-history-all` 只读取 `limit`，不读取 `offset`。 | 只要接口返回刚好 `PAGE_SIZE` 条，前端就会一直请求同一页，整赛季物品数据同步可能卡死或重复写入。 | 服务端补 `offset` 参数并在 SQL 中使用 `LIMIT ? OFFSET ?`；或前端在服务端支持前禁用分页同步。 |
| P1 | `src-tauri/src/server/admin.html:655-657` | 导出类型和赛季选择未真正生效。代码计算了 `endpoint` 和 `seasonParam`，但实际 `fetch` 固定请求 `/fire-history-all`。 | 选择“物品历史”会导出火价历史；选择历史赛季也会被后端当前赛季口径覆盖。 | 使用计算出的 `endpoint` 发起请求；服务端读取并校验 `season` / `season_id` 查询参数。 |
| P1 | `src-tauri/src/server/db.rs:649-692` | `season_id` 进入动态 SQL 前缺少校验。`season_id` 被拼进动态表名创建语句。 | 管理员入口、归档和查询等路径都依赖动态表名；配置模板默认密码为空时，安全边界更脆弱。 | 统一增加 `validate_season_id`，或复用 `TableResolver::is_supported`，确保只允许 `ss` + 数字等安全格式后再生成表名。 |
| P2 | `src-tauri/src/commands/season.rs:242-250` | 桌面新赛季初始化没有开服时间输入。设置页调用 `init_new_season` 时只传 `season_id` / `season_name`，后端用当前时间作为 `started_at`。 | 赛季天数、跨赛季价格对比和历史同步都会依赖 `started_at`，该路径会生成不准确的新赛季数据。 | 桌面设置页补开服时间输入；命令参数增加 `started_at` 并校验正整数，和独立服务器管理页保持一致。 |
| P2 | `src-tauri/src/scheduler/alert_task.rs:154-166` | 预警页面暴露了尚未实现的规则类型。页面允许创建收益率和跌幅规则，但后台直接返回 `false`；物品价格规则固定查 `season_normal`。 | 用户创建的收益率/跌幅规则永远不会触发；专家服价格规则不会按当前市场模式判断。 | 在 UI 中隐藏未实现规则，或补齐后台实现；规则模型增加或推导 `market_mode`，避免固定普通服。 |

## 建议修复顺序

1. 先修数据监控分页同步：服务端补 `offset`，前端展示真实进度，避免整赛季同步卡死。
2. 修管理页导出：前端使用正确 endpoint，后端支持赛季查询参数。
3. 为所有动态表名入口加赛季 ID 校验，重点覆盖初始化、归档、历史查询和统计查询。
4. 统一桌面端和服务器端的新赛季初始化语义，都要求显式 `started_at`。
5. 收窄预警规则 UI，或补齐收益率、跌幅、专家服规则判断闭环。

## 验证记录

本轮复查时已确认以下命令通过：

- `npm run typecheck`
- `npm run vite:build`
- `cd src-tauri && cargo check --all-targets`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo clippy --all-targets -- -D warnings`
- `cd web-server && cargo check`
- `cd web-server && cargo fmt -- --check`
- `npm audit --audit-level=moderate`
- `git diff --check`

剩余质量项：`cd src-tauri && cargo fmt -- --check` 当前未通过，集中在 `src-tauri/src/scheduler/alert_task.rs` 的换行格式。
