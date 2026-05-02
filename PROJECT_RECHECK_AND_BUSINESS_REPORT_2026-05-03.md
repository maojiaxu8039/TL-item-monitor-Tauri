# TL Item Monitor Tauri 复查与业务逻辑分析报告

检查时间：2026-05-03  
检查对象：当前工作区最新代码  
范围：前端 React/Vite、Tauri 命令契约、Rust 后端、SQLite 数据模型、后台任务、独立采集 server、业务模块逻辑。

## 1. 复查结论

这轮修改后，项目状态比上一轮明显好：前端类型检查已通过，Tauri invoke 注册缺口已补齐，`get_deal_alerts` 已有后端命令，`item_history` 写错表问题已修到 `item_price_snapshots`，拆表迁移残留也被删除。整体已经从“类型契约断裂”推进到了“可编译、可打包、但部分业务逻辑仍未闭环”的阶段。

当前最关键的剩余问题是：

- 捡漏出货模块现在返回模拟涨跌，不是真实历史对比。
- 火价仍未真正按普通/专家服抓取和查询隔离。
- `deal` 配置前端有类型，Rust `AppConfig` 没有字段，保存后不会真正持久化到 YAML。
- 数据监控页仍请求 server 未实现的 `/fire-history-all`，且生产 CSP 会阻止 localhost server 与 AI API fetch。
- ESLint 仍失败，代码质量门禁还没收敛。

## 2. 验证结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 上轮 3 个 TS 错误已修复 |
| `cargo check` | 通过 | 仍有 9 个 lib warning、1 个 server warning |
| `cargo test` | 通过 | 8 个单测全部通过，但仍只覆盖 `worth_service` |
| `npm run vite:build` | 通过 | 前端生产资源可打包 |
| `cd src && npm run lint` | 失败 | 56 errors、5 warnings，主要是未使用变量、`any`、React hooks/purity |
| invoke/handler 静态对照 | 通过 | 前端 57 个 invoke 均能在 Tauri handler 中找到；后端 `get_items_stats`、`reload_items` 当前未被前端调用 |

注意：`vite:build` 会刷新 `dist-react` 下 hash 文件，当前工作区因此有构建产物增删。

## 3. 已修复或明显改善的点

### 3.1 命令注册缺口已修复

`get_deal_alerts` 已加入 `src-tauri/src/commands/deals.rs`，并在 `commands/mod.rs` 与 `main.rs generate_handler!` 中注册。前端 `cmd.getDealAlerts()` 不再是“命令不存在”。

### 3.2 新库 season 外键风险得到缓解

`app.rs` 新增 `seed_seasons()`，会插入 `ss12`、`ss11`、`ss10`。这能避免新安装数据库启用外键后直接写 `items/fire_price_records/item_price_snapshots` 失败。

### 3.3 Tauri build 前端门禁增强

`tauri.conf.json` 增加了：

```json
"beforeBuildCommand": "npm run typecheck && npm run vite:build"
```

这能避免类型错误版本被 Tauri 直接打包。

### 3.4 历史同步写表已修正

`repo_history::insert_item_snapshot` 已从不存在的 `item_history` 改为写入 `item_price_snapshots`，数据监控页同步物品历史至少不会再因表名不存在失败。

### 3.5 split table 残留减少

桌面 app 侧删除了 `repo_split.rs` 和 `002_split_tables.sql`，单表模型方向更清晰。

## 4. 剩余高优先级问题

### P0-1. 火价普通/专家服仍未隔离

当前 `scraper::scrape_fire_price()` 仍固定调用普通模式。`refresh_fire_price` 和后台 `fire_task` 都没有根据 `active_context.market_mode` 调用 `scrape_by_mode("普通"/"专家")`。同时 `repo_fire::get_latest_fire()` 和 `repo_fire::get_fire_history()` 没有按 `season_id + market_mode` 过滤。

影响：

