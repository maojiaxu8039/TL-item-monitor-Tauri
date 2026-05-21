# TL Monitor Server

独立服务器用于采集火炬之光火价和物品数据，并通过 HTTP API 提供给 TorchScan 客户端读取。

## 功能特性

- 游戏物品价格数据采集
- 管理员 Web 界面（需密码登录）
- WebSocket 实时推送
- 管理员操作审计日志
- 直接二进制部署到极空间等 Linux 环境

## 本地检查

```bash
cd server-standalone

cargo check
```

本地构建出的二进制只适合本机系统，例如 macOS 构建产物不能放到 NAS/Linux 上运行。极空间部署必须使用 GitHub Actions 生成的 Linux ARM64 产物。

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

仓库已有 `.github/workflows/build-server-arm64.yml`，会在 `server-standalone/**` 或 workflow 自身变更时自动构建 Linux ARM64 部署包。

手动触发：

```bash
gh workflow run build-server-arm64.yml
gh run list --workflow=build-server-arm64.yml --limit 1
```

下载构建产物：

```bash
gh run download <run-id> --name linux-arm64-server --dir /tmp/tl-build
```

下载后会得到：

```text
/tmp/tl-build/
├── linux-arm64-server.tar.gz
└── linux-arm64-server/
    ├── tl-monitor-server
    ├── server_config.example.yaml
    └── resources/
        ├── qiandao_fire.cjs
        └── qiandao_fire.mjs
```

其中 `tl-monitor-server` 是 Linux ARM64 架构，面向极空间/NAS 环境，不能用本机 macOS/Windows 构建产物替代。

## 极空间部署

当前部署逻辑是下载 GitHub Actions 的 `linux-arm64-server` 产物，然后上传里面的 `tl-monitor-server` 到极空间环境运行，不依赖额外的镜像项目。

### 目录结构

```text
/path/to/tl-monitor/
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

### 更新二进制

由于服务正在运行，建议先上传新版本到临时文件，再停止服务并替换：

```bash
# 1. 下载并解压 GitHub Actions 产物
cd /tmp/tl-build
tar -xzf linux-arm64-server.tar.gz

# 2. 上传新版本到临时目录（SSH 端口 10039）
rsync -avz -e "ssh -p 10039" linux-arm64-server/tl-monitor-server user@nas:/tmp/tl-monitor-server.new
rsync -avz -e "ssh -p 10039" linux-arm64-server/resources/ user@nas:/tmp/tl-monitor-resources/

# 3. SSH 到 NAS（端口 10039）
ssh -p 10039 user@nas

# 4. 停止当前服务（按实际启动方式执行，例如 systemd/supervisor/极空间任务）
sudo systemctl stop tl-monitor-server

# 5. 备份并替换
sudo mv /path/to/tl-monitor/tl-monitor-server /path/to/tl-monitor/tl-monitor-server.bak
sudo cp /tmp/tl-monitor-server.new /path/to/tl-monitor/tl-monitor-server
sudo chmod +x /path/to/tl-monitor/tl-monitor-server
sudo mkdir -p /path/to/tl-monitor/resources
sudo cp /tmp/tl-monitor-resources/qiandao_fire.* /path/to/tl-monitor/resources/

# 6. 启动服务
sudo systemctl start tl-monitor-server
```

## 端口

如果直接在宿主环境运行，服务监听配置里的 `http_port`。如果通过极空间端口映射访问，请以实际映射端口为准。

| 端口类型 | 默认监听端口 | 示例映射端口 |
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

### 服务无法重启

检查实际托管方式的日志，例如 `systemctl status tl-monitor-server`、极空间任务日志，或直接查看程序标准输出。
