# TL Monitor Server API 文档

> server-standalone HTTP API 完整参考
> 基于 `server-standalone/src/main.rs`
> 版本: v1.0.1+

## 概览

- **端口**: `http_port` (默认 8080,WebSocket 在 +1)
- **协议**: HTTP/1.1, 手写 TCP 解析器
- **响应格式**: JSON (`application/json`) / Prometheus (`text/plain`)
- **认证**: 管理员 API 走 `password` query 参数或 body
- **跨域**: 需 `Origin` 头匹配 `cors_allowed_origins` 配置
- **Connection**: `close` (当前不支持 keep-alive 复用)

### 通用响应格式

```json
// 成功
{
  "success": true,
  "data": { ... },
  "error": null
}

// 失败
{
  "success": false,
  "data": null,
  "error": "错误描述"
}
```

### 通用 Query 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `mode` | string | `normal` \| `expert` (市场模式,默认 normal) |
| `password` | string | 管理员密码(需鉴权的 API) |
| `season_id` | string | 赛季 ID (默认当前赛季) |

---

## 公开 API (无需认证)

### Health / 探活

#### `GET /health`

K8s **liveness** 探针: 只检查进程存活,不查 DB。

```
curl http://localhost:8080/health
```

**响应 200**:
```json
{
  "success": true,
  "data": { "status": "alive" },
  "error": null
}
```

#### `GET /health/live`

同 `/health`,显式 liveness 路径。

#### `GET /health/ready`

K8s **readiness** 探针: 检查 DB 可用性。

```
curl http://localhost:8080/health/ready
```

**响应 200** (DB 正常):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "db_check": "ok",
    "db_check_ms": 2
  },
  "error": null
}
```

**响应 503** (DB 不可用):
```json
{
  "success": false,
  "data": null,
  "error": "Database error: ..."
}
```

---

### 赛季信息

#### `GET /seasons`

获取所有赛季列表。

```
curl "http://localhost:8080/seasons"
```

**响应**:
```json
{
  "success": true,
  "data": [
    { "id": "ss12", "name": "SS12", "started_at": 1776384000, "is_current": true },
    { "id": "ss11", "name": "SS11", "started_at": 1750000000, "is_current": false }
  ],
  "error": null
}
```

#### `GET /season-start`

获取当前赛季开始时间戳(UTC 秒)。

```
curl "http://localhost:8080/season-start?season_id=ss12"
```

**响应**:
```json
{
  "success": true,
  "data": { "started_at": 1776384000 },
  "error": null
}
```

---

### 火价历史

#### `GET /fire-history`

获取火价历史(当前赛季,最近 limit 条)。

```
curl "http://localhost:8080/fire-history?mode=normal&limit=24"
```

**Query 参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `normal` | `normal` \| `expert` |
| `limit` | integer | `24` | 最大 10000 |

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "rmb_per_10k_fire": 1.23,
      "fire_per_rmb": 8130.08,
      "increase_ratio": 2.5,
      "trading_volume": "12345",
      "source": "千岛API-赛季普通",
      "source_time": "2026-06-24T08:00:00+08:00",
      "scraped_at": 1776384000,
      "season_day": 1
    }
  ],
  "error": null
}
```

#### `GET /fire-history-all`

获取整赛季火价历史(批量同步用,返回所有记录)。

```
curl "http://localhost:8080/fire-history-all?mode=normal&season_id=ss12"
```

**Query 参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `normal` | `normal` \| `expert` |
| `season_id` | string | 当前赛季 | 赛季 ID |
| `limit` | integer | 99999 | 最大 100000 |

---

### 物品数据

#### `GET /items-history`

获取指定物品的价格历史。

```
curl "http://localhost:8080/items-history?mode=normal&item_id=392019&limit=24"
```

**Query 参数**:

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | `normal` \| `expert` |
| `item_id` | string | 是 | 物品 ID |
| `limit` | integer | 否 | 最大 10000 |

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "item_id": "392019",
      "fire_price": 8130.08,
      "scraped_at": 1776384000,
      "season_day": 1
    }
  ],
  "error": null
}
```

#### `GET /items-history-all`

批量获取所有物品最新价格(用于全量同步)。

```
curl "http://localhost:8080/items-history-all?mode=normal&limit=1000"
```

**Query 参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `normal` | `normal` \| `expert` |
| `season_id` | string | 当前赛季 | 赛季 ID |
| `limit` | integer | `1000` | 最大 1000 |

#### `GET /items-daily`

获取每日汇总(按天聚合计数)。

```
curl "http://localhost:8080/items-daily?mode=normal&min_day=1&max_day=10"
```

#### `GET /items-sync`

游标分页获取物品列表(支持 `before_id` 分页)。

```
curl "http://localhost:8080/items-sync?mode=normal&limit=50&before_id=abc123"
```

**Query 参数**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `mode` | string | `normal` | `normal` \| `expert` |
| `season_id` | string | 当前赛季 | 赛季 ID |
| `limit` | integer | `50` | 最大 200 |
| `before_id` | string | - | 游标(上一页最后一条 item_id) |

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [...],
    "has_more": true,
    "next_cursor": "xyz789"
  },
  "error": null
}
```

