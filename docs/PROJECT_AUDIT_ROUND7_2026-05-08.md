# 项目代码与冗余代码复查 Round 7

日期：2026-05-08

## 复查范围

- 前端页面与组件入口：`src/components`、`src/lib/commands.ts`
- Tauri 命令、数据库仓库与迁移：`src-tauri/src`
- 服务端/Docker 打包边界：`server-docker`
- 冗余代码、未接线组件、旧 API、测试数据入口、构建配置

## 验证结果

- `npm run typecheck`：通过
- `npm run vite:build`：通过
- `cd src-tauri && cargo clippy --all-targets -- -D warnings`：通过
- `cd src-tauri && cargo test`：通过，33 passed，1 ignored
- `git diff --check`：通过
- 额外严格检查：`npx tsc --noEmit --noUnusedLocals --noUnusedParameters` 发现前端仍有少量未使用导入/变量

## Finding 1 [P2] Docker 服务端的 Node 抓取兜底仍可能不可用

位置：

- `src-tauri/src/server/scraper.rs:225-260`
- `server-docker/Dockerfile:18-27`

服务端抓取失败时会回退到 `node resources/qiandao_fire.cjs|mjs`，但当前 Docker 镜像只安装了 `ca-certificates`、`libssl3`、`curl`，没有安装 Node，也没有把 `resources/qiandao_fire.cjs` 复制到 `/app/resources`。如果 Rust 直连抓取失败，Docker 部署环境下兜底路径会继续失败。

建议：

- Docker 镜像中安装 Node，并复制 `src-tauri/resources/qiandao_fire.cjs` 到 `/app/resources`；或
- 服务端复用桌面端已经修过的 sidecar/资源定位逻辑；或
- 去掉服务端 Node fallback，保证 Rust 抓取路径完整可用并覆盖测试。

## Finding 2 [P2] 旧策略 CRUD 栈仍注册在生产命令里

位置：

- `src-tauri/src/main.rs:122-125`
- `src-tauri/src/commands/strategies.rs:8-57`
- `src-tauri/src/db/repo_strategies.rs:5-77`
- `src-tauri/src/db/models.rs:106-120`
- `src/lib/commands.ts:533-539`
- `src-tauri/src/db/migrations/001_initial.sql:104-131`
- `src-tauri/src/db/migrations/009_create_strategy_detail_tables.sql:4-49`

前端策略页实际使用的是新 `strategy_details / strategy_costs / strategy_outputs` 体系，但旧 `strategies` CRUD 命令、旧仓库、旧模型和前端 wrapper 仍存在并注册。`alert_rules.strategy_id` 还外键指向旧 `strategies` 表，说明旧策略表处于“没有 UI 主入口但仍被 schema 牵住”的状态。

建议：

- 明确策略体系只保留新版后，迁移 `alert_rules.strategy_id` 到 `strategy_details.id` 或移除策略外键；
- 删除旧 `commands/strategies.rs`、`repo_strategies.rs`、旧 `Strategy` 模型和 `cmd.getStrategies/createStrategy/updateStrategy/deleteStrategy`；
- 如果旧表是兼容历史数据用，给它补注释和迁移边界，避免后续继续误接旧 API。

## Finding 3 [P3] 有多个前端组件/工具文件已经没有入口

位置：

- `src/components/dashboard/AddItemModal.tsx:12`
- `src/components/charts/FireTrendChart.tsx:65`
- `src/components/dashboard/SkillSelector.tsx:23`
- `src/components/ui/badge.tsx:23`

`rg` 只找到这些组件在自身文件中的定义，没有找到实际 import/渲染入口。它们会增加维护成本，也容易让后续开发误以为相关能力仍在使用。

建议：

- 如果这些是旧 UI 残留，直接删除；
- 如果仍计划使用，把入口接回真实页面；
- `SkillSelector` 若是 AI 页面后续能力，建议先放进待办文档或 feature flag，不要以未接线组件形态留在主代码里。

## Finding 4 [P3] 前端仍有严格 TS 能发现的未使用导入/变量

位置：

