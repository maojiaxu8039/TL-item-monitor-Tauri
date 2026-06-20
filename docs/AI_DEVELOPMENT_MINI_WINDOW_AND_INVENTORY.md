# AI 开发文档：小窗口模式与囤货出货板块

## 1. 目标

在现有 TorchScan 桌面应用基础上新增两个能力：

1. 小窗口模式：可在主窗口和小窗口之间来回切换，小窗口保持置顶，可调透明度，只展示最需要立刻决策的内容。
2. 囤货出货板块：记录物品买入时间、买入价格、数量和成本，结合实时抓取物价自动计算盈亏、保本出货价，并在达到买入或出货条件时提醒。

该文档面向 AI/开发者执行，后续开发应尽量复用现有 Tauri 命令、通知系统、物品实时价格、分组关注、套利比价等模块。

## 2. 当前可复用模块

| 能力 | 现有位置 | 复用方式 |
| --- | --- | --- |
| 主窗口控制 | `src/components/layout/TopBar.tsx` | 新增小窗口切换按钮和透明度入口 |
| Tauri 窗口能力 | `src-tauri/src/main.rs`、Tauri window API | 设置大小、置顶、透明度、窗口状态 |
| 分组与关注物品 | `src/components/dashboard/GroupCard.tsx`、sections 相关命令 | 小窗口展示“关注且值得购买”的物品 |
| 值得购买提醒 | `src-tauri/src/scheduler/alert_task.rs`、`commands/items.rs` | 复用 worth 计算与通知通道 |
| 物品实时价格 | `items_normal` / `items_expert` | 囤货板块用当前价格计算盈亏 |
| 套利比价 | `src/components/dashboard/ArbitragePage.tsx`、arbitrage 命令 | 小窗口展示盈利套利配方 |
| 捡漏出货 | `src/components/dashboard/DealsPage.tsx` | 可复用涨跌机会展示思路，但囤货板块要有持仓记录 |
| 系统通知/语音 | `src-tauri/src/services/notification_service.rs` | 出货提醒复用系统通知和语音提醒 |

## 3. 小窗口模式设计

### 3.1 使用场景

用户在游戏中需要一个轻量浮窗：

- 始终置顶，不被游戏或其他窗口盖住。
- 半透明，避免遮挡游戏画面。
- 只看立即有价值的结果，不展示完整后台页面。
- 可快速返回主窗口配置分组、套利配方、囤货记录。

### 3.2 窗口行为

| 功能 | 要求 |
| --- | --- |
| 切换入口 | 顶部栏新增“小窗”按钮；设置页保留小窗口偏好设置 |
| 切换方式 | 主窗口可切小窗口，小窗口可一键恢复主窗口 |
| 置顶 | 小窗口默认 `always_on_top = true` |
| 透明度 | 支持 40% 到 100%，默认 92%；设置即时生效并持久化 |
| 尺寸 | 默认 420x620，可拖拽调整；最小 340x420 |
| 位置 | 默认靠右上；关闭前保存上次位置 |
| 边框 | 建议保留轻量标题栏或自定义拖拽区域，避免无边框窗口在 Windows 下难以移动 |
| 关闭行为 | 小窗口点击关闭不退出应用，回到托盘或恢复主窗口，遵循现有托盘设置 |

### 3.3 技术实现建议

优先实现为单窗口模式切换：

- 主窗口模式：正常尺寸、正常透明度、非置顶。
- 小窗口模式：调整当前 `main` window 的尺寸、置顶、透明度，并切换前端 route/view 到 `mini`。

后续如需要更稳定的游戏覆盖体验，可升级为双窗口：

- `main`：完整后台窗口。
- `mini`：独立浮窗，专门展示迷你视图。

第一版建议单窗口，因为改动小、状态复用简单、不会引入双窗口通信复杂度。

### 3.4 后端命令建议

新增 `src-tauri/src/commands/window.rs`：

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `set_mini_window_mode` | `enabled: bool` | `OkResponse` | 切换主窗口/小窗口 |
| `set_window_opacity` | `opacity: f64` | `OkResponse` | 设置透明度，范围 0.4-1.0 |
| `get_window_mode_state` | 无 | `WindowModeState` | 返回当前是否小窗、透明度、置顶状态 |
| `save_window_layout` | `mode, x, y, width, height` | `OkResponse` | 保存窗口位置尺寸 |

