# TL Monitor - 火炬之光物品火价监控系统

## 项目概述

本项目包含两个独立的组件：

| 组件 | 目录 | 说明 |
|------|------|------|
| **桌面客户端** | `src-tauri/` | Tauri 2.0 桌面应用，用于查看和管理火价数据 |
| **独立服务器** | `server-standalone/` | 数据采集服务器，运行在 NAS 或其他服务器上 |

## 组件详情

### 桌面客户端 (src-tauri)

Tauri 2.0 桌面应用，提供图形界面用于：

- 查看火价历史和趋势
- 管理监控的物品
- 设置价格提醒
- 策略管理
- 捡漏出货分析
- 赛季数据对比

**技术栈**: Tauri 2.0 + React + TypeScript + Rust + SQLite

### 独立服务器 (server-standalone)

部署在 NAS 或服务器上的数据采集服务，提供：

- 整点自动采集火价和物品数据
- REST API 管理接口
- WebSocket 实时数据推送
- 管理员认证

**技术栈**: Rust + SQLite + Tokio

**部署文档**: [server-docker/README.md](server-docker/README.md)

## 快速开始

### 桌面客户端

```bash
cd src-tauri
cargo tauri dev
```

### 服务器部署

1. 修改代码并推送到 GitHub
2. GitHub Actions 自动构建 ARM64 版本
3. 下载构建产物并部署到 NAS

详细步骤请参阅 [server-docker/README.md](server-docker/README.md)。

## 项目结构

```
TL-item-monitor-Tauri/
├── src-tauri/              # 桌面客户端（Tauri 应用）
│   ├── src/
│   │   ├── bin/           # 二进制入口
│   │   ├── commands/      # Tauri 命令（前端调用）
│   │   ├── components/   # React 组件
│   │   ├── contexts/      # React 上下文
│   │   ├── core/         # 核心模块
│   │   ├── db/           # 数据库模块
│   │   │   └── migrations/  # 数据库迁移脚本
│   │   ├── lib/          # TypeScript 类型和命令
│   │   ├── scheduler/    # 调度器
│   │   ├── scraper/      # 数据抓取
│   │   └── services/     # 服务模块
│   ├── src/              # Rust 源代码
│   └── Cargo.toml
│
├── server-standalone/     # 独立服务器（已弃用）
│   └── ...
│
└── server-docker/         # Docker 部署配置
    └── ...
```

## 数据库结构

### 数据库文件位置

```
data/tl_monitor.db
```

### 表分类

#### 1️⃣ 物品相关表

| 表名 | 说明 | 状态 |
|------|------|------|
| `items_normal` | 普通市场物品 | ✅ 正常使用 |
| `items_expert` | 专家市场物品 | ✅ 正常使用 |

#### 2️⃣ 火价相关表

| 表名 | 说明 | 状态 |
|------|------|------|
| `fire_price_normal` | 普通市场火价 | ✅ 正常使用 |
| `fire_price_expert` | 专家市场火价 | ✅ 正常使用 |

#### 3️⃣ 实时数据表

| 表名 | 说明 | 状态 |
|------|------|------|
| `item_realtime_prices` | 物品实时价格 | ✅ 正常使用 |

#### 4️⃣ 快照表（按赛季和市场模式）

| 表名 | 说明 | 状态 |
|------|------|------|
| `item_snapshots_ss12_normal` | ss12 普通物品快照 | ✅ 正常使用 |
| `item_snapshots_ss12_expert` | ss12 专家物品快照 | ✅ 正常使用 |
| `item_snapshots_ss11_normal` | ss11 普通物品快照 | ✅ 正常使用 |
| `item_snapshots_ss11_expert` | ss11 专家物品快照 | ✅ 正常使用 |
| `fire_price_snapshots_ss12_normal` | ss12 普通火价快照 | ✅ 正常使用 |
| `fire_price_snapshots_ss12_expert` | ss12 专家火价快照 | ✅ 正常使用 |
| `fire_price_snapshots_ss11_normal` | ss11 普通火价快照 | ✅ 正常使用 |
| `fire_price_snapshots_ss11_expert` | ss11 专家火价快照 | ✅ 正常使用 |

#### 5️⃣ 配置表

| 表名 | 说明 | 状态 |
|------|------|------|
| `seasons` | 赛季信息 | ✅ 正常使用 |
| `season_api_configs` | 赛季 API 配置 | ✅ 正常使用 |
| `app_meta` | 应用元数据 | ✅ 正常使用 |

#### 6️⃣ 策略相关表

| 表名 | 说明 | 状态 |
|------|------|------|
| `strategies` | 策略表 | ✅ 正常使用 |
| `strategy_costs` | 策略成本 | ✅ 正常使用 |
| `strategy_details` | 策略详情 | ✅ 正常使用 |
| `strategy_outputs` | 策略输出 | ✅ 正常使用 |

#### 7️⃣ 警报相关表

| 表名 | 说明 | 状态 |
|------|------|------|
| `alert_rules` | 警报规则 | ✅ 正常使用 |
| `alert_events` | 警报事件 | ✅ 正常使用 |

#### 8️⃣ 分组相关表

| 表名 | 说明 | 状态 |
|------|------|------|
| `sections` | 分组表 | ✅ 正常使用 |
| `section_items` | 分组物品关联 | ✅ 正常使用 |

#### 9️⃣ 其他表

| 表名 | 说明 | 状态 |
|------|------|------|
| `source_diagnostics` | 数据源诊断 | ✅ 正常使用 |
| `_migrations` | 迁移记录 | ✅ 系统表 |

## 版本信息

- **当前版本**: v1.0.0
- **服务器版本**: v3.3

## GitHub Release

https://github.com/maojiaxu8039/TL-item-monitor-Tauri/releases

## License

MIT