- 切到专家服后，火价可能仍显示普通服数据。
- 火价历史、AI 上下文、Dashboard 当前火价会混合不同赛季/模式。
- 火价分析页面虽然部分使用 `repo_history` 过滤，但基础 fire repo 仍是全局读。

建议：

- 把 `scrape_fire_price()` 改为接受 `market_mode`，或在命令层调用 `scrape_by_mode`。
- `repo_fire::get_latest_fire(pool, season_id, market_mode)`。
- `repo_fire::get_fire_history(pool, season_id, market_mode, hours)`。
- `AppState.fire_price` 最好改成按 context 缓存，或每次 Dashboard summary 从 DB 查询当前 context 最新火价。

### P0-2. 捡漏出货模块目前是模拟业务

`commands/deals.rs` 的 `generate_mock_alerts()` 基于列表前 20 个物品按 `i % 5` 伪造涨跌百分比，不读取历史快照，也不根据真实价格变化计算。

影响：

- 页面可以展示，但业务结论不可信。
- 用户看到的“捡漏/出货”不是实际行情。
- 前端阈值设置只是过滤模拟结果。

建议：

- 以 `item_price_snapshots` 为基准，计算当前价与 N 小时前、上一次快照、24h 均价、历史分位数的差异。
- 返回字段补齐 `change_amount`、`direction`，与 TS `DealAlert` 保持一致。
- 查询必须按当前 `season_id + market_mode`。
- 支持用户选择对比窗口：1h、6h、24h、7d。

### P0-3. `deal` 配置前后端模型仍不一致

前端 `AppConfig` 有 `deal` 字段，`SettingsPage` 保存时也构造了 `deal`；但 Rust `AppConfig` 没有 `deal`。Tauri 反序列化时多余字段会被忽略，`save_config` 写出的 YAML 不会持久化 `deal`。

影响：

- `DealsPage` 里 `cfg.deal` 运行时通常是 `undefined`，只能使用默认值。
- 用户在捡漏出货页保存阈值后，重启应用大概率丢失。
- TypeScript 通过了，但运行时结构仍不匹配。

建议：

- Rust `AppConfig` 增加 `deal: DealSettings`，并实现默认值。
- 或把 deal 设置明确改为 `localStorage`，不要伪装成后端配置。
- 长期建议用 Rust schema 生成 TS 类型，避免再次漂移。

### P0-4. DataMonitor 与 server API 仍不完全匹配

前端全赛季火价请求 `/fire-history-all`，server 没有该路由。`items-history-all` 前端传 `season_id` 和 `market_mode`，server 当前只读取 `mode` 与 `limit`。此外 server 手写 HTTP query 解析仍较脆弱。

影响：

- 数据监控页“火价全赛季同步”不可用。
- 物品全量同步可能读取默认 season/config，而不是 UI 当前 season。
- 生产环境还会被 `connect-src 'self'` CSP 拦截 localhost server 请求。

建议：

- 补齐 `/fire-history-all`，或前端统一使用 `/fire-history?limit=99999`。
- server 支持 `season_id`、`market_mode` 参数。
- 使用 axum/warp 这类 HTTP 框架替代手写解析。
- Tauri 生产环境将外部/本地请求改走 Rust command 代理，或明确放开 CSP。

### P1-1. 告警规则系统仍未和后台任务打通

`AlertsPage` 仍未挂到侧边栏和 App 路由。后台 `alert_task` 只检查“当前价 < 购买价”，不读取 `alert_rules`，不写 `alert_events`，不更新 `last_triggered_at`，也没有 cooldown/quiet hours。

影响：

- 创建的告警规则不会生效。
- 最近预警记录不会自然产生。
- 后台每分钟可能重复通知同一批物品。

建议：

- 如果保留规则系统：后台按 `alert_rules` 触发，写 `alert_events`，更新 `last_triggered_at`。
- 如果只保留“值得买提醒”：删除 AlertsPage 和规则表相关 UI，避免产品语义混乱。

### P1-2. 设置保存会覆盖部分用户配置

