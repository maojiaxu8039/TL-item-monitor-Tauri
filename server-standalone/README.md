# TL Monitor Server

独立服务器用于采集火炬之光火价和物品数据，并通过 HTTP API 提供给 TorchScan 客户端读取。

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

仓库已有 `.github/workflows/build-server-arm64.yml`，会在 `server-standalone/**` 或 workflow 自身变更时构建 Linux ARM64 二进制。

手动触发：

```bash
gh workflow run build-server-arm64.yml
gh run list --workflow=build-server-arm64.yml --limit 1
gh run download <run-id> --name linux-arm64-server --dir /tmp/tl-build
```

产物文件名：

```text
tl-monitor-server
```

## 极空间部署

推荐流程是直接替换极空间环境中的 `tl-monitor-server` 二进制文件。

示例目录结构：

```text
/path/to/tl-monitor/
├── tl-monitor-server
├── config/
│   └── server_config.yaml
├── data/
│   └── tl_monitor.db
└── resources/
    └── qiandao_fire.cjs
```

首次准备：

```bash
mkdir -p /path/to/tl-monitor/config
mkdir -p /path/to/tl-monitor/data
mkdir -p /path/to/tl-monitor/resources
```

上传内容：

- GitHub Actions 产物 `tl-monitor-server`
- 配置文件 `server_config.yaml`
- 资源脚本 `src-tauri/resources/qiandao_fire.cjs`

运行时需要确保：

```bash
export TL_CONFIG_PATH=/path/to/tl-monitor/config/server_config.yaml
export TL_DB_PATH=/path/to/tl-monitor/data/tl_monitor.db
export TL_RESOURCES_DIR=/path/to/tl-monitor/resources
export TL_ADMIN_PASSWORD='你的强密码'
```

启动：

```bash
chmod +x /path/to/tl-monitor/tl-monitor-server
/path/to/tl-monitor/tl-monitor-server
```

## 更新二进制

下载新的 Actions 产物后：

```bash
# 停止当前服务
# 替换二进制
cp /tmp/tl-build/tl-monitor-server /path/to/tl-monitor/tl-monitor-server
chmod +x /path/to/tl-monitor/tl-monitor-server

# 重新启动服务
/path/to/tl-monitor/tl-monitor-server
```

服务端部署以 `server-standalone` 的二进制为准。

## 端口

默认 HTTP 端口是 `8080`。WebSocket 实时推送端口是 `http_port + 1`，默认 `8081`。

如果管理页需要使用实时 WebSocket，请确保极空间环境同时允许访问这两个端口。

## 验证

```bash
curl http://SERVER_IP:8080/health

curl -s http://SERVER_IP:8080/api/admin/status \
  -H 'Content-Type: application/json' \
  -d '{"password":"你的管理员密码"}'
```

## 常见问题

### 配置文件读取失败

检查 `TL_CONFIG_PATH` 是否指向实际存在的 `server_config.yaml`。

### Node.js 脚本找不到

检查 `TL_RESOURCES_DIR` 是否指向包含 `qiandao_fire.cjs` 的目录。

### WebSocket 连接失败

确认 `http_port + 1` 端口可访问。例如 HTTP 是 `8080`，WebSocket 就是 `8081`。

### CORS 错误

在 `server_config.yaml` 的 `cors_allowed_origins` 中加入客户端访问地址，然后重启服务。