- `src/components/dashboard/AlertsPage.tsx:5`
- `src/components/dashboard/AlertsPage.tsx:12`
- `src/components/dashboard/ItemPriceTrendModal.tsx:1`
- `src/components/dashboard/StrategiesPage.tsx:18`
- `src/components/dashboard/StrategiesPage.tsx:20`
- `src/components/dashboard/StrategiesPage.tsx:30`
- `src/components/dashboard/StrategiesPage.tsx:101`
- `src/components/dashboard/StrategiesPage.tsx:471`

当前 `npm run typecheck` 能通过，是因为没有启用 `noUnusedLocals/noUnusedParameters`。严格检查能发现 unused import、unused type、unused state setter、unused `now` 变量。这类问题不影响运行，但会继续积累噪音。

建议：

- 清理当前未使用项；
- 在 `tsconfig` 或单独 CI 脚本里逐步启用 unused 检查；
- 如果暂时不想强制全项目，可以新增 `typecheck:strict-unused` 作为人工复查命令。

## Finding 5 [P3] 价格分析页仍使用随机 Mock 分析

位置：

- `src/components/dashboard/PriceAnalysisPage.tsx:273-326`
- `src/components/dashboard/PriceAnalysisPage.tsx:356-360`

价格分析页的波动、周期、买入/卖出日、置信度等字段来自 `Math.random()`。用户每次刷新可能看到不同结论，且这些结果不是来自历史价格或真实统计。

建议：

- 如果页面是正式功能，改成基于 `item_history` / `fire_history` 的确定性计算；
- 如果只是演示页，在 UI 和代码层明确标记为 demo；
- 至少先把随机结果改成基于 item_id 的稳定伪随机，避免刷新后结论跳变。

## Finding 6 [P3] 测试数据种子命令仍暴露在生产 Tauri handler

位置：

- `src-tauri/src/main.rs:106`
- `src-tauri/src/commands/items.rs:510-516`
- `src/components/dashboard/DealsPage.tsx:213-222`

前端“生成测试数据”按钮只在 `import.meta.env.DEV` 下显示，但后端 `seed_realtime_fire_data` 命令仍注册在生产 handler。只要有前端调用入口或调试环境注入调用，就可能写入测试数据。

建议：

- 给 Rust 命令和 handler 加 `#[cfg(debug_assertions)]`；
- 或在命令内部判断 debug/release，release 直接拒绝；
- 同步移除生产 `cmd.seedRealtimeFireData` 暴露，或只在开发包装对象中提供。

## Finding 7 [P3] 事件模块用 `allow(dead_code)` 掩盖了未使用事件面

位置：

- `src-tauri/src/core/events.rs:1-87`
- `src-tauri/src/scheduler/alert_task.rs:278-292`

`core/events.rs` 整个模块允许 dead code。实际被引用的主要是 `emit_fire_price_updated` 和 `emit_market_context_changed`，而预警任务自己实现了一份本地 `emit_alert_triggered`，没有复用核心事件模块。这会让事件名、payload 和前端监听协议逐渐分叉。

建议：

- 删除未使用事件，或把事件模块变成唯一事件出口；
- 让 `alert_task.rs` 使用 `core/events::emit_alert_triggered`；
- 去掉模块级 `#![allow(dead_code)]`，用编译器帮助发现后续遗留事件。

## 低风险清理项

1. `src/eslint.config.js` 已存在，但 `package.json` 没有 eslint 依赖和 lint 脚本。要么补齐 eslint 工具链，要么删除该配置，避免“看起来有 lint，实际不能跑”。
2. `src/components/dashboard/AlertsPage.tsx` 内 `useEffect` 首次加载和 `loadData` 手动刷新逻辑重复，可以合并成一个 fetch helper。
3. `src/components/dashboard/SkillSelector.tsx` 内初始加载和重试加载逻辑也重复；如果保留该组件，应统一为一个 `loadSkills` 流程。

## 建议处理顺序

1. 先处理 Docker 服务端 Node fallback 和旧策略 CRUD 栈，这两项最容易造成部署或数据模型误用。
2. 删除或接线未使用组件，清理 strict TS unused 报告。
3. 决定价格分析页到底是正式功能还是 demo，再做确定性计算。
4. 收口开发测试命令和事件模块，降低后续维护噪音。