`SettingsPage` 保存时重新构造整个 `AppConfig`，并硬编码桌面设置、语言、`fire_price_mode`、语音文件绝对路径等。它没有基于 `getConfig()` 的原值做 patch。

影响：

- 未来新增字段容易被设置页保存动作清掉。
- 语音路径写死到当前机器目录，不适合分发。

建议：

- 设置页保存时先读取当前 config，再只 patch 用户修改过的字段。
- 语音路径使用 bundled resource 或用户选择路径。

### P1-3. `reload_items` 与启动加载仍硬编码普通服

`refresh_items` 已按 active context 抓取，但 `reload_items` 和启动 auto-import 仍固定 `"season_normal"`。

影响：

- 专家服下部分刷新入口仍可能写入普通服数据。
- 启动阶段只加载普通服，专家服首次切换后需要额外刷新。

建议：

- 所有入口统一读取 `state.active_context` 或配置中的当前 mode。
- 启动时按配置加载当前 mode，或普通/专家都预加载。

### P1-4. CSV 导入文案与解析不一致

后端导入实际解析：

```text
section_id,season_id,market_mode,item_id,purchase_fire_price,count,more_value
```

但前端导入说明仍是另一套字段。后端还只校验 `len >= 3`，缺少 `item_id` 时会默认空字符串。

建议：

- UI 文案与导出 header 保持一致。
- 导入时强校验 header 和必填列。
- 空 `section_id/item_id` 直接返回行错误。

### P1-5. 质量门禁仍不完整

`src` 的 ESLint 仍失败。根目录 `build` 现在会执行 typecheck + vite build，但不会跑 lint，也不会跑 `cargo check/test`。

建议：

- 新增根脚本 `check`: `npm run typecheck && cd src-tauri && cargo check && cargo test`。
- 单独设 `lint`，先把严重规则修掉，再决定哪些 React Compiler 规则是否降级。

## 5. 业务逻辑全景分析

### 5.1 产品定位

这是一个“火炬之光无限”游戏经济监控桌面应用。核心目标是帮助用户围绕“火价”和“物品火价”做交易判断：

- 当前火价是否适合买火或出货。
- 关注物品当前价格是否低于心理购买价。
- 物品价格相较历史赛季/历史快照是否偏高或偏低。
- 是否出现捡漏或出货机会。
- 是否需要系统通知提醒。

### 5.2 核心业务实体

| 实体 | 表/结构 | 业务意义 |
| --- | --- | --- |
| 赛季 | `seasons` | 区分 `ss12/ss11/ss10` 等数据域 |
| 市场模式 | `market_mode` | 区分 `season_normal` 普通服和 `season_expert` 专家服 |
| 当前物品价格 | `items` | 当前赛季/模式下物品最新火价 |
| 火价历史 | `fire_price_records` | RMB 与火的兑换价历史 |
| 物品价格快照 | `item_price_snapshots` | 物品历史价格，用于趋势、对比、捡漏 |
| 分组 | `sections` | 用户关注列表的分组容器 |
| 分组物品 | `section_items` | 用户关注的具体物品、目标买入价、数量、more 值 |
| 策略 | `strategies` | 评估/排序/通知策略，目前业务连接较弱 |
| 告警规则 | `alert_rules` | 用户自定义阈值规则，目前未接入后台执行 |
| 告警事件 | `alert_events` | 告警记录，目前基本不会自动产生 |
| 源诊断 | `source_diagnostics` | 记录 API/本地文件抓取成功失败状态 |
| 应用配置 | YAML `AppConfig` | 抓取、桌面、通知、数据保留、赛季配置 |

### 5.3 启动流程

当前启动链路：

1. `main.rs` 创建 Tokio runtime。
2. Tauri 注册插件和 command handler。
3. `init_app()` 打开 app data 下的 SQLite。
4. 执行 `001_initial.sql`、`002_add_constraints.sql`。
5. `seed_seasons()` 插入基础赛季。
6. 加载 YAML 配置。
7. 从 DB 读取最新火价；没有则尝试抓取普通火价。
8. 如果物品表为空，尝试从 API 或本地 JSON 导入普通服物品。
9. 创建 `AppState`。
10. 启动后台火价抓取、物品刷新、小时快照、价格提醒任务。

