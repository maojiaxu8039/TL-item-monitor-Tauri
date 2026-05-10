# TL Monitor Server - 生产部署指南

本文档描述服务端在生产环境中的推荐构建、发布和维护方式。当前生产目标是极空间 NAS 上运行 Linux ARM64 Docker 镜像。

## 结论

生产环境推荐采用一条稳定链路：

1. 服务端代码只从 `server-standalone` 构建。
2. GitHub Actions 或本地 Docker Buildx 负责构建 `linux/arm64` 镜像。
3. 镜像推送到 GHCR：`ghcr.io/maojiaxu8039/tl-monitor-server`。
4. NAS 只负责拉取镜像和运行容器，不在 NAS 上编译 Rust 或 Node 资源。
5. 生产容器只挂载持久化数据和配置：`/data`、`/app/config`。
6. 火价兜底脚本应内置在镜像里，不再手动上传 macOS 可执行文件。

不要再从 `src-tauri` 构建服务端镜像。`src-tauri` 会引入 Tauri 桌面端依赖，Linux ARM64 构建时容易碰到 `glib/gtk/webkit2gtk` 等系统依赖问题。

## 推荐架构

```text
GitHub main
  |
  | GitHub Actions / Docker Buildx
  v
linux/arm64 Docker image
  |
  | push
  v
GHCR: ghcr.io/maojiaxu8039/tl-monitor-server:<tag>
  |
  | docker compose pull
  v
极空间 NAS
  |
  | volumes
  v
/data        SQLite 数据库
/app/config 生产配置
```

## 当前风险点

这些点是后续开发和部署时需要避免的坑：

- `server-docker/Dockerfile` 如果继续从 `src-tauri` 构建，会重新引入桌面依赖链。
- `server-docker/resources/qiandao_fire` 是 macOS 可执行文件，不能在 Linux ARM64 容器中运行。
- 服务端火价抓取的 Node 兜底逻辑查找的是 `qiandao_fire.cjs` 或 `qiandao_fire.mjs`，不是裸二进制 `qiandao_fire`。
- 如果镜像里没有 `nodejs`，Node 兜底逻辑会失败。短期应完整支持兜底，长期可以在 Rust 抓取稳定后移除 Node 兜底。
- 生产配置、NAS 登录信息、管理员密码不能提交到仓库。仓库里只保留 `.example` 示例。
- 服务端是生产 Rust 二进制，`server-standalone/Cargo.lock` 应提交，避免依赖版本自动漂移。

如果仓库历史中曾出现过真实 NAS 密码、管理员密码或其他凭据，需要在对应系统中轮换这些凭据。删除文档中的明文只能避免继续扩散，不能消除历史泄露风险。

## 构建策略

### GitHub Actions 构建

推荐由 GitHub Actions 构建并推送生产镜像：

```text
server-standalone/** 变更
server-docker/** 变更
.github/workflows/build-server.yml 变更
  -> 构建 linux/arm64 镜像
  -> 推送到 GHCR
```

构建原则：

- builder 阶段编译 `server-standalone`。
- runtime 阶段使用精简 Debian 镜像。
- 镜像内置服务端运行所需资源，例如 `qiandao_fire.cjs`。
- 如果保留 Node 兜底，runtime 阶段必须安装 `nodejs`。
- 不依赖 NAS 上的本地构建环境。

生产镜像地址：

```text
ghcr.io/maojiaxu8039/tl-monitor-server
```

推荐生产使用固定 tag 或 digest，例如：

```text
ghcr.io/maojiaxu8039/tl-monitor-server:main-<commit-sha>
ghcr.io/maojiaxu8039/tl-monitor-server:v1.0.0
```

`latest` 可以用于测试，但生产不建议长期依赖 `latest`，否则回滚和排障会比较困难。

### 本地 Mac 构建

本地 Mac 可以构建 Linux ARM64 镜像，但推荐通过 Docker/Colima 提供 Linux ARM64 环境，不建议直接在 macOS 上交叉编译生产二进制。

```bash
brew install colima docker
colima start --arch aarch64
docker buildx version
```

完成 Dockerfile 多阶段构建改造后，可以在项目根目录执行：

```bash
docker buildx build \
  --platform linux/arm64 \
  -f server-docker/Dockerfile \
  -t tl-monitor-server:dev \
  --load \
  .
```

本地验证：

```bash
docker run --rm \
  -p 38457:8080 \
  -v "$PWD/server-docker/data:/data" \
  -v "$PWD/server-docker/config:/app/config" \
  tl-monitor-server:dev
```

## NAS 部署

### 目录结构

在 NAS 上准备一个固定部署目录。以下路径只是模板，实际路径以 NAS 环境为准：

```bash
export TL_MONITOR_ROOT="/path/to/Docker/tl-monitor"

sudo mkdir -p "$TL_MONITOR_ROOT/data"
sudo mkdir -p "$TL_MONITOR_ROOT/config"
```

不建议默认挂载 `resources` 目录。资源文件应内置在镜像里，避免宿主机目录覆盖 `/app/resources` 后导致脚本丢失。

### 配置文件

生产配置放在：

```text
$TL_MONITOR_ROOT/config/server_config.yaml
```

仓库中只应保留示例配置，例如 `server_config.yaml.example`。真实配置不要提交。

示例：

```yaml
admin_password: "CHANGE_ME"

season_id: "ss12"
http_port: 8080

scrape_modes:
  - mode: "normal"
    enabled: true
  - mode: "expert"
    enabled: true

api_config:
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
  - "http://<nas-ip>:38457"
```

### Compose 部署

推荐使用 compose 管理生产容器，便于更新和回滚。

