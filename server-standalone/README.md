# TL Monitor Server

独立服务器用于采集火炬之光火价和物品数据，并通过 HTTP API 提供给 TorchScan 客户端读取。

## 功能特性

- 游戏物品价格数据采集
- 管理员 Web 界面（需密码登录）
- WebSocket 实时推送
- 管理员操作审计日志
- Docker 容器化部署

## 本地构建

```bash
cd server-standalone

# 检查
cargo check
cargo test

# 生产构建
cargo build --release

# 运行
./target/release/tl-monitor-server
```

常用环境变量：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `TL_CONFIG_PATH` | `/config/server_config.yaml` | 配置文件路径 |
| `TL_DB_PATH` | `/data/tl_monitor.db` | SQLite 数据库路径 |
| `TL_RESOURCES_DIR` | `resources` | `qiandao_fire.cjs` 等资源脚本目录 |
| `TL_ADMIN_PASSWORD` | 空 | 管理员密码，生产环境必须设置 |
| `RUST_LOG` | `info` | 日志级别 |

`trust_proxy_headers` 默认是 `false`。只有在服务明确部署在可信反向代理后面时才建议设为 `true`，否则客户端可以伪造 `X-Forwarded-For` 影响限流和审计日志。

## 配置文件

可以从 [server_config.example.yaml](server_config.example.yaml) 复制一份到服务器环境中：

```bash
cp server_config.example.yaml server_config.yaml
```

生产环境建议通过环境变量设置管理员密码：

```bash
export TL_ADMIN_PASSWORD='你的强密码'
```

## GitHub Actions ARM64 构建

仓库已有 `.github/workflows/build-server-arm64.yml`，会在 `server-standalone/**` 或 workflow 自身变更时自动构建 Linux ARM64 二进制。

手动触发：

```bash
gh workflow run build-server-arm64.yml
gh run list --workflow=build-server-arm64.yml --limit 1
```

下载构建产物：

```bash
gh run download <run-id> --name linux-arm64-server --dir /tmp/tl-build
```

产物文件名：`tl-monitor-server`（ARM64 架构，GLIBC 兼容）

## 极空间部署

### Docker 容器部署（推荐）

当前生产环境使用 Docker 部署：

```bash
# 容器状态
docker ps | grep tl-monitor

# 重启容器
docker restart <container-id>

# 查看日志
docker logs -f <container-id>
```

### 目录结构

```text
/data_s001/data/udata/real/15510607744/Docker/tl-monitor/
├── tl-monitor-server     # 主程序（二进制）
├── tl-monitor-server.bak # 备份
├── tl-monitor-server.new # 待替换版本
├── config/
│   └── server_config.yaml
├── data/
│   └── tl_monitor.db
└── resources/
    └── qiandao_fire.cjs
```

### 更新二进制（Docker 部署）

由于容器内服务正在运行，无法直接覆盖二进制文件，需要通过备份替换：

```bash
# 1. 上传新版本到临时目录
rsync -avz tl-monitor-server user@nas:/tmp/tl-monitor-server.new

# 2. SSH 到 NAS（通过极空间控制台或 22 端口）
ssh user@nas

# 3. 备份并替换（需要 sudo）
sudo mv /path/to/tl-monitor/tl-monitor-server /path/to/tl-monitor/tl-monitor-server.bak
sudo cp /tmp/tl-monitor-server.new /path/to/tl-monitor/tl-monitor-server
sudo chmod +x /path/to/tl-monitor/tl-monitor-server

# 4. 重启 Docker 容器
sudo docker restart $(sudo docker ps | grep tl-monitor | awk '{print $1}')
```

## 端口

当前生产环境服务端口映射：`38457 -> 8080`

| 端口类型 | 容器内端口 | 主机映射端口 |
| --- | --- | --- |
| HTTP API | 8080 | 38457 |
| WebSocket | 8081 | 38458 |

## 验证

```bash
# 健康检查（使用实际映射端口）
curl http://100.124.122.65:38457/health

# 管理员状态查询
curl -s http://100.124.122.65:38457/api/admin/status \
  -H 'Content-Type: application/json' \
  -d '{"password":"你的管理员密码"}'

# 审计日志查询
curl -s http://100.124.122.65:38457/api/admin/audit-log \
  -H 'Content-Type: application/json' \
  -d '{"password":"你的管理员密码"}'
```

## 常见问题

### 配置文件读取失败

检查 `TL_CONFIG_PATH` 是否指向实际存在的 `server_config.yaml`。

### Node.js 脚本找不到

检查 `TL_RESOURCES_DIR` 是否指向包含 `qiandao_fire.cjs` 的目录。

### WebSocket 连接失败

确认 WebSocket 端口可访问。当前 WebSocket 端口为 HTTP 端口 + 1。

### CORS 错误

在 `server_config.yaml` 的 `cors_allowed_origins` 中加入客户端访问地址，然后重启服务。

### Docker 容器内服务无法重启

如果容器内服务无法通过 API 重启，可以重启整个容器：

```bash
docker restart $(docker ps | grep tl-monitor | awk '{print $1}')
```