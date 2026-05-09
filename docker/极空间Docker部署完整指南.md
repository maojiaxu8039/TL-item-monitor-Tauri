# TL Monitor Server - 极空间 Docker 部署完整指南

## 📋 目录

1. [部署前准备](#部署前准备)
2. [Docker 部署步骤](#docker-部署步骤)
3. [配置文件说明](#配置文件说明)
4. [常见问题与解决方案](#常见问题与解决方案)
5. [维护命令](#维护命令)
6. [注意事项](#注意事项)

---

## 部署前准备

### 硬件要求

- **NAS设备**：极空间 Z2Pro 或类似 ARM64 架构 NAS
- **Docker**：NAS 上已安装 Docker
- **网络**：NAS 与外部网络连接正常

### 软件要求

- **Docker基础镜像**：`debian:stable-slim`
- **运行环境**：ARM64 (aarch64)
- **端口**：38457（可自定义）

### 数据目录结构

```
/data_s001/data/udata/real/15510607744/Docker/tl-monitor/
├── tl-monitor-server    # 二进制文件
├── data/               # 数据库文件 (tl_monitor.db)
├── config/            # 配置文件
│   └── server_config.yaml
└── resources/         # 资源文件
    └── qiandao_fire.cjs  # 火价抓取脚本
```

---

## Docker 部署步骤

### 方法一：一键部署（推荐）

#### 步骤1：SSH 连接到 NAS

```bash
ssh -p 10039 15510607744@100.124.122.65
# 密码: !Mjx452212889
```

#### 步骤2：创建目录结构

```bash
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources
```

#### 步骤3：上传文件

将以下文件上传到 NAS：

1. **tl-monitor-server** - ARM64 编译的二进制文件
2. **server_config.yaml** - 服务配置文件
3. **qiandao_fire.cjs** - 火价抓取 Node.js 脚本

#### 步骤4：赋予执行权限

```bash
sudo chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
```

#### 步骤5：创建并启动容器

```bash
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources:/resources \
  -e TL_RESOURCES_DIR=/resources \
  -w /data \
  debian:stable-slim \
  bash -c 'cp /data/tl-monitor-server /tmp/ && chmod +x /data/tl-monitor-server && /data/tl-monitor-server'
```

#### 步骤6：安装 Node.js（用于火价抓取）

```bash
sudo docker exec tl-monitor-server bash -c 'apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs'
```

#### 步骤7：验证部署

```bash
# 查看容器状态
sudo docker ps | grep tl-monitor

# 查看日志
sudo docker logs tl-monitor-server

# 测试火价抓取
sudo docker exec tl-monitor-server node /resources/qiandao_fire.cjs normal
```

### 方法二：使用 docker-compose

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  tl-monitor:
    image: debian:stable-slim
    container_name: tl-monitor-server
    restart: unless-stopped
    ports:
      - "38457:8080"
    volumes:
      - ./data:/data
      - ./config:/config
      - ./resources:/resources
    environment:
      - TL_RESOURCES_DIR=/resources
    working_dir: /data
    command: bash -c 'cp /data/tl-monitor-server /tmp/ && chmod +x /data/tl-monitor-server && /data/tl-monitor-server'
```

启动服务：

```bash
docker-compose up -d

# 安装 Node.js
docker exec tl-monitor-server bash -c 'apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs'
```

---

## 配置文件说明

### server_config.yaml 完整配置

```yaml
# 管理员密码
admin_password: "8039"

# 当前赛季ID
season_id: "ss12"

# HTTP 端口（容器内部端口）
http_port: 8080

# 采集模式配置
scrape_modes:
  - mode: "normal"
    enabled: true
  - mode: "expert"
    enabled: true

# API 配置
api_config:
  qiandao_tag_id_normal: "1560053"      # 千岛普通赛季 tag ID
  qiandao_spec_id_normal: "267416"     # 千岛普通赛季 spec ID
  qiandao_tag_id_expert: "1560055"     # 千岛专家赛季 tag ID
  qiandao_spec_id_expert: "267417"     # 千岛专家赛季 spec ID
  luosi_season_id_normal: 1401         # 洛索普通赛季 ID
  luosi_season_id_expert: 1431         # 洛索专家赛季 ID

# API 端点
api_endpoints:
  luosi: "http://115.231.176.101:8080"      # 洛索 API 地址
  qiandao: "https://api.qiandao.com"         # 千岛 API 地址
  qiandao_fire_endpoint: "/c2c-web/v1/common/currency-spu-price-list"  # 火价 API

# 限流配置
rate_limit:
  enabled: true
  requests_per_minute: 60
  burst_size: 10

# CORS 允许的来源
cors_allowed_origins:
  - "http://localhost:5173"
  - "http://localhost:8080"
  - "http://localhost:38457"
  - "http://100.124.122.65:38457"
  - "http://100.124.122.65:8080"
```

### 配置说明

| 配置项 | 说明 | 示例值 |
|--------|------|--------|
| `admin_password` | 管理界面登录密码 | `8039` |
| `season_id` | 当前赛季 ID | `ss12` |
| `http_port` | 服务监听端口 | `8080` |
| `qiandao_tag_id_*` | 千岛 API tag ID | `1560053` |
| `qiandao_spec_id_*` | 千岛 API spec ID | `267416` |
| `luosi_season_id_*` | 洛索赛季 ID | `1401` |
| `requests_per_minute` | API 限流（每分钟请求数） | `60` |
| `cors_allowed_origins` | 允许跨域访问的地址 | 多个 URL |

---

## 常见问题与解决方案

### 问题1：容器无法启动

**症状**：
```
GLIBC_2.39 not found
```

**原因**：二进制文件编译时使用的 GLIBC 版本高于容器系统的版本。

**解决方案**：
1. 使用 NAS 本地编译，确保 GLIBC 版本兼容
2. 或者使用 `cp /data/tl-monitor-server /tmp/` 然后运行的方式绕过检查

### 问题2：火价采集失败

**症状**：
```
Rust 火价抓取失败
```

**原因**：容器中没有 Node.js 运行环境。

**解决方案**：
```bash
# 在容器中安装 Node.js
sudo docker exec tl-monitor-server bash -c '
    apt-get update && apt-get install -y curl &&
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - &&
    apt-get install -y nodejs
'

# 验证安装
sudo docker exec tl-monitor-server node --version
```

### 问题3：物品采集失败

**症状**：
```
抓取物品失败
```

**可能原因**：
1. 洛索 API 不可用
2. 网络连接问题
3. 赛季 ID 配置错误

**解决方案**：
1. 检查 `luosi_season_id_normal/expert` 配置是否正确
2. 测试洛索 API：`curl http://115.231.176.101:8080/get?season_id=1401`
3. 检查 NAS 网络连接

### 问题4：CORS 跨域错误

**症状**：
```
Access to fetch at 'http://xxx' from origin 'http://xxx' has been blocked by CORS policy
```

**原因**：客户端地址不在 CORS 允许列表中。

**解决方案**：
在 `server_config.yaml` 的 `cors_allowed_origins` 中添加客户端地址：
```yaml
cors_allowed_origins:
  - "http://你的客户端IP:38457"
```

### 问题5：赛季显示"已归档"

**症状**：
```
赛季 ss12 已归档，无法采集
```

**原因**：赛季被标记为已结束。

**解决方案**：
```bash
# 直接修改数据库
sudo docker exec tl-monitor-server sqlite3 /data/tl_monitor.db \
    "UPDATE seasons SET ended_at = NULL, is_current = 1 WHERE id = 'ss12'"

# 重启容器
sudo docker restart tl-monitor-server
```

---

## 维护命令

### 容器管理

```bash
# 查看容器状态
sudo docker ps | grep tl-monitor

# 查看容器日志
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

# 查看数据库内容
sudo docker exec tl-monitor-server sqlite3 /data/tl_monitor.db ".tables"

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

### 配置更新

```bash
# 更新配置文件后重启
sudo docker exec tl-monitor-server cp /config/server_config.yaml /data/
sudo docker restart tl-monitor-server

# 查看当前配置
sudo docker exec tl-monitor-server cat /data/server_config.yaml
```

### 更新服务

```bash
# 1. 停止容器
sudo docker stop tl-monitor-server

# 2. 备份旧二进制
sudo cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server \
      /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server.bak

# 3. 上传新二进制

# 4. 赋予执行权限
sudo chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server

# 5. 启动容器
sudo docker start tl-monitor-server

# 6. 验证
sudo docker logs --tail 20 tl-monitor-server
```

---

## 注意事项

### ⚠️ 重要提醒

1. **数据持久化**
   - 数据库文件保存在 `./data/tl_monitor.db`
   - 删除容器不会丢失数据
   - 定期备份数据库

2. **端口冲突**
   - 默认使用 38457 端口
   - 如果端口被占用，修改 `-p 38457:8080` 为其他端口
   - 确保 NAS 防火墙允许该端口

3. **GLIBC 版本问题**
   - 二进制文件需要在对应 GLIBC 版本系统编译
   - ARM64 NAS 使用 Debian 系统，GLIBC 版本约 2.36
   - 建议在 NAS 本地编译，或使用静态链接

4. **Node.js 依赖**
   - 火价抓取需要 Node.js 运行环境
   - 容器重启后需要重新安装 Node.js（如果用 tmpfs）
   - 确保 `qiandao_fire.cjs` 脚本存在

5. **赛季归档**
   - 当赛季结束时，数据库会标记为"归档"
   - 需要手动取消归档才能继续采集
   - 新赛季需要创建对应的赛季配置

6. **网络稳定性**
   - 采集依赖外部 API（洛索、千岛）
   - 确保 NAS 网络连接稳定
   - 考虑设置采集间隔避免频繁请求

7. **安全建议**
   - 修改默认管理员密码
   - 限制 CORS 允许的来源
   - 定期更新系统和 Docker

8. **资源占用**
   - 内存占用约 50-100MB
   - CPU 占用取决于采集频率
   - 建议设置合理的采集间隔

### 📊 监控建议

建议定期检查：
- 容器是否正常运行
- 日志是否有错误
- 数据库大小是否过大
- API 是否响应正常

---

## 服务访问

### 访问地址

- **主页面**: http://NAS_IP:38457
- **管理界面**: http://NAS_IP:38457/admin
- **API 文档**: http://NAS_IP:38457/api/docs

### 管理界面功能

- 查看采集状态
- 管理赛季
- 配置参数
- 查看历史数据

---

### 镜像管理

#### 创建完整镜像

当服务配置完成后（已安装 Node.js、SQLite 等依赖），可以创建完整镜像以避免重复安装：

```bash
# 在 NAS 上执行
# 1. 创建镜像（包含所有环境）
sudo docker commit tl-monitor-server tl-monitor:full

# 2. 查看镜像
sudo docker images | grep tl-monitor

# 3. 镜像信息
# REPOSITORY   TAG    IMAGE ID       CREATED         SIZE
# tl-monitor   full   xxxxxxxxxxxx   10 seconds ago  345MB
```

#### 使用完整镜像

```bash
# 停止旧容器
sudo docker stop tl-monitor-server
sudo docker rm tl-monitor-server

# 使用完整镜像启动
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources:/resources \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor:/app \
  -e TL_RESOURCES_DIR=/resources \
  -w /data \
  tl-monitor:full \
  bash -c 'cp /app/tl-monitor-server /tmp/ && chmod +x /tmp/tl-monitor-server && /tmp/tl-monitor-server'
```

#### 使用 docker-compose（推荐）

创建 `docker-compose-tl-monitor.yml`：

```yaml
version: '3.8'

services:
  tl-monitor:
    image: tl-monitor:full
    container_name: tl-monitor-server
    restart: unless-stopped
    ports:
      - "38457:8080"
    volumes:
      - ./tl-monitor-server:/app/tl-monitor-server:ro
      - ./data:/data
      - ./config:/config
      - ./resources:/resources
    environment:
      - TL_RESOURCES_DIR=/resources
    working_dir: /data
    command: bash -c 'cp /app/tl-monitor-server /tmp/ && chmod +x /tmp/tl-monitor-server && /tmp/tl-monitor-server'
```

启动服务：
```bash
docker-compose -f docker-compose-tl-monitor.yml up -d
```

#### 更新服务

```bash
# 1. 替换二进制文件
# 将新的 tl-monitor-server 上传到 /app 目录

# 2. 重新创建镜像
sudo docker commit tl-monitor-server tl-monitor:full

# 3. 重启容器
sudo docker restart tl-monitor-server

# 或者使用新镜像创建容器
sudo docker stop tl-monitor-server
sudo docker rm tl-monitor-server
sudo docker run -d --name tl-monitor-server ... tl-monitor:full ...
```

---

## 技术支持

如遇问题，请提供：

1. `sudo docker ps` 输出
2. `sudo docker logs tl-monitor-server` 日志
3. 配置文件内容
4. 具体错误信息

---

*文档最后更新：2026-05-09*
