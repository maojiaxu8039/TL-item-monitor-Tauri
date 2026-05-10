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
- 赛季数据对比

**技术栈**: Tauri 2.0 + Rust + SQLite

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
│   │   ├── bin/           # 二进制入口（已移除 server）
│   │   ├── commands/      # Tauri 命令
│   │   ├── core/         # 核心模块
│   │   ├── db/           # 数据库模块
│   │   ├── scheduler/    # 调度器
│   │   ├── scraper/      # 数据抓取
│   │   └── services/     # 服务模块
│   └── Cargo.toml
│
├── server-standalone/     # 独立服务器
│   ├── src/
│   │   ├── main.rs       # 服务器入口
│   │   ├── config.rs     # 配置模块
│   │   ├── db.rs         # 数据库模块
│   │   ├── scraper.rs    # 数据抓取
│   │   └── constants.rs # 常量定义
│   ├── Cargo.toml
│   └── Dockerfile
│
└── server-docker/         # 服务器部署配置
    ├── Dockerfile
    ├── Dockerfile.prebuilt
    ├── docker-compose.yml
    └── README.md          # 详细部署文档
```

## 版本信息

- **当前版本**: v1.0.0
- **服务器版本**: v3.3

## GitHub Release

https://github.com/maojiaxu8039/TL-item-monitor-Tauri/releases

## License

MIT