# TL Monitor Server - 部署指南

## 目录

- [快速开始](#快速开始)
- [GitHub Actions 自动构建](#github-actions-自动构建)
- [极空间 NAS 部署](#极空间-nas-部署)
- [配置说明](#配置说明)
- [维护命令](#维护命令)
- [故障排除](#故障排除)

---

## 快速开始

### 方式一：使用预编译镜像（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/maojiaxu8039/TL-item-monitor-Tauri.git
cd TL-item-monitor-Tauri

# 2. 准备配置
mkdir -p server-docker/data server-docker/config server-docker/resources

# 3. 复制配置文件
cp server-docker/config/server_config.yaml.example server-docker/config/server_config.yaml

# 4. 复制火价采集脚本
cp src-tauri/resources/qiandao_fire server-docker/resources/

# 5. 启动服务
cd server-docker
docker compose up -d

# 6. 查看日志
docker compose logs -f
```

### 方式二：手动构建镜像

```bash
# 在项目根目录执行
docker build -f server-docker/Dockerfile -t tl-monitor-server:latest .

# 运行
docker run -d \
  --name tl-monitor \
  -p 38457:8080 \
  -v $(pwd)/data:/data \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/resources:/app/resources \
  tl-monitor-server:latest
```

---

## GitHub Actions 自动构建

每次推送到 `main` 分支，GitHub Actions 会自动：

1. 在 ARM64 平台上编译 Rust 服务器代码
2. 构建 Docker 镜像
3. 推送到 GitHub Container Registry (GHCR)

**镜像地址**: `ghcr.io/maojiaxu8039/tl-monitor-server:latest`

### 检查构建状态

访问: https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions

---

## 极空间 NAS 部署

### 步骤 1: 开启 SSH

在极空间控制面板中开启 SSH 管理功能。

### 步骤 2: SSH 连接到 NAS

```bash
ssh -p 10039 15510607744@100.124.122.65
# 密码: !Mjx452212889
```

### 步骤 3: 创建目录结构

```bash
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources
```

### 步骤 4: 上传配置文件

将以下文件上传到 NAS：
- `server-docker/config/server_config.yaml`
- `src-tauri/resources/qiandao_fire` → `resources/`

### 步骤 5: 拉取并启动镜像

```bash
# 拉取最新镜像
sudo docker pull ghcr.io/maojiaxu8039/tl-monitor-server:latest

# 停止旧容器（如果存在）
sudo docker stop tl-monitor-server 2>/dev/null || true
sudo docker rm tl-monitor-server 2>/dev/null || true

# 启动新容器
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources:/app/resources \
  ghcr.io/maojiaxu8039/tl-monitor-server:latest
```

### 步骤 6: 验证部署

```bash
# 查看容器状态
sudo docker ps | grep tl-monitor

# 查看日志
sudo docker logs -f tl-monitor-server

# 测试健康检查
curl http://localhost:38457/health
```

### 访问地址

| 地址 | 说明 |
|------|------|
| `http://极空间IP:38457/` | 服务器状态页面 |
| `http://极空间IP:38457/admin` | 管理页面 |
| `http://极空间IP:38457/api/docs` | API 文档 |

---

## 配置说明

### server_config.yaml

```yaml
# 管理员密码
admin_password: "8039"

# 当前赛季ID
season_id: "ss12"

# HTTP 端口（容器内部）
http_port: 8080

# 采集模式配置
scrape_modes:
  - mode: "normal"
    enabled: true
  - mode: "expert"
    enabled: true

# API 配置
api_config:
  qiandao_tag_id_normal: "1560053"
  qiandao_spec_id_normal: "267416"
  qiandao_tag_id_expert: "1560055"
  qiandao_spec_id_expert: "267417"
  luosi_season_id_normal: 1401
  luosi_season_id_expert: 1431

# API 端点
api_endpoints:
  luosi: "http://115.231.176.101:8080"
  qiandao: "https://api.qiandao.com"
  qiandao_fire_endpoint: "/c2c-web/v1/common/currency-spu-price-list"

# 限流配置
rate_limit:
  enabled: true
  requests_per_minute: 60
  burst_size: 10

# CORS 允许的来源
cors_allowed_origins:
  - "http://localhost:5173"
  - "http://100.124.122.65:38457"
```

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `RUST_LOG` | info | 日志级别 |
| `TL_DB_PATH` | /data/tl_monitor.db | 数据库文件路径 |
| `TL_CONFIG_PATH` | /app/config/server_config.yaml | 配置文件路径 |
| `TL_RESOURCES_DIR` | /app/resources | 资源文件目录 |

---

## 维护命令

### 容器管理

```bash
# 查看容器状态
sudo docker ps | grep tl-monitor

# 查看日志
sudo docker logs tl-monitor-server

# 实时查看日志
sudo docker logs -f tl-monitor-server

# 重启容器
sudo docker restart tl-monitor-server

# 停止容器
sudo docker stop tl-monitor-server

# 启动容器
sudo docker start tl-monitor-server

# 删除容器
sudo docker stop tl-monitor-server && sudo docker rm tl-monitor-server
```

### 数据管理

```bash
# 查看数据库大小
sudo docker exec tl-monitor-server ls -lh /data/*.db

# 备份数据库
sudo docker exec tl-monitor-server cp /data/tl_monitor.db /data/backup_$(date +%Y%m%d).db

# 查看赛季信息
sudo docker exec tl-monitor-server sqlite3 /data/tl_monitor.db "SELECT * FROM seasons;"
```

### 日志分析

```bash
# 查看最近采集日志
sudo docker logs --tail 50 tl-monitor-server | grep "采集"

# 查看火价抓取日志
sudo docker logs --tail 50 tl-monitor-server | grep "火价"

# 查看错误日志
sudo docker logs --tail 100 tl-monitor-server | grep -i error

# 导出完整日志
sudo docker logs tl-monitor-server > /tmp/tl-monitor.log
```

### 更新服务

```bash
# 1. 拉取最新镜像
sudo docker pull ghcr.io/maojiaxu8039/tl-monitor-server:latest

# 2. 停止并删除旧容器
sudo docker stop tl-monitor-server && sudo docker rm tl-monitor-server

# 3. 启动新容器
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources:/app/resources \
  ghcr.io/maojiaxu8039/tl-monitor-server:latest

# 4. 验证
sudo docker logs --tail 20 tl-monitor-server
```

---

## 故障排除

### 问题 1: 容器无法启动

**检查项**:

1. 确认 `qiandao_fire` 文件存在且有执行权限
2. 确认 `server_config.yaml` 格式正确
3. 查看容器日志排查具体错误

```bash
sudo docker logs tl-monitor-server
```

### 问题 2: 无法访问页面

**检查项**:

1. 确认端口 38457 未被占用
2. 确认防火墙允许 38457 端口
3. 确认容器状态为"运行中"

### 问题 3: 数据采集失败

**检查项**:

1. 确认网络可以访问 `http://115.231.176.101:8080`
2. 确认 `qiandao_fire` 文件有执行权限
3. 检查采集日志

```bash
sudo docker logs --tail 100 tl-monitor-server | grep -i "error\|fail\|采集"
```

### 问题 4: CORS 跨域错误

**解决方案**: 在 `server_config.yaml` 的 `cors_allowed_origins` 中添加客户端地址。

```yaml
cors_allowed_origins:
  - "http://你的客户端IP:38457"
```

### 问题 5: 赛季显示"已归档"

**解决方案**:

```bash
# 直接修改数据库
sudo docker exec tl-monitor-server sqlite3 /data/tl_monitor.db \
  "UPDATE seasons SET ended_at = NULL, is_current = 1 WHERE id = 'ss12'"

# 重启容器
sudo docker restart tl-monitor-server
```

---

## 技术支持

如遇问题，请提供：

1. `sudo docker ps` 输出
2. `sudo docker logs tl-monitor-server` 日志
3. 配置文件内容
4. 具体错误信息

---

*文档最后更新：2026-05-10*