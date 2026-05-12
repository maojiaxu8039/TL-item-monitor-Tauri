# TL Monitor - 火炬之光物品火价监控系统

## 项目概述

TL Monitor 是一个用于监控火炬之光游戏火价和物品价格的综合工具，支持桌面客户端和独立服务器两种部署模式。

| 组件 | 目录 | 说明 |
|------|------|------|
| **桌面客户端** | `src-tauri/` | Tauri 2.0 桌面应用，提供完整的图形界面 |
| **独立服务器** | `server-standalone/` | 轻量级 HTTP 数据采集服务器，适合 NAS/服务器部署 |

## 核心功能

- **火价监控**: 实时显示当前火价，支持历史走势分析和赛季对比
- **物品价格**: 搜索、筛选、对比物品价格，支持历史趋势查看
- **捡漏出货**: 实时监控物品价格变化，自动检测涨跌机会
- **策略分析**: 创建打宝策略，计算成本和收益
- **价格预警**: 设置价格阈值，触发系统通知
- **数据同步**: 客户端与服务器之间的数据同步
- **AI 分析**: 集成 HERMES Gateway，支持智能分析

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React + TypeScript | 19.x / 5.x |
| 构建工具 | Vite | 6.x |
| UI 框架 | Tailwind CSS | 3.x |
| 状态管理 | TanStack Query | 5.x |
| 桌面框架 | Tauri | 2.x |
| 后端 | Rust | 1.79+ |
| 数据库 | SQLite | 3.x |
| 图表 | Recharts | 2.x |

## 快速开始

### 环境要求

- Node.js 18+
- Rust 1.79+
- macOS / Linux / Windows

### 桌面客户端

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 构建生产版本
npm run build
```

### 独立服务器

```bash
cd server-standalone

# 开发模式
cargo run

# 生产构建
cargo build --release

# 运行
./target/release/tl-server-standalone
```

## 项目结构

```
TL-item-monitor-Tauri/
├── src/                          # 前端源码 (React + TypeScript)
│   ├── components/
│   │   ├── dashboard/            # 页面组件
│   │   ├── layout/               # 布局组件
│   │   └── ui/                   # 通用 UI 组件
│   ├── hooks/                    # React Hooks
│   ├── lib/                      # 工具函数和命令封装
│   └── contexts/                 # React Context
│
├── src-tauri/                    # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── commands/             # Tauri 命令
│   │   ├── db/                   # 数据库操作和迁移
│   │   ├── scheduler/            # 定时任务
│   │   ├── scraper/              # 数据采集
│   │   ├── services/             # 业务服务
│   │   └── core/                 # 核心模块
│   └── resources/                # 资源文件
│
├── server-standalone/            # 独立服务器
│   └── src/
│       └── main.rs               # HTTP 服务器入口
│
├── server-docker/                # Docker 配置 (已弃用)
│   └── Dockerfile                # 说明：请使用 server-standalone
│
└── docs/                         # 项目文档
    ├── DEVELOPMENT_GUIDE.md      # 开发指南
    └── RELEASE_READINESS_OPTIMIZATION_REPORT.md  # 发布检查报告
```

## 数据库结构

### 核心表

| 表名 | 说明 |
|------|------|
| `items_normal` / `items_expert` | 实时物品价格 |
| `fire_price_normal` / `fire_price_expert` | 实时火价 |
| `item_snapshots_{season}_{mode}` | 物品历史快照 |
| `fire_price_snapshots_{season}_{mode}` | 火价历史快照 |
| `item_realtime_prices` | 近3小时实时价格变化 |
| `sections` / `section_items` | 分组管理 |
| `strategies` / `strategy_costs` / `strategy_outputs` | 策略分析 |
| `alert_rules` / `alert_events` | 价格预警 |
| `seasons` | 赛季信息 |

## 安全注意事项

### 配置管理

- **管理员密码**: 部署前必须通过环境变量 `TL_ADMIN_PASSWORD` 设置，不要使用默认密码
- **配置文件**: 生产环境使用 `server_config.example.yaml` 作为模板

### 权限控制

- Tauri 应用已收紧文件系统权限，只允许访问应用数据目录和用户选择的文件
- CSP 已移除 `unsafe-eval`，仅保留必要的 `unsafe-inline` 用于样式

### 数据采集

- 采集模块使用 `danger_accept_invalid_certs(true)` 以兼容第三方 API，已在代码中明确标注风险
- 建议生产环境使用反向代理和 HTTPS

## 发布检查清单

在发布前请确保：

1. ✅ `npm run typecheck` 通过
2. ✅ `npm run lint` 通过（无 warning）
3. ✅ `cargo test` 通过（src-tauri 和 server-standalone）
4. ✅ 数据库迁移在空库上测试通过
5. ✅ 管理员密码已修改
6. ✅ 备份恢复功能测试通过
7. ✅ Docker 构建测试通过（如使用）

## 版本信息

- **当前版本**: v1.0.0
- **最后更新**: 2026-05-13

## 许可证

MIT