业务评价：

- 启动闭环比上一轮完整，外键风险降低。
- 仍偏普通服优先，专家服启动体验不完整。
- 火价内存状态是全局单值，不适合多模式切换。

### 5.4 数据采集逻辑

火价：

- 通过 `qiandao_fire.mjs` Node HTTP/2 脚本优先抓取。
- 失败后回退 Rust `reqwest`。
- Rust fallback 能区分普通/专家，但桌面主流程没有传专家模式。

物品：

- 通过罗四 API：根据 `ss12/ss11` 和普通/专家计算 `season_id`。
- 或从本地 JSON 读取。
- 写入 `items`，主键为 `season_id + market_mode + item_id`。

后台任务：

- 火价任务按配置间隔抓取并 emit `fire-price-updated`。
- 物品任务按配置间隔刷新并 emit `items-updated`。
- 小时快照将内存里的火价和 items 写入历史表。
- 告警任务每分钟检查 section items 是否低于购买价。

业务评价：

- 数据采集架构完整，但上下文隔离不彻底。
- 小时快照依赖内存 cache，若启动时 DB 有 items 但 `items_cache` 是空，快照可能不会记录物品。

### 5.5 监控首页业务逻辑

首页由三部分组成：

- `DashboardStats`：展示当前火价、总投入火、估算 RMB、物品数量等。
- `SearchBar`：搜索当前赛季/模式物品，并加入分组。
- `GroupCard/SortableGroupCard`：显示关注分组和分组内物品。

分组物品核心计算：

- 用户设置 `purchase_fire_price` 作为心理买入价。
- 当前价来自 `items.price`。
- 当前价低于购买价时，可视为值得关注。
- `evaluate_worth` 服务会输出 `Good/Consider/Bad/Unset`。

业务评价：

- 这是当前项目最接近可用闭环的模块。
- 仍需要明确 `more_value` 的计算含义和 UI 命名；现在业务模型里存在，但全局策略使用不足。

### 5.6 火价分析逻辑

火价分析主要有：

- 当前火价与历史赛季对比。
- 24h 高低均价。
- 分小时趋势。
- 简单价格水平判断：偏高、偏低、正常。

业务评价：

- `repo_history` 的分析查询已经按 season/mode 过滤，方向正确。
- 但 `get_fire_history`、AI 使用的火价历史仍走未过滤的 `repo_fire`，会污染结论。
- “开服第几天”目前用 epoch day 取模，业务上并不等价于赛季开服天数。

### 5.7 物价分析逻辑

物价数据页和物价分析页依赖：

- `items` 当前价格。
- `item_price_snapshots` 历史价格。
- `get_items_price_compare(historySeason)` 做当前赛季与历史赛季均价比较。
- `get_item_price_insights()` 基于 168h 历史均值给 buy/wait/sell 建议。

业务评价：

- 分析框架已存在。
- 历史样本不足时会大量空结果，需要 UI 明示“需要先同步/采集历史数据”。
- 买卖建议阈值固定为 15%，应移入策略或设置。

### 5.8 捡漏出货逻辑

目标业务应该是：

- 捡漏：当前价格相对近期/历史基准下跌超过阈值。
- 出货：当前价格相对近期/历史基准上涨超过阈值。

当前实现：

- 后端按 item 序号模拟 `-35%/-50%/+25%/+45%`。
- 前端只按阈值过滤模拟结果。

业务评价：

- UI 功能形态已经做好。
- 后端业务逻辑尚未落地，不能作为真实交易建议。

推荐真实算法：

1. 对当前 `items` 每个物品取最新价。
2. 从 `item_price_snapshots` 找对比基准：
   - 最近一次快照。
   - 24h 前最近快照。
   - 7d 均价。
3. 计算：
   - `change_amount = current - baseline`
   - `change_percent = change_amount / baseline * 100`
   - `direction = up/down`
