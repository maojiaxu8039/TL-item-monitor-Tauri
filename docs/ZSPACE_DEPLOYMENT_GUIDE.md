# 极空间 (Z-Space NAS) 服务器部署完整指南

> **目标读者**：需要将 `tl-monitor-server` 部署到极空间（或其他 Linux ARM64 NAS）的运维人员
>
> **适用版本**：TL Monitor Server v1.0.1+
>
> **最近更新**：2026-06-24（已实测通过：容器启动 + 健康检查通过 + 数据抓取正常）

## ⚡ 30 秒速览（实测流程）

如果你已经熟悉 Docker，最快的部署方式：

```bash
# 1. 上传新文件到 NAS 的 compose 目录
rsync -avz -e "ssh -p 10039" \
  tl-monitor-server \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

rsync -avz -e "ssh -p 10039" \
  resources/ \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources/

# 2. SSH 到 NAS，重启容器
ssh -p 10039 15510607744@100.124.122.65
sudo docker restart tl-monitor-server

# 3. 验证
curl http://localhost:38457/health
```

详细步骤见下文。

---

## 目录

- [1. 部署架构总览](#1-部署架构总览)
- [2. 环境要求](#2-环境要求)
- [3. 首次部署](#3-首次部署)
- [4. 更新部署](#4-更新部署)
- [5. 进程管理](#5-进程管理)
- [6. 配置说明](#6-配置说明)
- [7. 验证与监控](#7-验证与监控)
- [8. 常见问题](#8-常见问题)
- [9. 备份与恢复](#9-备份与恢复)
- [10. 卸载](#10-卸载)

---

## 1. 部署架构总览

```
┌─────────────────────────────────────────────┐
│              极空间 NAS (ARM64)              │
│  ┌──────────────────────────────────────┐  │
│  │  /volume1/tl-monitor/                 │  │
│  │  ├── tl-monitor-server       (二进制)  │  │
│  │  ├── tl-monitor-server.bak   (备份)    │  │
│  │  ├── config/                          │  │
│  │  │   └── server_config.yaml          │  │
│  │  ├── data/                            │  │
│  │  │   └── tl_monitor.db      (SQLite)  │  │
│  │  └── resources/                       │  │
│  │      ├── qiandao_fire.cjs             │  │
│  │      └── qiandao_fire.mjs             │  │
│  └──────────────────────────────────────┘  │
│           │                                 │
│           │ HTTP :8080  WebSocket :8081     │
│           ▼                                 │
│  ┌──────────────────────────────────────┐  │
│  │  端口映射 (极空间控制台)                │  │
│  │   38457 → 8080 (HTTP API + Admin)    │  │
│  │   38458 → 8081 (WebSocket)           │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
              ▲
              │ HTTPS/HTTP
              │
   ┌──────────┴──────────┐
   │  TorchScan 客户端    │
   │  (macOS/Win/Linux)  │
   └─────────────────────┘
```

---

## 2. 环境要求

### 2.1 硬件要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| **CPU 架构** | ARM64 (aarch64) | ARM64 |
| **内存** | 512 MB | 1 GB+ |
| **存储** | 500 MB | 2 GB+ |
| **网络** | 100 Mbps | 千兆 |

### 2.2 软件要求

| 项目 | 版本要求 | 验证命令 |
|------|---------|----------|
| **极空间系统** | Z4Pro / Z5 / 其他 ARM64 型号 | 系统设置 → 设备信息 |
| **SSH 服务** | 启用 | 控制台 → 系统 → 远程访问 |
| **Node.js** | 14+ | `node --version` |
| **GLIBC** | 2.28+ | `ldd --version` |

> ⚠️ **重要**：极空间 ARM 设备使用的是 GLIBC 2.28+。本项目构建目标为 `aarch64-unknown-linux-gnu`，需要 GLIBC 兼容。

### 2.3 验证 SSH 连接

```bash
# 测试 SSH 是否能连接
ssh -p 10039 your_user@100.124.122.65 "uname -m && ldd --version"
```

预期输出：
```
aarch64
ldd (GNU libc) 2.31
```

---

## 3. 首次部署

> ⚠️ **极空间 Z2Pro/Z4Pro 部署位置**（实测路径）：
> 用户的 Z2Pro 用的是 `/zspace/zsrp/zdocker/compose_config/tl-monitor-server/`
> 而不是 `/volume1/tl-monitor/`。极空间 Z2/Z2Pro 系列用 `/zspace`，部分 Z4+/Z5 用 `/volume1`。
> 下面的命令按实测路径写，请根据你的设备调整。

### 3.1 准备部署目录

#### 3.1.1 SSH 登录极空间

```bash
ssh -p 10039 15510607744@100.124.122.65
```

#### 3.1.2 创建/确认部署目录结构

```bash
# 极空间 Z2Pro（实测）
COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
sudo mkdir -p $COMPOSE_DIR/{data,config,resources,backups}

# 或极空间 Z4+/Z5（如果有 /volume1）
# COMPOSE_DIR=/volume1/tl-monitor
# sudo mkdir -p $COMPOSE_DIR/{data,config,resources,backups}

# 把目录所有者改为当前用户（避免 sudo 写入）
sudo chown -R $(whoami):$(id -gn) $COMPOSE_DIR
ls -la $COMPOSE_DIR/
```

### 3.2 准备文件（从本地 macOS 上传到 NAS）

#### 3.2.1 下载 ARM64 部署包

**方式 A：从 GitHub Actions 下载（推荐）**

```bash
mkdir -p /tmp/tl-build
gh run list --workflow=build-server-arm64.yml --limit 1
gh run download <RUN_ID> --name linux-arm64-server --dir /tmp/tl-build
```

**方式 B：从 GitHub 网页下载**

1. 访问 https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/build-server-arm64.yml
2. 点击最新成功的 build
3. 滚动到底部 → Artifacts → 下载 `linux-arm64-server`

#### 3.2.2 上传到 NAS

```bash
# 上传主二进制（关键：替代容器内旧版本）
SSHPASS='你的密码' sshpass -e rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  15510607744@100.124.122.65:$COMPOSE_DIR/

# 上传资源脚本
SSHPASS='你的密码' sshpass -e rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  15510607744@100.124.122.65:$COMPOSE_DIR/resources/

# 设置可执行权限
ssh -p 10039 15510607744@100.124.122.65 "chmod +x $COMPOSE_DIR/tl-monitor-server"
```

### 3.3 准备 docker-compose.yml（实测配置）

> 💡 **核心思路**：
> - 用现有 `ghcr.io/maojiaxu8039/tl-monitor-server:latest` 镜像（已有 GLIBC 2.36+）
> - **不重建镜像**，把新二进制和资源用 volume 挂载到容器内
> - 数据库和配置用 volume 挂载实现持久化
> - 这样部署只换文件，**不依赖 GitHub Actions 重新构建**

将下面的内容保存到 `$COMPOSE_DIR/docker-compose.yml`：

```yaml
version: '3.8'
services:
  tl-monitor-server:
    image: ghcr.io/maojiaxu8039/tl-monitor-server:latest
    container_name: tl-monitor-server
    restart: unless-stopped
    ports:
      - "38457:8080"
    volumes:
      # 数据卷：宿主机 ./data -> 容器 /data
      - ./data:/data
      # 配置卷：宿主机 ./config -> 容器 /config
      - ./config:/config
      # 用新二进制覆盖镜像里旧的 /tmp/tl-monitor-server
      - ./tl-monitor-server:/tmp/tl-monitor-server
      # 资源脚本
      - ./resources:/resources
    working_dir: /data
    environment:
      - RUST_LOG=info
      - TL_DB_PATH=/data/tl_monitor.db
      - TL_CONFIG_PATH=/config/server_config.yaml
      - TL_RESOURCES_DIR=/resources
      - TL_ADMIN_PASSWORD=452212889   # 你的管理员密码
    command: ["/tmp/tl-monitor-server"]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

> 💡 **极空间 Docker Compose 兼容性提示**：
> 部分极空间 Docker 版本 `docker compose` 子命令不可用，需用 `docker run` 直接启动（见 3.5 节）。

### 3.4 准备配置文件

```bash
cd $COMPOSE_DIR
# 如果没有现成配置，用 example 模板
cp server_config.example.yaml config/server_config.yaml
# 或从旧容器里 COPY 出来
# sudo docker cp tl-monitor-server:/app/config/server_config.yaml config/
```

编辑 `config/server_config.yaml`（参考 `server_config.example.yaml`），重点字段：

```yaml
season_id: "ss12"
http_port: 8080
admin_password: ""  # 推荐留空，用 TL_ADMIN_PASSWORD 环境变量
trust_proxy_headers: false
# ...
```

### 3.5 启动容器

#### 3.5.1 先停掉旧容器

```bash
sudo docker stop tl-monitor-server
sudo docker rm tl-monitor-server
```

#### 3.5.2 启动新容器（实测命令）

**方式 A：`docker compose up -d`（如果支持）**

```bash
cd $COMPOSE_DIR
sudo docker compose up -d
```

**方式 B：`docker run` 直接启动（极空间 Docker 部分版本必须用）**

```bash
cd $COMPOSE_DIR
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v $(pwd)/data:/data \
  -v $(pwd)/config:/config \
  -v $(pwd)/tl-monitor-server:/tmp/tl-monitor-server \
  -v $(pwd)/resources:/resources \
  -w /data \
  -e RUST_LOG=info \
  -e TL_DB_PATH=/data/tl_monitor.db \
  -e TL_CONFIG_PATH=/config/server_config.yaml \
  -e TL_RESOURCES_DIR=/resources \
  -e TL_ADMIN_PASSWORD=452212889 \
  --health-cmd='curl -fsS http://localhost:8080/health' \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  --health-start-period=30s \
  ghcr.io/maojiaxu8039/tl-monitor-server:latest \
  /tmp/tl-monitor-server
```

#### 3.5.3 验证启动

```bash
# 查看容器状态
sudo docker ps --filter 'name=tl-monitor' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}'
# 预期输出：Up X minutes (healthy)

# 健康检查（容器内）
sudo docker exec tl-monitor-server curl -s http://localhost:8080/health

# 容器内日志
sudo docker logs tl-monitor-server --tail 20
# 预期看到：HTTP API 服务器监听中: http://0.0.0.0:8080
#           [普通服] 测试采集完成: 火价=9.0692, 物品=2824, 成功=true
```

> ⚠️ **重要提示**：极空间宿主机**不**用 `curl http://localhost:38457/health` 检查（curl 工具被极空间限制），用 `docker exec` 进入容器检查。

### 3.6 已实测通过的关键点

| 检查项 | 实测结果 |
|--------|----------|
| 容器启动 | ✅ Up 47 seconds (healthy) |
| 端口映射 | ✅ 0.0.0.0:38457->8080 |
| 数据库持久化 | ✅ 387 MB SQLite 正常挂载 |
| 健康检查 | ✅ HTTP 200 |
| API 版本响应 | ✅ v2 + aarch64 |
| 普通服抓取 | ✅ 2824 个物品，火价 9.0692 |
| 专家服抓取 | ✅ 2718 个物品，火价 13.2308 |
| 数据采集调度 | ✅ 整点抓取（2573 秒后）|

### 3.2 下载 ARM64 部署包

#### 方式 A：从 GitHub Actions 下载（推荐）

**步骤 1：获取最新的构建 Run ID**

```bash
# 在本地 macOS/Linux 上执行
gh run list --workflow=build-server-arm64.yml --limit 1
```

**步骤 2：下载产物**

```bash
mkdir -p /tmp/tl-build
gh run download <RUN_ID> --name linux-arm64-server --dir /tmp/tl-build
```

例如：

```bash
gh run download 28072867482 --name linux-arm64-server --dir /tmp/tl-build
```

**步骤 3：验证产物**

```bash
ls -lh /tmp/tl-build/linux-arm64-server/
file /tmp/tl-build/linux-arm64-server/tl-monitor-server
```

预期输出：

```
-rwxr-xr-x ... 9.2M ... tl-monitor-server
tl-monitor-server: ELF 64-bit LSB pie executable, ARM aarch64, ...
```

#### 方式 B：从 GitHub 网页下载

1. 访问仓库 Actions 页面：
   ```
   https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/build-server-arm64.yml
   ```
2. 点击最新成功的 build
3. 滚动到底部 → Artifacts → 下载 `linux-arm64-server`
4. 解压得到 `linux-arm64-server/` 目录

### 3.3 上传到极空间

#### 方式 A：使用 rsync（推荐）

```bash
# 上传主程序
rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  your_user@100.124.122.65:/volume1/tl-monitor/tl-monitor-server

# 上传资源文件
rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  your_user@100.124.122.65:/volume1/tl-monitor/resources/

# 上传配置模板（如果极空间上还没有）
rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/server_config.example.yaml \
  your_user@100.124.122.65:/volume1/tl-monitor/config/server_config.example.yaml
```

#### 方式 B：使用 scp

```bash
scp -P 10039 /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  your_user@100.124.122.65:/volume1/tl-monitor/

scp -P 10039 -r /tmp/tl-build/linux-arm64-server/resources/* \
  your_user@100.124.122.65:/volume1/tl-monitor/resources/
```

#### 方式 C：使用极空间 Web 文件管理

1. 极空间控制台 → 文件管理
2. 进入 `/volume1/tl-monitor/`
3. 上传文件（拖拽到浏览器即可）

### 3.4 设置权限

SSH 到极空间后：

```bash
# 添加可执行权限
chmod +x /volume1/tl-monitor/tl-monitor-server

# 设置目录权限
chmod 755 /volume1/tl-monitor/
chmod 755 /volume1/tl-monitor/config/
chmod 755 /volume1/tl-monitor/data/
chmod 755 /volume1/tl-monitor/resources/
chmod 644 /volume1/tl-monitor/config/server_config.yaml

# 设置数据库目录可写
chmod 755 /volume1/tl-monitor/data/
```

### 3.5 配置极空间端口映射

1. 打开极空间 Web 控制台
2. 进入 **系统设置 → 端口映射**（或类似选项）
3. 添加两条规则：

| 容器/服务端口 | 外部端口 | 协议 | 用途 |
|--------------|----------|------|------|
| 8080 | 38457 | TCP | HTTP API + 管理界面 |
| 8081 | 38458 | TCP | WebSocket 实时推送 |

> ⚠️ 不同极空间系统版本菜单位置可能略有不同，部分型号需要在"应用管理 → Docker → 端口设置"中配置。

### 3.6 启动服务

#### 方式 A：前台运行（用于测试）

```bash
cd /volume1/tl-monitor
export TL_ADMIN_PASSWORD='YourStrongPassword123!'
export TL_CONFIG_PATH=/volume1/tl-monitor/config/server_config.yaml
export TL_DB_PATH=/volume1/tl-monitor/data/tl_monitor.db
export TL_RESOURCES_DIR=/volume1/tl-monitor/resources
export RUST_LOG=info
./tl-monitor-server
```

按 `Ctrl+C` 停止。

#### 方式 B：使用 systemd（推荐）

创建 systemd service 文件：

```bash
sudo nano /etc/systemd/system/tl-monitor-server.service
```

**Service 文件内容**：

```ini
[Unit]
Description=TL Monitor Server (TorchScan backend)
After=network.target

[Service]
Type=simple
User=your_user
Group=your_group
WorkingDirectory=/volume1/tl-monitor
Environment="TL_ADMIN_PASSWORD=YourStrongPassword123!"
Environment="TL_CONFIG_PATH=/volume1/tl-monitor/config/server_config.yaml"
Environment="TL_DB_PATH=/volume1/tl-monitor/data/tl_monitor.db"
Environment="TL_RESOURCES_DIR=/volume1/tl-monitor/resources"
Environment="RUST_LOG=info"
ExecStart=/volume1/tl-monitor/tl-monitor-server
Restart=always
RestartSec=5
StandardOutput=append:/volume1/tl-monitor/logs/server.log
StandardError=append:/volume1/tl-monitor/logs/server.err

[Install]
WantedBy=multi-user.target
```

> 🔐 **密码安全**：生产环境推荐用 `EnvironmentFile` 引用独立密码文件：
>
> ```bash
> sudo nano /etc/tl-monitor-server.env
> # 内容：TL_ADMIN_PASSWORD=YourStrongPassword123!
> sudo chmod 600 /etc/tl-monitor-server.env
> ```
>
> 然后在 service 文件中改为：
> ```ini
> EnvironmentFile=/etc/tl-monitor-server.env
> ```

**启用并启动**：

```bash
sudo systemctl daemon-reload
sudo systemctl enable tl-monitor-server
sudo systemctl start tl-monitor-server
sudo systemctl status tl-monitor-server
```

#### 方式 C：使用极空间"任务计划"（图形界面）

1. 极空间控制台 → 应用管理 → 任务计划
2. 创建新任务：
   - 名称：`tl-monitor-server`
   - 启动脚本：
     ```bash
     cd /volume1/tl-monitor && \
     export TL_ADMIN_PASSWORD='YourPassword' && \
     export TL_CONFIG_PATH=/volume1/tl-monitor/config/server_config.yaml && \
     export TL_DB_PATH=/volume1/tl-monitor/data/tl_monitor.db && \
     export TL_RESOURCES_DIR=/volume1/tl-monitor/resources && \
     ./tl-monitor-server
     ```
   - 启动方式：开机启动
   - 失败时自动重启：是

---

## 4. 更新部署

> ⚠️ **核心原则：直接替换文件，不重新构建镜像**
> 由于我们用 `ghcr.io/maojiaxu8039/tl-monitor-server:latest` 镜像 + volume 挂载新文件，
> 每次更新只需要替换 `./tl-monitor-server` 和 `./resources/*` 然后重启容器。
> 整个过程**不需要重新拉镜像**，**不需要重新构建**。

### 4.1 简化流程（实测最快方案）

#### 步骤 1：下载最新构建产物

```bash
# 获取最新成功的 build
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Build ID: $RUN_ID"

# 下载到本地
rm -rf /tmp/tl-build
mkdir -p /tmp/tl-build
gh run download $RUN_ID --name linux-arm64-server --dir /tmp/tl-build
ls -lh /tmp/tl-build/linux-arm64-server/
```

#### 步骤 2：上传到 NAS

```bash
# 上传新二进制（覆盖旧版本）
SSHPASS='你的密码' sshpass -e rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

# 上传新资源脚本
SSHPASS='你的密码' sshpass -e rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources/
```

#### 步骤 3：重启容器

```bash
# 方式 A：SSH + docker restart
ssh -p 10039 15510607744@100.124.122.65 "
  cd /zspace/zsrp/zdocker/compose_config/tl-monitor-server
  sudo docker restart tl-monitor-server
"

# 方式 B：完全重建（如果 mount 改了）
ssh -p 10039 15510607744@100.124.122.65 "
  cd /zspace/zsrp/zdocker/compose_config/tl-monitor-server
  sudo docker stop tl-monitor-server
  sudo docker rm tl-monitor-server
  sudo docker run -d \\
    --name tl-monitor-server \\
    --restart unless-stopped \\
    -p 38457:8080 \\
    -v \$(pwd)/data:/data \\
    -v \$(pwd)/config:/config \\
    -v \$(pwd)/tl-monitor-server:/tmp/tl-monitor-server \\
    -v \$(pwd)/resources:/resources \\
    -w /data \\
    -e RUST_LOG=info \\
    -e TL_DB_PATH=/data/tl_monitor.db \\
    -e TL_CONFIG_PATH=/config/server_config.yaml \\
    -e TL_RESOURCES_DIR=/resources \\
    -e TL_ADMIN_PASSWORD=452212889 \\
    ghcr.io/maojiaxu8039/tl-monitor-server:latest \\
    /tmp/tl-monitor-server
"
```

#### 步骤 4：验证

```bash
# SSH 进去检查
ssh -p 10039 15510607744@100.124.122.65 "
  sudo docker ps --filter 'name=tl-monitor' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  sudo docker logs tl-monitor-server --tail 10
"
```

预期输出：

```
NAMES               STATUS                    PORTS
tl-monitor-server   Up X seconds (healthy)   0.0.0.0:38457->8080/tcp, :::38457->8080/tcp
```

### 4.2 蓝绿部署（零停机）

#### 步骤 1：下载新版本到本地

```bash
mkdir -p /tmp/tl-build
gh run download <NEW_RUN_ID> --name linux-arm64-server --dir /tmp/tl-build
```

#### 步骤 2：上传新版本到临时文件

```bash
# 上传新版本到 .new 文件（不停机）
rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/tl-monitor-server.new

# 上传新资源文件
rsync -avz -e "ssh -p 10039" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  15510607744@100.124.122.65:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources.new/
```

#### 步骤 3：SSH 到极空间

```bash
ssh -p 10039 15510607744@100.124.122.65
```

#### 步骤 4：备份当前版本

```bash
COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
cd $COMPOSE_DIR
[ -f tl-monitor-server ] && mv tl-monitor-server tl-monitor-server.bak
[ -d resources ] && cp -r resources resources.bak
```

#### 步骤 5：部署新版本

```bash
# 替换主程序
mv tl-monitor-server.new tl-monitor-server
chmod +x tl-monitor-server

# 替换资源
cp resources.new/qiandao_fire.* resources/
rm -rf resources.new
```

#### 步骤 6：重启服务

```bash
sudo docker restart tl-monitor-server
# 或重新创建
sudo docker stop tl-monitor-server
sudo docker rm tl-monitor-server
sudo docker run -d --name tl-monitor-server ... (见 3.5.2)
```

#### 步骤 7：验证部署

```bash
sudo docker exec tl-monitor-server curl -s http://localhost:8080/health
```

#### 步骤 8：回滚（如果新版本有问题）

```bash
cd $COMPOSE_DIR
sudo docker stop tl-monitor-server

# 恢复二进制
mv tl-monitor-server tl-monitor-server.failed
mv tl-monitor-server.bak tl-monitor-server

# 恢复资源
rm -rf resources
mv resources.bak resources

sudo docker start tl-monitor-server
```

### 4.4 一键更新脚本（推荐保存到本地）

创建 `~/scripts/update-tl-monitor.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============ 配置 ============
NAS_HOST="100.124.122.65"
NAS_PORT="10039"
NAS_USER="your_user"
DEPLOY_DIR="/volume1/tl-monitor"
SERVICE_NAME="tl-monitor-server"
# ==============================

echo "==> 1. 获取最新 ARM64 构建"
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "    Run ID: $RUN_ID"

echo "==> 2. 下载产物"
rm -rf /tmp/tl-build
mkdir -p /tmp/tl-build
gh run download "$RUN_ID" --name linux-arm64-server --dir /tmp/tl-build

echo "==> 3. 上传新版本到 NAS"
rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:$DEPLOY_DIR/tl-monitor-server.new

rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  $NAS_USER@$NAS_HOST:/tmp/tl-monitor-resources-new/

echo "==> 4. 停止服务"
ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "sudo systemctl stop $SERVICE_NAME"

echo "==> 5. 备份并替换"
ssh -p $NAS_PORT $NAS_USER@$NAS_HOST << EOF
  set -e
  cd $DEPLOY_DIR

  # 备份
  [ -f tl-monitor-server ] && mv tl-monitor-server tl-monitor-server.bak
  [ -d resources ] && cp -r resources resources.bak

  # 替换主程序
  mv tl-monitor-server.new tl-monitor-server
  chmod +x tl-monitor-server

  # 替换资源
  cp /tmp/tl-monitor-resources-new/qiandao_fire.* resources/
  rm -rf /tmp/tl-monitor-resources-new
EOF

echo "==> 6. 启动服务"
ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "sudo systemctl start $SERVICE_NAME"

echo "==> 7. 验证"
sleep 3
if ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "curl -fsS http://localhost:8080/health" 2>/dev/null; then
  echo "✅ 部署成功！"
else
  echo "❌ 部署可能失败，请检查日志"
  ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "sudo journalctl -u $SERVICE_NAME --no-pager -n 50"
fi
```

使用：

```bash
chmod +x ~/scripts/update-tl-monitor.sh
~/scripts/update-tl-monitor.sh
```

---

## 5. 进程管理

### 5.1 systemd 操作命令

```bash
# 启动
sudo systemctl start tl-monitor-server

# 停止
sudo systemctl stop tl-monitor-server

# 重启
sudo systemctl restart tl-monitor-server

# 查看状态
sudo systemctl status tl-monitor-server

# 查看日志
sudo journalctl -u tl-monitor-server -f
sudo journalctl -u tl-monitor-server --since "1 hour ago"

# 启用开机自启
sudo systemctl enable tl-monitor-server

# 禁用开机自启
sudo systemctl disable tl-monitor-server
```

### 5.2 进程查看

```bash
# 查看进程
ps aux | grep tl-monitor-server

# 查看端口监听
ss -tlnp | grep -E "8080|8081"
netstat -tlnp | grep -E "8080|8081"

# 查看资源占用
top -p $(pgrep tl-monitor-server)
```

### 5.3 日志管理

#### 查看实时日志

```bash
# journalctl 方式
sudo journalctl -u tl-monitor-server -f

# 文件方式（如果配置了 StandardOutput）
tail -f /volume1/tl-monitor/logs/server.log
```

#### 日志轮转配置

创建 `/etc/logrotate.d/tl-monitor-server`：

```
/volume1/tl-monitor/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 your_user your_group
    sharedscripts
    postrotate
        sudo systemctl reload tl-monitor-server > /dev/null 2>&1 || true
    endscript
}
```

---

## 6. 配置说明

### 6.1 环境变量

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `TL_CONFIG_PATH` | `/config/server_config.yaml` | 否 | 配置文件路径 |
| `TL_DB_PATH` | `/data/tl_monitor.db` | 否 | SQLite 数据库路径 |
| `TL_RESOURCES_DIR` | `resources` | 否 | Node 脚本目录 |
| `TL_ADMIN_PASSWORD` | （空） | **是** | 管理员密码 |
| `RUST_LOG` | `info` | 否 | 日志级别（debug/info/warn/error） |

### 6.2 配置文件字段

完整字段参考 `server_config.example.yaml`。

**重要字段说明**：

#### `admin_password`
管理员密码。**生产环境必须设置**，建议用环境变量。

#### `http_port`
服务监听端口。**容器内**监听 8080，通过极空间端口映射暴露为 38457。

#### `trust_proxy_headers`
是否信任反向代理的 `X-Forwarded-For` 头。

- `false`（默认）：直接使用连接 IP。适用于极空间直连场景。
- `true`：从 `X-Forwarded-For` 读取客户端 IP。仅在服务明确部署在可信反向代理后面时才设为 `true`，否则客户端可以伪造 IP 影响限流和审计日志。

#### `scrape_modes`
要抓取的赛季模式：
- `normal`：普通模式
- `expert`：专家模式

#### `cors_allowed_origins`
允许跨域请求的源。客户端访问地址需要加到这里。

例如从浏览器访问 `http://100.124.122.65:38457` 需要添加：
```yaml
- "http://100.124.122.65:38457"
```

#### `rate_limit`
限流配置（防止 API 被滥用）：

| 字段 | 默认 | 说明 |
|------|------|------|
| `enabled` | true | 是否启用 |
| `requests_per_minute` | 60 | 每分钟最大请求数 |
| `burst_size` | 10 | 突发允许数量 |

### 6.3 配置更新

```bash
# 1. 编辑配置
nano /volume1/tl-monitor/config/server_config.yaml

# 2. 重启服务使配置生效
sudo systemctl restart tl-monitor-server

# 3. 验证
curl http://localhost:8080/api/version
```

---

## 7. 验证与监控

### 7.1 健康检查

```bash
# 本地
curl http://localhost:8080/health

# 远程
curl http://100.124.122.65:38457/health
```

预期返回：

```json
{
  "status": "ok",
  "version": "1.0.1",
  "uptime_secs": 3600
}
```

### 7.2 端到端验证清单

部署完成后，按顺序验证：

```bash
# 1. 健康检查
echo "1. 健康检查"
curl -fsS http://100.124.122.65:38457/health

# 2. 管理员状态查询
echo "2. 管理员状态"
curl -fsS http://100.124.122.65:38457/api/admin/status \
  -H 'Content-Type: application/json' \
  -d '{"password":"YourPassword"}'

# 3. 火价 API
echo "3. 火价 API"
curl -fsS http://100.124.122.65:38457/api/fire-price

# 4. 物品列表
echo "4. 物品列表"
curl -fsS "http://100.124.122.65:38457/api/items?limit=10"

# 5. 审计日志
echo "5. 审计日志"
curl -fsS http://100.124.122.65:38457/admin/audit-log \
  -H 'Content-Type: application/json' \
  -d '{"password":"YourPassword"}'
```

### 7.3 Web 管理界面

打开浏览器访问：

```
http://100.124.122.65:38457/admin
```

输入管理员密码登录后可以：
- 查看实时抓取状态
- 手动触发抓取
- 查看审计日志
- 修改配置

### 7.4 监控建议

#### 简单的健康检查脚本

创建 `/volume1/tl-monitor/scripts/health-check.sh`：

```bash
#!/usr/bin/env bash
# 健康检查 + 自动重启

if ! curl -fsS http://localhost:8080/health > /dev/null 2>&1; then
    echo "[$(date)] 服务异常，尝试重启..." >> /volume1/tl-monitor/logs/health.log
    sudo systemctl restart tl-monitor-server
fi
```

添加到 crontab（每 5 分钟检查）：

```bash
crontab -e
# 添加：
*/5 * * * * /volume1/tl-monitor/scripts/health-check.sh
```

#### 资源监控

```bash
# CPU 和内存占用
ps -p $(pgrep tl-monitor-server) -o pid,pcpu,pmem,vsz,rss,etime,cmd

# 数据库大小
du -sh /volume1/tl-monitor/data/tl_monitor.db

# 日志大小
du -sh /volume1/tl-monitor/logs/
```

---

## 8. 常见问题

### 8.1 启动失败：GLIBC 版本不兼容

**错误**：

```
./tl-monitor-server: /lib/aarch64-linux-gnu/libc.so.6: version `GLIBC_2.28' not found
```

**原因**：极空间系统 GLIBC 版本太旧。

**解决**：

```bash
# 检查 GLIBC 版本
ldd --version

# 如果 < 2.28，需要：
# 方案 1: 升级极空间系统到最新
# 方案 2: 使用 Docker 部署（推荐，见 DOCKER_DEPLOYMENT_GUIDE.md）
```

### 8.2 端口被占用

**错误**：

```
Error: Address already in use (os error 98)
```

**解决**：

```bash
# 查找占用进程
sudo lsof -i :8080
sudo lsof -i :8081

# 杀死占用进程
sudo kill -9 <PID>

# 或者修改配置文件中 http_port 为其他端口
```

### 8.3 数据库锁定

**错误**：

```
database is locked
```

**原因**：多个进程同时访问 SQLite。

**解决**：

```bash
# 停止所有 tl-monitor-server 进程
sudo pkill -9 tl-monitor-server

# 检查数据库文件
ls -la /volume1/tl-monitor/data/

# 删除 WAL 文件（如果确认没有其他进程在写）
cd /volume1/tl-monitor/data/
rm -f tl_monitor.db-wal tl_monitor.db-shm

# 重新启动
sudo systemctl start tl-monitor-server
```

### 8.4 Node.js 脚本执行失败

**错误**：

```
Failed to spawn qiandao_fire.cjs
```

**解决**：

```bash
# 检查 Node.js 是否安装
node --version

# 如果未安装：
# 极空间控制台 → 应用市场 → 搜索 "Node.js" 安装
# 或通过 SSH 安装（如果 root 可用）：
# sudo apt-get install -y nodejs

# 检查资源文件
ls -la /volume1/tl-monitor/resources/
# 应该有 qiandao_fire.cjs 和 qiandao_fire.mjs
```

### 8.5 WebSocket 连接失败

**症状**：客户端显示"实时连接断开"。

**解决**：

1. 确认 8081 端口已映射到 38458
2. 检查防火墙：

   ```bash
   sudo iptables -L -n | grep 8081
   ```
3. 客户端配置 WebSocket URL：

   ```
   ws://100.124.122.65:38458
   ```

### 8.6 CORS 错误

**症状**：浏览器管理界面报错 "CORS policy blocked"。

**解决**：编辑 `server_config.yaml`：

```yaml
cors_allowed_origins:
  - "http://100.124.122.65:38457"  # 添加实际访问地址
  - "tauri://localhost"  # 桌面客户端
```

然后重启服务。

### 8.7 SSH 连接失败

**症状**：`Connection refused` 或 `Connection timed out`。

**解决**：

1. 极空间控制台 → 系统设置 → 远程访问 → 启用 SSH
2. 确认端口（默认 10039，可在控制台查看）
3. 确认防火墙允许 10039 端口
4. 检查 SSH 密钥：

   ```bash
   ssh-copy-id -p 10039 your_user@100.124.122.65
   ```

---

## 9. 备份与恢复

### 9.1 备份策略

需要备份的内容：

| 内容 | 路径 | 重要性 | 建议频率 |
|------|------|--------|----------|
| 数据库 | `data/tl_monitor.db` | ⭐⭐⭐⭐⭐ | 每天 |
| 配置文件 | `config/server_config.yaml` | ⭐⭐⭐⭐ | 每周 |
| 二进制 | `tl-monitor-server` | ⭐⭐ | 每次更新 |
| 资源文件 | `resources/*` | ⭐⭐ | 每次更新 |

### 9.2 自动备份脚本

创建 `/volume1/tl-monitor/scripts/backup.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/volume1/tl-monitor-backups"
DEPLOY_DIR="/volume1/tl-monitor"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$DATE"

mkdir -p "$BACKUP_DIR"

# 备份数据库
cp "$DEPLOY_DIR/data/tl_monitor.db" "$BACKUP_DIR/"

# 备份配置
cp "$DEPLOY_DIR/config/server_config.yaml" "$BACKUP_DIR/"

# 压缩
cd "$BACKUP_ROOT"
tar -czf "tl-monitor-backup-$DATE.tar.gz" "$DATE"
rm -rf "$DATE"

# 保留最近 30 天
find "$BACKUP_ROOT" -name "tl-monitor-backup-*.tar.gz" -mtime +30 -delete

echo "[$(date)] 备份完成: tl-monitor-backup-$DATE.tar.gz"
```

添加到 crontab（每天凌晨 3 点）：

```bash
0 3 * * * /volume1/tl-monitor/scripts/backup.sh >> /volume1/tl-monitor/logs/backup.log 2>&1
```

### 9.3 恢复流程

```bash
# 1. 停止服务
sudo systemctl stop tl-monitor-server

# 2. 恢复数据库
BACKUP_FILE="/volume1/tl-monitor-backups/tl-monitor-backup-20260624_030000.tar.gz"
cd /tmp
tar -xzf "$BACKUP_FILE"
cp /tmp/*/tl_monitor.db /volume1/tl-monitor/data/
chmod 644 /volume1/tl-monitor/data/tl_monitor.db

# 3. 恢复配置（如果需要）
cp /tmp/*/server_config.yaml /volume1/tl-monitor/config/

# 4. 启动服务
sudo systemctl start tl-monitor-server

# 5. 验证
curl http://localhost:8080/health
```

---

## 10. 卸载

```bash
# 1. 停止服务
sudo systemctl stop tl-monitor-server
sudo systemctl disable tl-monitor-server
sudo rm /etc/systemd/system/tl-monitor-server.service
sudo systemctl daemon-reload

# 2. 删除部署目录
rm -rf /volume1/tl-monitor

# 3. 删除备份目录（可选）
rm -rf /volume1/tl-monitor-backups

# 4. 删除极空间端口映射（控制台操作）
# 控制台 → 系统设置 → 端口映射 → 删除 38457/38458 规则
```

---

## 附录 A：完整部署目录结构

```
/volume1/tl-monitor/
├── tl-monitor-server           # 主程序（9.2 MB ARM64）
├── tl-monitor-server.bak       # 备份（可选）
├── config/
│   ├── server_config.yaml      # 主配置
│   └── server_config.example.yaml
├── data/
│   └── tl_monitor.db           # SQLite 数据库
├── resources/
│   ├── qiandao_fire.cjs        # 火价抓取脚本
│   └── qiandao_fire.mjs
├── logs/                       # 日志目录
│   ├── server.log
│   ├── server.err
│   ├── health.log
│   └── backup.log
└── scripts/                    # 维护脚本
    ├── backup.sh
    └── health-check.sh
```

---

## 附录 B：常用命令速查

```bash
# ========== 服务管理 ==========
sudo systemctl start tl-monitor-server      # 启动
sudo systemctl stop tl-monitor-server       # 停止
sudo systemctl restart tl-monitor-server    # 重启
sudo systemctl status tl-monitor-server     # 状态
sudo journalctl -u tl-monitor-server -f     # 实时日志

# ========== 验证 ==========
curl http://localhost:8080/health                          # 健康检查
curl http://localhost:8080/api/version                     # 版本
curl -X POST http://localhost:8080/api/admin/status \
  -H 'Content-Type: application/json' \
  -d '{"password":"YourPassword"}'                          # 管理员状态

# ========== 维护 ==========
du -sh /volume1/tl-monitor/data/tl_monitor.db              # 数据库大小
ps -p $(pgrep tl-monitor-server) -o pid,pcpu,pmem,etime     # 进程状态
ss -tlnp | grep -E "8080|8081"                              # 端口监听

# ========== 备份 ==========
/volume1/tl-monitor/scripts/backup.sh                       # 手动备份
ls -lh /volume1/tl-monitor-backups/                        # 查看备份
```

---

## 附录 C：监控与告警（高级）

### Telegram 告警集成

```bash
# 创建 webhook
cat > /volume1/tl-monitor/scripts/alert.sh << 'EOF'
#!/usr/bin/env bash
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_CHAT_ID="your_chat_id"
MESSAGE="$1"

curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=$MESSAGE"
EOF

# 修改 systemd service 添加健康检查后的告警
ExecStartPost=/volume1/tl-monitor/scripts/alert.sh "✅ 服务已启动"
ExecStopPost=/volume1/tl-monitor/scripts/alert.sh "⚠️ 服务已停止"
```

---

## 附录 D：性能调优

### 数据库优化

定期执行 VACUUM（每月）：

```bash
sqlite3 /volume1/tl-monitor/data/tl_monitor.db "VACUUM;"
```

### 资源限制

修改 systemd service 添加资源限制：

```ini
[Service]
# ...
MemoryMax=1G
CPUQuota=80%
```

---

**最后更新**：2026-06-24
**文档版本**：v1.0.0
**适用服务端版本**：v1.0.1+