`WindowModeState`：

```ts
interface WindowModeState {
  mini_mode: boolean;
  opacity: number;
  always_on_top: boolean;
  width: number;
  height: number;
}
```

### 3.5 配置字段

在 `AppConfig` 中新增：

```yaml
window:
  mini_mode_enabled: false
  mini_opacity: 0.92
  mini_always_on_top: true
  mini_width: 420
  mini_height: 620
  mini_x: null
  mini_y: null
```

前端 `commands.ts` 同步补充类型。

### 3.6 小窗口内容

小窗口只显示三类信息：

1. 分组关注里“值得购买”的装备。
2. 套利比例里当前盈利的配方。
3. 囤货出货里达到买入、保本或盈利条件的物品。

建议布局：

```text
┌──────────────────────────┐
│ TorchScan 小窗  92%  □ ↗ │
├──────────────────────────┤
│ [值得买] [套利] [出货]    │
├──────────────────────────┤
│ 值得买列表                │
│ 物品名 当前价 目标价 价差  │
│ [复制名] [标记已买]       │
├──────────────────────────┤
│ 底部：刷新时间 / 数据源状态│
└──────────────────────────┘
```

### 3.7 小窗口快捷操作

| 操作 | 说明 |
| --- | --- |
| 复制物品名 | 一键复制，方便游戏内搜索 |
| 快速购买 | 第一版不直接控制游戏或浏览器，定义为“复制物品名 + 记录准备购买” |
| 标记已买 | 将当前物品快速写入囤货记录，默认买入价为当前抓取价 |
| 打开详情 | 恢复主窗口并定位到对应物品/套利配方 |
| 隐藏已处理 | 本次会话内临时隐藏，避免重复干扰 |

说明：不要实现自动点击游戏或拍卖行购买，存在安全和稳定风险。第一版以辅助决策和快速记录为主。

### 3.8 小窗口数据来源

新增聚合命令：

```ts
getMiniWindowFeed(): Promise<MiniWindowFeed>
```

```ts
interface MiniWindowFeed {
  worth_items: MiniWorthItem[];
  profitable_arbitrage: MiniArbitrageItem[];
  buy_ready_watchlist: MiniInventoryBuyWatch[];
  sell_ready_positions: MiniInventoryPosition[];
  updated_at: number;
}
```

数据规则：

- `worth_items`：来自分组关注物品，复用当前“值得购买”判断。
- `profitable_arbitrage`：调用现有套利计算，只保留 `profit > 0` 或 `profit_ratio > 0` 的配方。
- `buy_ready_watchlist`：来自新增买入监控，当前价低于目标买入价。
- `sell_ready_positions`：来自新增囤货持仓，当前价达到保本价或目标盈利价。

## 4. 囤货出货板块设计

### 4.1 业务目标

记录每一笔囤货买入，并根据实时价格判断：

- 当前卖出是赚还是亏。
- 不亏出货价是多少。
- 想买的物品跌到设定价格时提醒买入。
- 到达不亏价或目标盈利价时提醒。
- 哪些物品可以继续持有，哪些建议出货。

拍卖行手续费固定为 `12.5%`。卖出实收为：

```text
实收 = 卖出单价 * 数量 * (1 - 0.125)
```

保本卖出单价：

```text
保本价 = 买入单价 / (1 - 0.125)
       = 买入单价 / 0.875
```

如果有额外成本，保本价：

```text
保本价 = (买入单价 * 数量 + 额外成本) / 数量 / 0.875
```

当前盈亏：

```text
预估净收入 = 当前价格 * 数量 * 0.875
总成本 = 买入单价 * 数量 + 额外成本
盈亏 = 预估净收入 - 总成本
盈亏率 = 盈亏 / 总成本
```

### 4.2 新页面

侧边栏新增：

```text
囤货出货
```

建议文件：