4. 按用户阈值、物品类型、价格区间过滤。
5. 给出置信度：历史样本数、最近更新时间、价格波动标准差。

### 5.9 AI 分析逻辑

当前 AI 分析：

- AI 配置改为 localStorage，避免 Rust config 类型冲突。
- 取最近 24h 火价作为上下文。
- 直接在前端 fetch 用户配置的 API URL。

业务评价：

- 适合快速原型。
- 生产 Tauri CSP 当前 `connect-src 'self'` 会阻止第三方 AI API 和 localhost 模型 API。
- API key 放 localStorage，安全性有限。

建议：

- 通过 Rust command 代理 AI 请求，统一超时和错误处理。
- API key 存储改为系统 keychain/加密存储。
- 上下文不仅包含火价，还应包含用户关注分组、值得买项、历史波动摘要。

### 5.10 数据监控与独立 server

独立 server 的业务角色：

- 长期按小时采集普通服/专家服数据。
- 暴露 HTTP API，让桌面端同步历史数据。
- 弥补桌面应用不常开时的历史数据缺口。

当前状态：

- server 仍使用分表：`fire_history_normal/expert`、`items_history_normal/expert`。
- 桌面端使用单表：`fire_price_records`、`item_price_snapshots`。
- 同步时做模型转换。

业务评价：

- 这个架构合理，但 API 和数据模型边界要进一步标准化。
- 建议 server API 返回明确 `market_mode` 字段，并支持按 `season_id` 查询。
- 未来可以把 server 作为“历史数据源”，桌面只维护用户关注与本地缓存。

### 5.11 导入导出与备份

已有能力：

- 关注列表 CSV 导入导出。
- 火价历史 CSV 导出。
- SQLite 数据库备份和恢复。

业务评价：

- 备份恢复有价值，但恢复直接覆盖 DB 后仍运行当前连接，提示重启是对的。
- CSV 需要格式强校验，否则容易导入脏数据。

## 6. 推荐下一步优化顺序

### 第一步：把“可编译”推进到“核心数据可信”

1. 修复火价普通/专家服隔离。
2. `repo_fire` 所有查询增加 `season_id + market_mode`。
3. 启动和 `reload_items` 去掉固定普通服。
4. `AppState.fire_price` 改为按 context 查询或缓存。

### 第二步：让捡漏出货变成真实业务

1. 删除 mock alerts。
2. 基于 `item_price_snapshots` 计算真实涨跌。
3. DealSettings 加入 Rust config 或改为 localStorage。
4. 返回字段与 TS 完全一致。

### 第三步：打通告警系统

1. 明确 AlertsPage 是否保留。
2. 若保留，把路由挂上。
3. 后台 alert_task 接入 `alert_rules` 和 `alert_events`。
4. 增加 cooldown、quiet hours、防重复通知。

### 第四步：收敛 DataMonitor/server

1. 补齐 `/fire-history-all` 或修改前端 URL。
2. server query 参数支持 `season_id/market_mode`。
3. CSP 放行 localhost 或改用 Rust command 代理。
4. 给 server API 加最小测试。

### 第五步：工程质量收口

1. 合并根目录与 `src/` 的双 package 管理。
2. 修复 ESLint 的未使用变量和 `any`。
3. 根目录新增 `lint/check/test` 统一脚本。
4. 为 DB migration、invoke contract、deal algorithm、fire mode 增加测试。

## 7. 当前发布判断

不建议现在作为正式版本发布。  

可以作为内部测试版使用，前提是测试范围限定为：

- 普通服物品搜索。
- 普通服关注分组。
- 手动刷新物品。
- 基础火价展示。
- 关注物品低于购买价的提醒。

不建议对外承诺：

- 专家服火价准确性。
- 捡漏出货结论。
- AI 分析稳定可用。
- 数据监控全赛季同步。
- 自定义告警规则生效。

完成“火价模式隔离 + 捡漏真实算法 + DataMonitor API 对齐 + lint 基线”后，项目才比较适合进入可发布版本。
