# TL Monitor - 项目概览

## 项目简介

TL Monitor 是一个用于监控火炬之光游戏火价的工具，支持客户端和服务器两种运行模式。

- **客户端**: Tauri 桌面应用，提供图形界面
- **服务器**: Docker 部署的数据采集服务器，支持定时采集和数据存储

## 项目结构

```
TL-item-monitor-Tauri/
├── src/                          # 前端 (React + TypeScript)
│   ├── main.tsx                  # React 入口
│   ├── app/App.tsx               # 主应用组件
│   ├── components/               # UI 组件
│   │   ├── dashboard/            # 页面组件 (Dashboard, Strategies, Items...)
│   │   ├── layout/               # 布局组件 (Sidebar, TopBar)
│   │   └── ui/                  # 通用 UI 组件
│   ├── hooks/                    # React Hooks
│   ├── lib/                      # 工具函数和命令封装
│   └── contexts/                 # React Context
│
├── src-tauri/                    # 后端 (Rust)
│   ├── src/
│   │   ├── lib.rs               # 库入口，导出所有模块
│   │   ├── bin/server.rs        # 服务器二进制入口
│   │   ├── main.rs             # Tauri 应用入口
│   │   ├── app.rs              # 客户端应用初始化
│   │   ├── commands/           # Tauri 命令 (桥接前后端)
│   │   ├── core/               # 核心模块 (config, paths, state...)
│   │   ├── db/                 # 数据库操作 (repos, models)
│   │   ├── scheduler/          # 定时任务 (fire, items, alerts...)
│   │   ├── scraper/            # 数据采集 (luosi, qiandao)
│   │   ├── server/             # HTTP 服务器 (config, db, scraper)
│   │   └── services/           # 业务服务
│   ├── resources/               # 资源文件 (qiandao_fire 脚本)
│   └── tauri.conf.json         # Tauri 配置
│
└── server-docker/                # Docker 部署配置
    ├── Dockerfile               # 多阶段构建镜像
    ├── docker-compose.yml       # Docker Compose 配置
    ├── config/
    │   └── server_config.yaml  # 服务器配置
    └── resources/
        └── qiandao_fire        # 火价采集脚本
```

## 技术栈

| 层级   | 技术                 | 说明        |
| ---- | ------------------ | --------- |
| 前端   | React + TypeScript | 用户界面      |
| 前端框架 | Vite               | 构建工具      |
| 桌面框架 | Tauri              | 跨平台桌面应用   |
| 后端   | Rust               | 核心逻辑和数据采集 |
| 数据库  | SQLite             | 本地数据存储    |
| 部署   | Docker             | 服务器容器化    |

## 运行模式

### 客户端模式

Tauri 桌面应用，直接在本地运行：

```bash
# 开发模式
npm run dev

# 构建桌面应用
npm run build
```

### 服务器模式

Docker 容器部署，定时采集数据：

```bash
# 启动服务
cd server-docker
docker compose up -d

# 查看日志
docker compose logs -f
```

## 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                         客户端                                │
│  ┌─────────┐    ┌──────────┐    ┌─────────────────────────┐ │
│  │  React  │───▶│ Commands │───▶│  Rust Core (lib.rs)     │ │
│  │   UI    │◀───│ (invoke) │◀───│  - db/ (数据库操作)      │ │
│  └─────────┘    └──────────┘    │  - scraper/ (数据采集)   │ │
│                                  │  - scheduler/ (定时任务) │ │
│                                  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                                     │
         │ WebSocket/HTTP                      │
         ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│   客户端用户界面  │                  │   服务器 (NAS)   │
│                 │                  │                 │
│   - 实时火价    │◀─────────────────│   - HTTP API    │
│   - 物品价格    │   HTTP 轮询/推送  │   - 定时采集     │
│   - 策略管理    │                  │   - 数据存储     │
└─────────────────┘                  └─────────────────┘
```

## 数据库结构

| 表类型  | 用途     | 表名示例                               |
| ---- | ------ | ---------------------------------- |
| 火价   | 实时火价   | `fire_price_normal`                |
| 物品   | 实时物品价格 | `items_normal`                     |
| 火价快照 | 历史火价   | `fire_price_snapshots_ss12_normal` |
| 物品快照 | 历史物品价格 | `item_snapshots_ss12_normal`       |
| 赛季   | 赛季信息   | `seasons`                          |

## API 接口

### 公开接口

| 接口                   | 说明    |
| -------------------- | ----- |
| `GET /status`        | 服务器状态 |
| `GET /fire-history`  | 火价历史  |
| `GET /items-history` | 物品历史  |
| `GET /health`        | 健康检查  |

### 管理接口 (需要密码)

| 接口                              | 说明        |
| ------------------------------- | --------- |
| `POST /admin/init-season`       | 初始化新赛季    |
| `POST /admin/archive-season`    | 归档赛季      |
| `POST /admin/update-api-config` | 更新 API 配置 |

***

*文档最后更新：2026-05-10*