#### `GET /items-sync-stats`

获取 `items-sync` 可用赛季列表。

```
curl "http://localhost:8080/items-sync-stats"
```

---

### 实时 / 同步

#### `GET /sync-fast`

快速全量同步: 一次性返回所有赛季所有模式的最新物品数据。

```
curl "http://localhost:8080/sync-fast"
```

**响应**:
```json
{
  "success": true,
  "data": {
    "normal": {
      "season_id": "ss12",
      "items": [{ "item_id": "392019", "fire_price": 8130.08, ... }]
    },
    "expert": { ... }
  },
  "error": null
}
```

#### `GET /prices-latest`

获取最新物品价格(含分钟级粒度)。

```
curl "http://localhost:8080/prices-latest?mode=normal"
```

#### `GET /dual-source-overview`

双源概览: 同时返回普通服和专家服最新数据。

```
curl "http://localhost:8080/dual-source-overview"
```

#### `GET /dual-source-history`

双源历史: 同时返回普通服和专家服历史数据。

```
curl "http://localhost:8080/dual-source-history?mode=normal&limit=24"
```

---

### 统计

#### `GET /stats`

服务器运行统计(赛季信息、最近采集状态)。

```
curl "http://localhost:8080/stats"
```

**响应**:
```json
{
  "success": true,
  "data": {
    "version": "1.0.1",
    "uptime_seconds": 3600,
    "current_season": "ss12",
    "last_collection": {
      "normal": {
        "timestamp": 1776384000,
        "fire_success": true,
        "fire_price": 1.23,
        "items_count": 100,
        "items_success": true,
        "error": null
      },
      "expert": { ... }
    },
    "next_collection": 1776387600
  },
  "error": null
}
```

---

### 可观测性

#### `GET /metrics`

Prometheus text-format 指标端点(供 Prometheus 抓取)。

```
curl http://localhost:8080/metrics
```

**暴露指标**:

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `http_requests_total{method,path,status}` | Counter | HTTP 请求总数 |
| `http_request_duration_avg_seconds{method,path}` | Gauge | HTTP 请求平均延迟(秒) |
| `ws_clients` | Gauge | 在线 WebSocket 客户端数 |
| `scrape_errors_total` | Counter | 采集错误总次数 |
| `last_scrape_timestamp_seconds` | Gauge | 最近一次成功采集的 Unix 时间戳 |
| `server_uptime_seconds` | Gauge | 服务运行时长(秒) |
| `db_pool_acquired_total` | Counter | DB 连接池获取总次数 |
| `db_pool_acquire_errors_total` | Counter | DB 连接池获取超时次数 |

**示例**:
```
# HELP http_requests_total Total HTTP requests by method/path/status
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/health",status="200"} 42
http_requests_total{method="GET",path="/fire-history",status="200"} 128

# HELP ws_clients Current WebSocket client count
# TYPE ws_clients gauge
ws_clients 3
```

---

## 管理员 API (需密码)

> 密码通过 `?password=xxx` query 参数传递

### 审计日志

#### `GET /admin/audit-log`

查询管理操作审计日志。

```
curl "http://localhost:8080/admin/audit-log?password=xxx&action=update_config&limit=50"
```

**Query 参数**:

| 参数 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `password` | string | 是 | 管理员密码 |
| `action` | string | 否 | 过滤操作类型 |
| `success` | bool | 否 | 过滤成功/失败 |
| `limit` | integer | 否 | 最大 100 |

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "action": "update_config",
      "success": true,
      "ip_address": "192.168.1.100",
      "details": "...",
      "timestamp": 1776384000
    }
  ],
  "error": null
}
```

#### `POST /admin/audit-log`

手动记录审计日志条目(供外部系统回调)。

```
curl -X POST "http://localhost:8080/admin/audit-log?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{"action":"sync","success":true,"details":"..."}'
```

---

### 赛季管理

#### `POST /admin/init-season`

初始化新赛季(创建表 + 设置赛季配置)。

```
curl -X POST "http://localhost:8080/admin/init-season?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "season_id": "ss13",
    "season_name": "SS13 赛季",
    "started_at": 1776384000
  }'