- `src/components/dashboard/InventoryPage.tsx`
- `src/components/dashboard/inventory/InventoryFormDialog.tsx`
- `src/components/dashboard/inventory/InventoryTable.tsx`
- `src/components/dashboard/inventory/InventorySummary.tsx`

### 4.3 页面结构

顶部指标：

| 指标 | 说明 |
| --- | --- |
| 持仓总成本 | 所有未出货记录成本合计 |
| 当前估值 | 当前价卖出扣手续费后的净收入 |
| 浮动盈亏 | 当前估值 - 总成本 |
| 可出货数量 | 达到保本价或目标盈利价的记录数 |
| 可买入监控 | 当前价低于目标买入价的监控数 |
| 亏损风险 | 当前价低于买入价或低于保本价的记录数 |

持仓列表字段：

| 字段 | 说明 |
| --- | --- |
| 物品名称 | 可搜索选择物品，也可手填 |
| 物品 ID | 绑定实时价格用 |
| 赛季/模式 | 普通服/专家服隔离 |
| 买入时间 | 默认当前时间，可编辑 |
| 买入单价 | 用户录入 |
| 数量 | 用户录入 |
| 额外成本 | 可选，例如手续费、转换成本 |
| 总成本 | 自动计算 |
| 当前价格 | 从实时物价表读取 |
| 保本价 | 自动计算 |
| 目标出货价 | 可手动填写，默认等于保本价 |
| 预计净收入 | 当前价扣 12.5% 后 |
| 盈亏 | 自动计算 |
| 盈亏率 | 自动计算 |
| 状态 | 持有中 / 可保本 / 可盈利 / 已出货 / 已放弃 |
| 操作 | 编辑、标记出货、复制名称、查看价格走势 |

买入监控列表字段：

| 字段 | 说明 |
| --- | --- |
| 物品名称 | 可搜索选择物品，也可手填 |
| 物品 ID | 绑定实时价格用 |
| 当前价格 | 从实时物价表读取 |
| 目标买入价 | 用户设置，当前价低于或等于该价格时提醒 |
| 计划数量 | 可选，用于提醒文案和快速建仓 |
| 距离目标 | `(当前价 - 目标买入价) / 目标买入价` |
| 状态 | 等待降价 / 可买入 / 无价格 / 已关闭 |
| 操作 | 编辑、关闭提醒、复制名称、记录为已买入 |

### 4.4 数据库设计

新增迁移：`019_create_inventory_positions.sql`

```sql
CREATE TABLE IF NOT EXISTS inventory_positions (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  market_mode TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  buy_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  extra_cost REAL NOT NULL DEFAULT 0,
  fee_rate REAL NOT NULL DEFAULT 0.125,
  target_sell_price REAL,
  bought_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'holding',
  sold_price REAL,
  sold_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  alert_enabled INTEGER NOT NULL DEFAULT 1,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_context
ON inventory_positions(season_id, market_mode, status);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_item
ON inventory_positions(item_id, item_name);
```

新增买入监控表：

```sql
CREATE TABLE IF NOT EXISTS inventory_buy_watches (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  market_mode TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT '',
  target_buy_price REAL NOT NULL,
  max_quantity INTEGER,
  note TEXT NOT NULL DEFAULT '',
  alert_enabled INTEGER NOT NULL DEFAULT 1,
  auto_create_position INTEGER NOT NULL DEFAULT 0,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_context
ON inventory_buy_watches(season_id, market_mode, alert_enabled);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_item
ON inventory_buy_watches(item_id, item_name);
```

买入监控规则：

| 字段 | 说明 |
| --- | --- |
| `target_buy_price` | 希望提醒买入的价格，当前价小于等于该价格时触发 |
| `max_quantity` | 计划买入数量，可为空 |
| `alert_enabled` | 是否启用提醒 |
| `auto_create_position` | 第一版默认关闭；开启后仍建议先弹确认，不要自动写入持仓 |
| `last_alert_at` | 上次提醒时间，用于冷却 |

状态枚举：

| 状态 | 含义 |
| --- | --- |
| `holding` | 持有中 |
| `break_even` | 当前价已达到保本 |
| `profitable` | 当前价已达到目标盈利 |
| `sold` | 已出货 |
| `ignored` | 已放弃/忽略 |