```yaml
services:
  tl-monitor-server:
    image: ${TL_MONITOR_IMAGE}
    container_name: tl-monitor-server
    restart: unless-stopped
    ports:
      - "38457:8080"
    volumes:
      - ./data:/data
      - ./config:/app/config
    environment:
      - RUST_LOG=info
      - TL_DB_PATH=/data/tl_monitor.db
      - TL_CONFIG_PATH=/app/config/server_config.yaml
      - TL_RESOURCES_DIR=/app/resources
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

`.env` 示例：

```bash
TL_MONITOR_IMAGE=ghcr.io/maojiaxu8039/tl-monitor-server:main-<commit-sha>
```

启动：

```bash
cd "$TL_MONITOR_ROOT"
sudo docker compose pull
sudo docker compose up -d
```

验证：

```bash
sudo docker ps | grep tl-monitor-server
sudo docker logs --tail 100 tl-monitor-server
curl http://localhost:38457/health
```

访问地址：

| 地址 | 说明 |
| --- | --- |
| `http://<nas-ip>:38457/` | 服务状态 |
| `http://<nas-ip>:38457/admin` | 管理页面 |
| `http://<nas-ip>:38457/health` | 健康检查 |

## 更新和回滚

### 更新到新版本

1. 在 GitHub Actions 中确认目标 tag 构建成功。
2. 修改 NAS 上 `.env` 的 `TL_MONITOR_IMAGE`。
3. 拉取并重启容器。

```bash
cd "$TL_MONITOR_ROOT"
sudo docker compose pull
sudo docker compose up -d
sudo docker logs --tail 100 tl-monitor-server
curl http://localhost:38457/health
```

### 回滚到旧版本

把 `.env` 中的 `TL_MONITOR_IMAGE` 改回上一个已知可用 tag，然后执行：

```bash
cd "$TL_MONITOR_ROOT"
sudo docker compose pull
sudo docker compose up -d
```

## 维护命令

容器状态：

```bash
sudo docker ps | grep tl-monitor-server
sudo docker logs -f tl-monitor-server
sudo docker restart tl-monitor-server
sudo docker stop tl-monitor-server
```

数据库备份：

```bash
sudo cp "$TL_MONITOR_ROOT/data/tl_monitor.db" \
  "$TL_MONITOR_ROOT/data/backup_$(date +%Y%m%d_%H%M%S).db"
```

如果需要查询 SQLite 数据库，优先在 NAS 宿主机或临时工具容器中执行，不要为了日常运行把 `sqlite3` 放进生产镜像。

日志排查：

```bash
sudo docker logs --tail 100 tl-monitor-server | grep -i "error\|fail\|采集"
sudo docker logs --tail 100 tl-monitor-server | grep "火价"
```

## 故障排除

### 容器无法启动

检查：

- `server_config.yaml` 是否存在且 YAML 格式正确。
- `/data` 和 `/app/config` 挂载目录权限是否正确。
- 镜像 tag 是否存在并且是 `linux/arm64`。
- 如果日志出现 Node 兜底失败，确认镜像是否内置 `nodejs` 和 `qiandao_fire.cjs`。

```bash
sudo docker logs tl-monitor-server
```

### 无法访问页面

检查：

- NAS 防火墙是否允许 `38457`。
- 容器是否正在运行。
- 端口映射是否为 `38457:8080`。

```bash
sudo docker ps | grep tl-monitor-server
curl http://localhost:38457/health
```

### 数据采集失败

检查：

- NAS 是否能访问洛斯 API 和千岛 API。
- `server_config.yaml` 中赛季和 tag/spec 配置是否正确。
- 日志中 Rust 抓取和 Node 兜底分别报了什么错误。

```bash
sudo docker logs --tail 200 tl-monitor-server | grep -i "error\|fail\|火价\|采集"
```

### CORS 跨域错误

在 `server_config.yaml` 的 `cors_allowed_origins` 中加入实际客户端来源，然后重启容器。

```yaml
cors_allowed_origins:
  - "http://<client-ip>:38457"
```

```bash
sudo docker restart tl-monitor-server
```

## 后续开发规范

- 服务端生产代码只放在 `server-standalone`。
- 桌面端和 Tauri 依赖不要进入服务端 Docker 构建链路。
- 不提交真实生产配置、密码、NAS 地址、数据库和本地构建产物。
- 服务端依赖更新后同步检查并提交 `server-standalone/Cargo.lock`。
- 如果保留 Node 兜底，Dockerfile、资源文件和运行时依赖必须一起维护。
- 如果移除 Node 兜底，需要先确认 Rust 火价抓取在生产环境连续稳定。
- 生产优先使用固定镜像 tag，避免只依赖 `latest`。
- 每次部署前确认 GitHub Actions 对应 run 成功。

## 迁移清单

为达到本文档的推荐状态，建议按顺序完成：

1. 将 `server-docker/Dockerfile` 改为从 `server-standalone` 构建的多阶段 Dockerfile。
2. 在镜像中内置 `qiandao_fire.cjs`，并在保留兜底时安装 `nodejs`。
3. 调整 `docker-compose.yml`，移除默认 `/app/resources` 挂载。
4. 将 `server-docker/config/server_config.yaml` 改成 `.example`，真实配置只保存在 NAS。
5. 移除仓库中的 macOS `server-docker/resources/qiandao_fire`。
6. 提交 `server-standalone/Cargo.lock`。
7. 将 GitHub Actions 产物 tag 固定到 commit sha 或 release tag。
8. 轮换曾经写入文档或仓库历史的真实凭据。

---

文档最后更新：2026-05-10