```

**响应**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "season_id": "ss13",
    "tables_created": [
      "fire_price_snapshots_ss13_normal",
      "fire_price_snapshots_ss13_expert",
      "item_snapshots_ss13_normal",
      "item_snapshots_ss13_expert"
    ],
    "message": "新赛季初始化成功"
  },
  "error": null
}
```

#### `POST /admin/archive-season`

归档旧赛季(将实时表数据迁移到快照表)。

```
curl -X POST "http://localhost:8080/admin/archive-season?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{"season_id": "ss11"}'
```

---

### 配置管理

#### `GET /api/admin/status`

获取服务器当前运行状态。

```
curl "http://localhost:8080/api/admin/status?password=xxx"
```

#### `GET /api/admin/config`

获取服务器配置文件内容(明文)。

```
curl "http://localhost:8080/api/admin/config?password=xxx"
```

#### `POST /api/admin/config`

更新服务器配置文件(覆盖写)。

```
curl -X POST "http://localhost:8080/api/admin/config?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{ "http_port": 8080, "season_id": "ss12" }'
```

#### `POST /api/admin/update-config`

原子更新指定配置字段(部分更新)。

```
curl -X POST "http://localhost:8080/api/admin/update-config?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{ "http_port": 8081 }'
```

#### `POST /admin/update-api-config`

更新采集 API 参数(千岛/刷图小助手 tagId/specId 等)。

```
curl -X POST "http://localhost:8080/admin/update-api-config?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "qiandao_tag_id_normal": "1560053",
    "qiandao_spec_id_normal": "267416",
    "qiandao_tag_id_expert": "1560053",
    "qiandao_spec_id_expert": "267417",
    "luosi_season_id_normal": 1401,
    "luosi_season_id_expert": 1431
  }'
```

---

### 数据管理

#### `POST /admin/reset-table`

清空指定表(危险操作)。

```
curl -X POST "http://localhost:8080/admin/reset-table?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{ "table": "items_normal" }'
```

#### `POST /admin/reset-season`

重置指定赛季所有数据(危险操作)。

```
curl -X POST "http://localhost:8080/admin/reset-season?password=xxx" \
  -H "Content-Type: application/json" \
  -d '{ "season_id": "ss12" }'
```

---

## WebSocket API

> 连接地址: `ws://localhost:8081` (HTTP 端口 +1)
> 鉴权: 首条消息发送 `{ "type": "auth", "password": "xxx" }`

### 认证消息

```json
{ "type": "auth", "password": "xxx" }
```

**认证成功**:
```json
{ "type": "auth_success" }
```

**认证失败**:
```json
{ "type": "error", "message": "Invalid password" }
```

### 订阅消息

```json
{ "type": "subscribe", "mode": "normal", "season_id": "ss12" }
```

### 推送消息 (服务端 → 客户端)

```json
{
  "type": "price_update",
  "data": {
    "item_id": "392019",
    "fire_price": 8130.08,
    "scraped_at": 1776384000,
    "source": "scrape"
  }
}
```

```json
{
  "type": "fire_price_update",
  "data": {
    "mode": "normal",
    "rmb_per_10k_fire": 1.23,
    "increase_ratio": 2.5,
    "scraped_at": 1776384000
  }
}
```

---

## 时区约定

所有时间字段遵循以下约定:

| 字段 | 类型 | 时区 | 说明 |
|------|------|------|------|
| `scraped_at` | INTEGER | UTC 秒 | 抓取瞬间,用于排序/过滤 |
| `source_time` | TEXT (RFC3339) | BJT (+08:00) | 人类可读的展示时间 |
| `timestamp` | INTEGER | UTC 秒 | 通用时间戳 |
| `started_at` | INTEGER | UTC 秒 | 赛季开始时间 |

---

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 认证失败 (密码错误) |
| 403 | CORS origin 被拒绝 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 (如 DB 不可用) |

---

## CORS 说明

- 预检请求 (`OPTIONS`) 自动处理
- `Origin` 头需匹配配置文件中的 `cors_allowed_origins`
- 支持通配符 `*` (仅开发环境使用)

## 部署参考

```bash
# Docker
docker build -t tl-monitor-server .
docker run -p 8080:8080 -v ./data:/app/data tl-monitor-server

# docker-compose
docker-compose -f server-standalone/docker-compose.yml up -d

# systemd
sudo cp deploy/systemd/tl-monitor.service /etc/systemd/system/
sudo systemctl enable --now tl-monitor
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TL_CONFIG_PATH` | 配置文件路径 | `/app/data/server_config.yaml` |
| `TL_DB_PATH` | 数据库文件路径 | `/app/data/tl-monitor.db` |
| `TL_RESOURCES_DIR` | 资源目录 | `/app/resources` |
| `TL_LOG_LEVEL` | 日志级别 | `info` |
| `TL_HTTP_PORT` | HTTP 端口 | `8080` |