注意：`break_even` 和 `profitable` 可以作为计算态，不一定直接落库；落库状态建议仍以 `holding/sold/ignored` 为主，避免实时价格变化导致状态频繁写库。

### 4.5 Rust 数据模型

新增 `src-tauri/src/db/repo_inventory.rs` 和 model：

```rust
pub struct InventoryPosition {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub buy_price: f64,
    pub quantity: i64,
    pub extra_cost: f64,
    pub fee_rate: f64,
    pub target_sell_price: Option<f64>,
    pub bought_at: i64,
    pub status: String,
    pub sold_price: Option<f64>,
    pub sold_at: Option<i64>,
    pub note: String,
    pub alert_enabled: i32,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}
```

返回给前端的视图模型要附带计算字段：

```rust
pub struct InventoryPositionView {
    pub position: InventoryPosition,
    pub current_price: Option<f64>,
    pub break_even_price: f64,
    pub target_sell_price: f64,
    pub total_cost: f64,
    pub estimated_net_value: Option<f64>,
    pub profit: Option<f64>,
    pub profit_ratio: Option<f64>,
    pub sell_signal: String,
}
```

买入监控模型：

```rust
pub struct InventoryBuyWatch {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub target_buy_price: f64,
    pub max_quantity: Option<i64>,
    pub note: String,
    pub alert_enabled: i32,
    pub auto_create_position: i32,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct InventoryBuyWatchView {
    pub watch: InventoryBuyWatch,
    pub current_price: Option<f64>,
    pub discount_to_target: Option<f64>,
    pub buy_signal: String,
}
```

`buy_signal`：

| 值 | 说明 |
| --- | --- |
| `no_price` | 没有当前价 |
| `waiting` | 当前价仍高于目标买入价 |
| `buy_ready` | 当前价小于等于目标买入价，可以考虑买入 |
| `disabled` | 该监控已关闭 |

`sell_signal`：

| 值 | 说明 |
| --- | --- |
| `no_price` | 没有当前价 |
| `loss` | 低于保本 |
| `break_even` | 达到保本 |
| `profitable` | 达到目标盈利 |

### 4.6 Tauri 命令

新增 `src-tauri/src/commands/inventory.rs`：

| 命令 | 说明 |
| --- | --- |
| `list_inventory_positions` | 分页/筛选返回持仓视图 |
| `create_inventory_position` | 新增囤货记录 |
| `update_inventory_position` | 编辑囤货记录 |
| `delete_inventory_position` | 删除记录 |
| `mark_inventory_sold` | 标记已出货，记录卖出价和卖出时间 |
| `mark_inventory_ignored` | 标记忽略 |
| `get_inventory_summary` | 返回总成本、估值、盈亏、可出货数量 |
| `get_sell_ready_positions` | 返回达到保本/盈利条件的持仓 |
| `list_inventory_buy_watches` | 返回买入监控列表 |
| `create_inventory_buy_watch` | 新增低价买入监控 |
| `update_inventory_buy_watch` | 编辑低价买入监控 |
| `delete_inventory_buy_watch` | 删除低价买入监控 |
| `get_buy_ready_watches` | 返回当前价已低于目标买入价的监控 |

前端 `src/lib/commands.ts` 增加对应类型和 invoke。

### 4.7 买入与出货提醒任务

新增后台任务：`src-tauri/src/scheduler/inventory_alert_task.rs`

买入提醒触发条件：

- 买入监控 `alert_enabled = 1`
- 当前价格存在
- 当前价格 <= `target_buy_price`
- 距离上次提醒超过冷却时间，默认 10 分钟

买入提醒文案示例：

```text
低价买入提醒：罗盘
目标买入价 80，当前 76，已低于目标 5.0%
计划数量 3，可考虑买入并记录到囤货
```

出货提醒触发条件：

- `status = holding`
- `alert_enabled = 1`
- 当前价格存在
- 当前价格 >= `target_sell_price`，如果未设置目标价，则使用保本价
- 距离上次提醒超过冷却时间，默认 10 分钟

提醒文案示例：

```text
囤货可出货：罗盘
买入 100 x 5，当前 118，扣 12.5% 手续费后预计盈利 16.25
保本价 114.29，当前已达到出货条件
```

