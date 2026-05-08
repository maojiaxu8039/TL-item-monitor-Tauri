# TL Monitor Mock Server

> ⚠️ **警告**: 此服务仅用于开发和测试，不应用于生产环境！

## 用途说明

此服务是一个 **mock/prototype** 服务器，用于：

1. 前端开发和调试（无需启动真实采集服务）
2. UI 原型设计阶段
3. 演示和截图

## 主要特征

- 返回硬编码的模拟数据
- 不连接真实 API
- 不写入 SQLite 数据库
- 接口格式与正式采集 server 不同

## 接口差异

| 功能 | Mock Server | 正式 Server |
|------|-------------|-------------|
| 状态接口 | `/api/dashboard` | `/status` |
| 火价历史 | `/api/fire/history` | `/fire-history` |
| 物品列表 | `/api/items` | `/items-history-all` |
| 响应格式 | 裸 JSON 数组 | `{ success, data, error }` |

## 运行方式

```bash
cd web-server
cargo run
```

服务将运行在 `http://localhost:8080`

## API 接口

- `GET /api/dashboard` - 仪表盘摘要
- `GET /api/fire/history` - 火价历史（query: mode, hours）
- `GET /api/fire/history/all` - 所有火价历史（query: mode）
- `GET /api/items` - 物品列表（query: mode, keyword）
- `POST /api/refresh/fire` - 刷新火价（添加新记录）
- `POST /api/refresh/items` - 刷新物品
- `GET /api/health` - 健康检查

## 生产使用

**不要在生产环境使用此服务！**

如需真实数据采集，请使用：
1. **内置独立采集 server**: `cargo run --bin server`
2. **Docker 部署**: 参考 `server-docker/README.md`
