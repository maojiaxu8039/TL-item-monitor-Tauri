# TorchScan - 火炬之光物品火价监控系统

> 实时监控游戏火价与物品价格，助力交易决策

## 项目概述

TorchScan 是一个用于监控火炬之光游戏火价和物品价格的综合工具，支持桌面客户端和独立服务器两种部署模式。

**核心功能：**

- 📊 **市场监控**：实时显示火价、物品价格，支持历史走势分析
- 🔍 **物品追踪**：搜索、筛选、对比物品价格，支持历史趋势查看
- 📈 **捡漏出货**：实时监控物品价格变化，自动检测涨跌机会
- 💰 **套利比价**：分解、合成、材料兑换全场景比价分析
- ⚙️ **策略管理**：创建打宝策略，计算成本和收益
- 🔔 **价格预警**：设置价格阈值，触发系统通知
- 🤖 **AI 分析**：集成 OpenClaw Gateway，支持智能分析
- 📥 **导入导出**：支持 CSV 导入导出和数据库备份

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React + TypeScript | 19.x / 5.x |
| 构建工具 | Vite | 6.x |
| UI 框架 | Tailwind CSS | 4.x |
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

# 代码检查
npm run lint

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
│   ├── app/
│   │   └── App.tsx               # 主应用组件
│   ├── components/
│   │   ├── dashboard/            # 页面组件
│   │   │   ├── DashboardContent.tsx  # 市场监控
│   │   │   ├── ItemsPage.tsx         # 物品追踪
│   │   │   ├── PriceAnalysisPage.tsx # 价格分析
│   │   │   ├── DealsPage.tsx         # 捡漏出货
│   │   │   ├── AlertsPage.tsx       # 提醒设置
│   │   │   ├── FirePriceComparePage.tsx  # 火价分析
│   │   │   ├── ArbitragePage.tsx     # 套利比价
│   │   │   ├── StrategiesPage.tsx     # 策略管理
│   │   │   ├── AIAnalysisPage.tsx     # AI 分析
│   │   │   ├── DataMonitorPage.tsx   # 数据监控
│   │   │   ├── ImportExportPage.tsx  # 导入导出
│   │   │   ├── SettingsPage.tsx       # 设置
│   │   │   └── HelpPage.tsx          # 帮助
│   │   ├── layout/               # 布局组件
│   │   │   ├── Sidebar.tsx       # 侧边导航
│   │   │   └── TopBar.tsx        # 顶部栏
│   │   ├── ui/                   # 通用 UI 组件
│   │   │   ├── PageShell.tsx     # 页面容器
│   │   │   ├── PageHeader.tsx    # 页面头部
│   │   │   ├── Surface.tsx       # 面板容器
│   │   │   ├── MetricCard.tsx     # 指标卡片
│   │   │   ├── StatusBadge.tsx   # 状态徽章
│   │   │   ├── EmptyState.tsx    # 空状态
│   │   │   ├── LoadingState.tsx  # 加载状态
│   │   │   └── ...
│   │   └── brand/                # 品牌资产
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
├── server-standalone/            # 独立服务器 (可选)
│   └── src/
│       └── main.rs               # HTTP 服务器入口
│
├── server-docker/                # Docker 配置 (已弃用)
│
└── docs/                         # 项目文档
    ├── TORCHSCAN_UI_DESIGN_RULES.md  # UI 设计规范
    ├── DEVELOPMENT_GUIDE.md         # 开发指南
    ├── DATABASE_MIGRATION_GUIDE.md  # 数据库迁移指南
    └── STARTUP_GUIDE.md             # 启动指南
```

## 数据库结构

### 核心表

| 表名 | 说明 |
|------|------|
| `items_normal` / `items_expert` | 实时物品价格 |
| `fire_price_normal` / `fire_price_expert` | 实时火价 |
| `item_snapshots_{season}_{mode}` | 物品历史快照 |
| `fire_price_snapshots_{season}_{mode}` | 火价历史快照 |
| `item_realtime_fire_prices` | 近3小时实时价格变化 |
| `sections` / `section_items` | 分组管理 |
| `strategies` / `strategy_costs` / `strategy_outputs` | 策略分析 |
| `alert_rules` / `alert_events` | 价格预警 |
| `seasons` | 赛季信息 |

## UI 设计

TorchScan 采用"深色熔岩金属风"设计，具体规范请参考 [UI 设计规范](docs/TORCHSCAN_UI_DESIGN_RULES.md)。

### 设计原则

- 深色、克制、专业，保留游戏资产/火焰主题的辨识度
- 信息密度高，适合长时间盯盘和快速扫描
- 金色与火橙只用于品牌、激活态、重点价格和关键操作
- UI 不做大面积装饰卡片，做实用数据工作台

### 语义化颜色

| 场景 | 颜色 |
| --- | --- |
| 价格上涨（盈利） | 红色 (`--color-danger`) |
| 价格下跌（亏损） | 绿色 (`--color-success`) |
| 暴涨标签 | `StatusBadge variant="danger"` |
| 暴跌标签 | `StatusBadge variant="success"` |

## 安全注意事项

### 配置管理

- **管理员密码**：部署前必须通过环境变量 `TL_ADMIN_PASSWORD` 设置，不要使用默认密码
- **配置文件**：生产环境使用 `server_config.example.yaml` 作为模板

### 权限控制

- Tauri 应用已收紧文件系统权限，只允许访问应用数据目录和用户选择的文件
- CSP 已移除 `unsafe-eval`，仅保留必要的 `unsafe-inline` 用于样式

### 数据采集

- 采集模块使用 `danger_accept_invalid_certs(true)` 以兼容第三方 API，已在代码中明确标注风险
- 建议生产环境使用反向代理和 HTTPS

## 开发指南

详细开发文档请参考：

- [开发指南](docs/DEVELOPMENT_GUIDE.md) - 功能清单、技术架构、API 接口
- [UI 设计规范](docs/TORCHSCAN_UI_DESIGN_RULES.md) - 色彩、布局、组件规范
- [数据库迁移指南](docs/DATABASE_MIGRATION_GUIDE.md) - 数据库设计和迁移规范
- [启动指南](docs/STARTUP_GUIDE.md) - 开发环境启动和故障排查

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

- **当前版本**：v1.0.0
- **最后更新**：2026-05-14

## 许可证

MIT