提醒渠道：

- 系统通知
- 语音提醒
- 小窗口“买入/出货”页签红点

### 4.8 快速记录买入

在以下位置增加“记录囤货”入口：

| 位置 | 行为 |
| --- | --- |
| 物价数据页 | 从搜索结果一键带入物品名、ID、当前价 |
| 监控首页分组物品 | 对关注物品一键记录 |
| 小窗口值得买 | 点击“标记已买”快速写入 |
| 套利比价结果 | 对套利成本/产出物品可快速记录买入 |

快速记录默认值：

- 买入价：当前抓取价
- 数量：1
- 买入时间：当前时间
- 手续费：12.5%
- 目标出货价：保本价，可编辑

### 4.9 盈亏判断规则

颜色和标签：

| 条件 | 标签 | 颜色 |
| --- | --- | --- |
| 当前价为空 | 无价格 | 灰色 |
| 当前价 < 买入价 | 深亏 | 红色 |
| 买入价 <= 当前价 < 保本价 | 未保本 | 橙色 |
| 当前价 >= 保本价 且 当前价 < 目标价 | 可保本 | 黄色 |
| 当前价 >= 目标价 | 可盈利 | 绿色 |

如果目标价为空，则目标价等于保本价。

### 4.10 排序建议

默认排序：

1. 可盈利
2. 可保本
3. 未保本但接近保本
4. 深亏
5. 无价格

同级按 `profit_ratio` 从高到低排序。

## 5. 小窗口与囤货联动

小窗口新增四个页签：

| 页签 | 数据 |
| --- | --- |
| 值得买 | 分组关注里当前低于目标价/购买价的物品 |
| 买入 | 囤货买入监控里当前价低于目标买入价的物品 |
| 套利 | 套利比价里盈利的配方 |
| 出货 | 囤货记录里达到保本/盈利的物品 |

每条买入项显示：

```text
物品名
当前价 / 目标买入价 / 低于目标比例
计划数量 / 备注
[复制名] [记录已买] [打开详情]
```

每条出货项显示：

```text
物品名
买入价 / 当前价 / 保本价
数量 / 预计盈利 / 盈亏率
[复制名] [标记已出] [打开详情]
```

## 6. UI 设计要求

### 6.1 主页面

风格保持当前后台工具风格：密集、可扫读、少装饰。

不要做大 hero，不要做说明型首页。进入“囤货出货”后第一屏就是持仓表和关键指标。

### 6.2 小窗口

小窗口应更像游戏辅助浮窗：

- 高信息密度。
- 字号紧凑但可读。
- 使用 tabs 切换内容。
- 操作按钮用图标优先，必要时短文字。
- 不使用大卡片嵌套。
- 半透明背景下文字对比度必须足够。

## 7. 开发步骤建议

### 阶段一：小窗口基础

1. 新增窗口配置字段。
2. 新增窗口命令：切换小窗、设置透明度、保存布局。
3. 前端新增 `MiniWindowPage`。
4. 顶部栏新增小窗切换按钮。
5. 设置页新增透明度 slider。

验收：

- 主窗口和小窗口可来回切换。
- 小窗口始终置顶。
- 透明度 40%-100% 可调。
- 重启后保留透明度和上次小窗尺寸。

### 阶段二：小窗口数据聚合

1. 新增 `getMiniWindowFeed`。
2. 接入值得买列表。
3. 接入买入监控命中列表。
4. 接入盈利套利列表。
5. 小窗口展示刷新时间和数据源状态。

验收：

- 小窗口只展示可行动数据。
- 低于目标买入价的物品会出现在“买入”页签。
- 刷新物价后小窗口自动更新。
- 盈利套利结果和主套利页一致。

### 阶段三：囤货出货数据模型

1. 新增数据库迁移。
2. 新增 `repo_inventory.rs`。
3. 新增 `commands/inventory.rs`。
4. 前端 `commands.ts` 增加类型。

验收：

- 能新增、编辑、删除、标记出货。
- 计算保本价、盈亏、盈亏率正确。
- 普通服/专家服数据隔离。

