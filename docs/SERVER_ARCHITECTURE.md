# TL Item Monitor 服务端架构文档

## 一、项目结构

```
TL-item-monitor-Tauri/
├── src-tauri/
│   └── src/
│       └── server/                    # 服务端核心代码
│           ├── mod.rs                 # 模块入口
│           ├── config.rs              # 配置管理
│           ├── db.rs                  # 数据库操作
│           ├── scraper.rs             # 数据采集器
│           └── admin.html             # 管理页面
│
│   └── src/bin/
│       └── server.rs                  # 服务端入口 (cargo run --bin server)
│
├── server-docker/                     # Docker 部署配置
│   ├── Dockerfile
│   ├── Dockerfile.prebuilt
│   ├── docker-compose.yml
│   ├── config/
│   │   └── server_config.yaml
│   ├── resources/
│   │   └── qiandao_fire               # Node.js 火价脚本
│   └── 极空间Z2Pro部署指南.md
│
├── docker/                            # Docker 配置文件 (简化版)
│   ├── Dockerfile
│   ├── Dockerfile-with-node
│   ├── docker-compose.yml
│   ├── docker-compose-tl-monitor.yml
│   ├── server_config.yaml
│   ├── 极空间Docker图形化部署指南.md
│   └── 极空间Docker部署完整指南.md
│
└── docs/                          # 项目文档
```

## 二、服务端模块说明

### 2.1 server/mod.rs
服务端模块入口，定义了以下子模块：
- `config` - 配置管理
- `db` - 数据库操作
- `scraper` - 数据采集

### 2.2 server/config.rs
配置文件结构定义，支持以下配置项：

```yaml
season_id: "ss12"              # 当前赛季ID
http_port: 8080               # HTTP 服务端口
scrape_modes:                 # 采集模式
  - mode: "normal"
    enabled: true
  - mode: "expert"
    enabled: true
admin_password: "xxx"         # 管理员密码
api_config:                   # API 配置
  qiandao_tag_id_normal: "1560053"
  qiandao_spec_id_normal: "267416"
  qiandao_tag_id_expert: "1560055"
  qiandao_spec_id_expert: "267417"
  luosi_season_id_normal: 1401
  luosi_season_id_expert: 1431
api_endpoints:
  luosi: "http://115.231.176.101:8080"
  qiandao: "https://api.qiandao.com"
  qiandao_fire_endpoint: "/c2c-web/v1/common/currency-spu-price-list"
rate_limit:
  enabled: true
  requests_per_minute: 60
  burst_size: 10
cors_allowed_origins:
  - "http://localhost:5173"
  - "http://localhost:8080"
```

### 2.3 server/db.rs
数据库操作模块，管理以下功能：

**主要结构：**
- `MarketMode` - 市场模式枚举（Normal/Expert）
- `FireSnapshotRecord` - 火价快照记录
- `ItemSnapshotRecord` - 物品快照记录

**核心函数：**
- `run_migrations()` - 执行数据库迁移
- `get_current_season()` - 获取当前活跃赛季
- `init_new_season()` - 初始化新赛季
- `archive_season()` - 归档赛季
- `insert_fire_snapshot()` - 插入火价快照
- `insert_items_snapshots()` - 插入物品快照
- `get_fire_history()` - 查询火价历史
- `get_items_history()` - 查询物品历史
- `get_season_stats()` - 获取赛季统计

**数据库表结构：**

每个赛季会创建以下表：
- `fire_price_snapshots_{season}_{mode}` - 火价快照
- `item_snapshots_{season}_{mode}` - 物品快照

mode 可选值：`normal`（普通服）、`expert`（专家服）

### 2.4 server/scraper.rs
数据采集模块，支持多种数据源：

**火价采集：**
1. **Rust 原生采集**：通过千岛API获取火价
2. **Node.js 脚本备用**：当 Rust 采集失败时使用 Node 脚本

**物品采集：**
- 通过裸丝API获取物品价格数据

**主要函数：**
- `scrape_fire_price()` - 采集火价
- `scrape_items()` - 采集物品数据

## 三、API 接口说明

### 3.1 公共接口（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务状态信息 |
| GET | `/status` | 服务状态（与 `/` 相同） |
| GET | `/health` | 健康检查，返回 "OK" |
| GET | `/fire-history` | 火价历史 |
| GET | `/fire-history-all` | 所有火价历史（分页） |
| GET | `/items-history` | 单个物品历史（需 item_id） |
| GET | `/items-history-all` | 所有物品历史（分页） |
| GET | `/season-start` | 赛季开始时间 |
| GET | `/stats` | 赛季统计 |
| GET | `/seasons` | 所有赛季列表 |

**查询参数：**
- `mode` - 市场模式：`normal` 或 `expert`（默认 normal）
- `season` - 赛季ID（默认当前赛季）
- `limit` - 限制返回数量
- `offset` - 分页偏移
- `min_day` / `max_day` - 赛季天数范围

### 3.2 管理接口（需要密码认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin.html` | 管理页面 |
| POST | `/admin/init-season` | 初始化新赛季 |
| POST | `/admin/archive-season` | 归档赛季 |
| POST | `/admin/update-api-config` | 更新 API 配置 |
| POST | `/admin/reset-table` | 重置指定表 |
| POST | `/admin/reset-season` | 重置赛季所有表 |

### 3.3 API 响应格式

```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

错误时：
```json
{
  "success": false,
  "data": null,
  "error": "错误信息"
}
```

## 四、部署方式

### 4.1 本地开发运行

```bash
# 编译并运行服务端
cd src-tauri
cargo run --bin server

# 或使用 Docker
cd server-docker
docker-compose up -d
```

### 4.2 Docker 部署

**方式一：server-docker（推荐）**
```bash
cd server-docker
docker-compose up -d
```

**方式二：简化版 docker/ 目录**
```bash
cd docker
docker-compose -f docker-compose.yml up -d
```

### 4.3 环境变量

- `TL_CONFIG_PATH` - 配置文件路径（默认 `/config/server_config.yaml`）
- `TL_DB_PATH` - 数据库路径（默认 `/data/tl_monitor.db`）
- `TL_RESOURCES_DIR` - 资源文件目录（用于 Node.js 火价脚本）

## 五、数据流向

```
外部API (千岛/裸丝)
       ↓
  scraper 模块采集
       ↓
  db 模块写入 SQLite
       ↓
  HTTP API 对外提供服务
       ↓
  前端 Tauri App 展示
```

## 六、配置管理

### 6.1 启动时配置加载
1. 尝试从 `TL_CONFIG_PATH` 环境变量指定路径加载
2. 若不存在，创建默认配置
3. 填充缺失的默认值

### 6.2 运行时配置更新
- 通过管理接口 `/admin/update-api-config` 可更新 API 配置
- 配置变更需要重启服务生效

## 七、错误处理

- 采集失败会尝试备用方案（如 Node.js 脚本）
- API 请求限流保护
- CORS 跨域控制
- 请求体大小限制（64KB）

## 八、注意事项

1. **赛季管理**：使用前需通过 `/admin/init-season` 初始化赛季
2. **数据归档**：旧赛季数据通过 `/admin/archive-season` 归档