### 阶段四：囤货出货页面

1. 新增侧边栏入口。
2. 新增 `InventoryPage`。
3. 支持搜索、筛选、排序。
4. 支持从物价页/分组页快速记录买入。

验收：

- 可以完整管理持仓。
- 当前价变动后盈亏自动刷新。
- 可保本/可盈利状态清晰。

### 阶段五：买入/出货提醒与小窗口联动

1. 新增买入和出货提醒后台任务。
2. 复用系统通知和语音提醒。
3. 小窗口买入/出货页签显示红点和数量。
4. 支持从买入提醒一键记录已买入。
5. 支持标记已出货。

验收：

- 当前价低于目标买入价后提醒买入。
- 当前价达到保本价或目标价后提醒。
- 冷却时间生效，不重复刷屏。
- 小窗口和主页面数据一致。

## 8. 关键验收用例

### 8.1 手续费计算

买入价 `100`，数量 `1`，手续费 `12.5%`：

- 保本价 = `100 / 0.875 = 114.29`
- 当前价 `110`：未保本
- 当前价 `115`：可保本，预计盈利 `0.625`
- 当前价 `130`：可盈利，预计盈利 `13.75`

### 8.2 数量和额外成本

买入价 `100`，数量 `5`，额外成本 `20`：

- 总成本 = `520`
- 保本价 = `520 / 5 / 0.875 = 118.86`
- 当前价 `120`：预计净收入 `525`，盈利 `5`

### 8.3 小窗口切换

- 点击小窗按钮后窗口变为 `420x620`、置顶、透明度 92%。
- 调整透明度到 70%，重启后仍为 70%。
- 点击恢复按钮后回到主窗口布局。

### 8.4 买入监控

目标买入价 `80`：

- 当前价 `90`：等待降价，不提醒。
- 当前价 `80`：触发买入提醒。
- 当前价 `76`：触发买入提醒，显示低于目标 `5%`。
- 10 分钟冷却期内价格持续低于目标，不重复提醒。

点击“记录已买”：

- 自动打开新增持仓弹窗。
- 物品、数量、买入价自动带入。
- 用户确认后生成一条 `holding` 持仓记录。

### 8.5 数据隔离

同一个物品在普通服和专家服分别记录持仓：

- 普通服只使用 `items_normal` 当前价格。
- 专家服只使用 `items_expert` 当前价格。
- 切换市场模式时页面默认显示当前模式持仓。

## 9. 风险与边界

| 风险 | 处理 |
| --- | --- |
| 自动购买可能违反游戏或平台规则 | 第一版不做自动点击购买，只提供复制名称和记录 |
| 半透明窗口在部分 Windows 环境表现不一致 | 透明度能力封装在后端命令里，失败时提示并回退 100% |
| 当前价格抓取失败 | 盈亏显示为无价格，不触发提醒 |
| 手续费未来变化 | `fee_rate` 每条记录单独保存，默认 0.125 |
| 重复提醒 | 使用 `last_alert_at` 和冷却时间控制 |
| 价格波动导致频繁状态变化 | 状态以计算视图展示，尽量不频繁写库 |

## 10. 建议默认配置

```yaml
inventory:
  default_fee_rate: 0.125
  buy_alert_enabled: true
  sell_alert_enabled: true
  buy_alert_cooldown_seconds: 600
  sell_alert_cooldown_seconds: 600
  default_target_profit_rate: 0.0

window:
  mini_opacity: 0.92
  mini_always_on_top: true
  mini_width: 420
  mini_height: 620
```

## 11. 第一版不做的内容

- 不自动操作游戏拍卖行。
- 不自动下单购买。
- 不接入 OCR 识别背包或拍卖行截图。
- 不做跨设备同步。
- 不做复杂税费模型，默认只按 12.5% 拍卖手续费。

## 12. 推荐任务拆分

1. `feat(window): add mini window mode and opacity settings`
2. `feat(mini): add mini window feed and compact view`
3. `feat(inventory): add inventory database and commands`
4. `feat(inventory): add inventory page and profit calculation`
5. `feat(inventory): add sell-ready alerts`
6. `feat(inventory): integrate quick add from items/groups/mini window`
