# 极空间 NAS 服务器部署指南

> **目标**：将 `tl-monitor-server` 部署到极空间（Z2Pro / Z4Pro / Z5 等 Linux ARM64 NAS）
>
> **方法**：Docker 部署（**直接用现有镜像 + 挂载新文件**，不重建镜像）
>
> **已实测**：2026-06-24 在 Z2Pro（100.124.122.65）部署成功

---

## 目录

- [核心思路](#核心思路)
- [30 秒速览](#30-秒速览)
- [环境信息](#环境信息)
- [首次部署](#首次部署)
- [更新部署](#更新部署)
- [常见操作](#常见操作)
- [常见问题](#常见问题)
- [回滚方案](#回滚方案)

---

## 核心思路

**直接用现成的 Docker 镜像 + volume 挂载新文件**，**不**重新构建镜像：

| 组件 | 来源 | 说明 |
|------|------|------|
| Docker 镜像 | `ghcr.io/maojiaxu8039/tl-monitor-server:latest` | 已有，无需构建 |
| 二进制 | `./tl-monitor-server` (volume 挂载) | 覆盖容器内旧版 |
| 资源脚本 | `./resources/` (volume 挂载) | 覆盖容器内旧版 |
| 数据库 | `./data/tl_monitor.db` (volume 挂载) | 持久化存储 |
| 配置 | `./config/server_config.yaml` (volume 挂载) | 持久化存储 |

**为什么这么做？**
- 容器内的 `glibc 2.41` 与宿主机 `glibc 2.31` 不兼容
- 但**容器内有独立的 glibc**，所以在容器内运行高版本二进制没问题
- 不需要 GitHub Actions 重新构建镜像
- 不需要拉任何基础镜像
- 更新只需要替换 2 个文件 + 重启容器

---

## 30 秒速览

```bash
# 1. 下载最新构建（从 GitHub Actions artifact）
mkdir -p /tmp/tl-build && cd /tmp/tl-build
gh run download $(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId') \
  --name linux-arm64-server

# 2. 上传到 NAS（替换二进制和资源）
SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources/

# 3. 重启容器
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker restart tl-monitor-server"

# 4. 验证
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker exec tl-monitor-server curl -s http://localhost:8080/health"
```

**完成！** 整个过程不超过 1 分钟。

---

## 环境信息

### 目标设备

| 项 | 值 |
|----|-----|
| 型号 | 极空间 Z2Pro |
| SSH 端口 | 10039 |
| Tailscale IP | 100.124.122.65 |
| 架构 | aarch64 (ARM64) |
| 宿主机 glibc | 2.31（**容器内是 2.41**）|
| 部署路径 | `/zspace/zsrp/zdocker/compose_config/tl-monitor-server/` |
| 对外端口 | 38457 (HTTP API + Admin) |

### 容器内镜像

| 项 | 值 |
|----|-----|
| 镜像 | `ghcr.io/maojiaxu8039/tl-monitor-server:latest` |
| 大小 | 354 MB |
| 内置二进制 | `/tmp/tl-monitor-server` (将被 volume 覆盖) |
| 内置 glibc | 2.41 (Debian 13) |

### 本机工具

| 工具 | 用途 | 安装 |
|------|------|------|
| `gh` | 下载 GitHub Actions artifact | `brew install gh` |
| `sshpass` | 自动化 SSH 密码 | `brew install sshpass` |
| `rsync` | 文件上传 | macOS 自带 |

---

## 首次部署

> 适用场景：第一次部署，或需要重建完整环境时。

### 步骤 1：SSH 登录测试

> 💡 **安全提示**：下文所有命令用 `$SSH_PASSWORD` 和 `$NAS_USER` 等环境变量占位符。
> 实际使用前请设置：
> ```bash
> export SSH_PASSWORD='你的SSH密码'
> export NAS_USER='你的SSH账号'        # 极空间 SSH 登录用户名
> export NAS_HOST='100.124.122.65'    # 极空间 Tailscale IP（或局域网 IP）
> export NAS_PORT='10039'             # 极空间 SSH 端口
> export ADMIN_PASSWORD='你的管理员密码'  # 用于管理面板
> ```

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "uname -a && sudo docker --version"
```

**预期输出**：
```
Linux zspace-nas 5.10.xxx #1 SMP ... aarch64 GNU/Linux
Docker version 26.1.4
```

### 步骤 2：确认镜像存在

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker images | grep tl-monitor"
```

**预期输出**：
```
ghcr.io/maojiaxu8039/tl-monitor-server   latest    4c10a19a3287   6 weeks ago   354MB
```

> ⚠️ 如果镜像不存在，先拉取：
> ```bash
> SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
>   "sudo docker pull ghcr.io/maojiaxu8039/tl-monitor-server:latest"
> ```

### 步骤 3：准备部署目录

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
  sudo mkdir -p \$COMPOSE_DIR/{data,config,resources,backups}
  sudo chown -R \$(whoami):\$(id -gn) \$COMPOSE_DIR
  ls -la \$COMPOSE_DIR
"
```

**预期输出**：
```
drwxr-xr-x 2 ... 4096 ... backups
drwxr-xr-x 2 ... 4096 ... config
drwxr-xr-x 2 ... 4096 ... data
drwxr-xr-x 2 ... 4096 ... resources
```

### 步骤 4：下载 ARM64 二进制

从 GitHub Actions 下载最新构建的 `linux-arm64-server` artifact。

**方式 A：用 `gh` CLI**

```bash
# 获取最新成功的 build ID
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Build ID: $RUN_ID"

# 下载
mkdir -p /tmp/tl-build
gh run download $RUN_ID --name linux-arm64-server --dir /tmp/tl-build

# 验证
ls -lh /tmp/tl-build/linux-arm64-server/
file /tmp/tl-build/linux-arm64-server/tl-monitor-server
```

**方式 B：从网页下载**

1. 访问 https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/build-server-arm64.yml
2. 点击最新 ✅ 成功的 build
3. 底部 Artifacts → 下载 `linux-arm64-server`
4. 解压到 `/tmp/tl-build/linux-arm64-server/`

**预期输出**：
```
-rw-r--r--  ...  903  ... server_config.example.yaml
-rwxr-xr-x  ... 9.2M ... tl-monitor-server
drwxr-xr-x  ...      ... resources/
  - qiandao_fire.cjs
  - qiandao_fire.mjs
```

### 步骤 5：上传到 NAS

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources/

# 设置可执行权限
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "chmod +x /zspace/zsrp/zdocker/compose_config/tl-monitor-server/tl-monitor-server"
```

### 步骤 6：准备配置文件

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server

  # 复制 example 配置
  cp /tmp/tl-build/linux-arm64-server/server_config.example.yaml \$COMPOSE_DIR/config/server_config.yaml

  # 或从备份恢复
  # cp \$COMPOSE_DIR/backups/server_config_*.yaml \$COMPOSE_DIR/config/server_config.yaml
"
```

编辑 `config/server_config.yaml`，关键字段：

```yaml
season_id: "ss12"
http_port: 8080
admin_password: ""  # 留空，使用环境变量 TL_ADMIN_PASSWORD
trust_proxy_headers: false
```

### 步骤 7：启动容器

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  cd /zspace/zsrp/zdocker/compose_config/tl-monitor-server

  # 停止旧容器（如有）
  sudo docker stop tl-monitor-server 2>/dev/null
  sudo docker rm tl-monitor-server 2>/dev/null

  # 启动新容器
  sudo docker run -d \
    --name tl-monitor-server \
    --restart unless-stopped \
    -p 38457:8080 \
    -v \$(pwd)/data:/data \
    -v \$(pwd)/config:/config \
    -v \$(pwd)/tl-monitor-server:/tmp/tl-monitor-server \
    -v \$(pwd)/resources:/resources \
    -w /data \
    -e RUST_LOG=info \
    -e TL_DB_PATH=/data/tl_monitor.db \
    -e TL_CONFIG_PATH=/config/server_config.yaml \
    -e TL_RESOURCES_DIR=/resources \
    -e TL_ADMIN_PASSWORD='YourPasswordHere' \
    --health-cmd='curl -fsS http://localhost:8080/health' \
    --health-interval=30s \
    --health-timeout=5s \
    --health-retries=3 \
    --health-start-period=30s \
    ghcr.io/maojiaxu8039/tl-monitor-server:latest \
    /tmp/tl-monitor-server
"
```

> ⚠️ **必须修改** `TL_ADMIN_PASSWORD='YourPasswordHere'` 为你的实际密码。

### 步骤 8：验证部署

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  echo '=== 容器状态 ==='
  sudo docker ps --filter 'name=tl-monitor' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

  echo ''
  echo '=== 健康检查（容器内）==='
  sudo docker exec tl-monitor-server curl -s http://localhost:8080/health
  echo ''

  echo ''
  echo '=== 启动日志 ==='
  sudo docker logs tl-monitor-server --tail 15
"
```

**预期输出**：

```
=== 容器状态 ===
NAMES               STATUS                    PORTS
tl-monitor-server   Up 30 seconds (healthy)   0.0.0.0:38457->8080/tcp

=== 健康检查（容器内）===
{"status":"ok",...}

=== 启动日志 ===
... HTTP API 服务器监听中: http://0.0.0.0:8080
... [普通服] 测试采集完成: 火价=9.0692, 物品=2824, 成功=true
... [专家服] 测试采集完成: 火价=13.2308, 物品=2718, 成功=true
... 等待 2573 秒后到达整点...
```

✅ 部署成功！

---

## 更新部署

> 适用场景：升级到新版本。

### 方式 1：快速更新（推荐）

```bash
# 1. 下载最新构建
mkdir -p /tmp/tl-build && rm -rf /tmp/tl-build/*
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download $RUN_ID --name linux-arm64-server --dir /tmp/tl-build

# 2. 上传新文件到 NAS
SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources/

# 3. 重启容器
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker restart tl-monitor-server"

# 4. 验证
sleep 5
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker exec tl-monitor-server curl -s http://localhost:8080/health"
```

**整个过程 < 1 分钟。**

### 方式 2：安全更新（带备份和回滚能力）

```bash
# 1. 下载最新构建
mkdir -p /tmp/tl-build && rm -rf /tmp/tl-build/*
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download $RUN_ID --name linux-arm64-server --dir /tmp/tl-build

# 2. 上传 .new 临时文件（不直接覆盖）
SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/tl-monitor-server.new

SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/resources/ \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/resources.new/

# 3. 在 NAS 上：备份 + 替换 + 重启
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
  cd \$COMPOSE_DIR

  # 备份当前版本
  [ -f tl-monitor-server ] && cp tl-monitor-server tl-monitor-server.bak
  [ -d resources ] && cp -r resources resources.bak

  # 替换新版本
  mv tl-monitor-server.new tl-monitor-server
  chmod +x tl-monitor-server
  cp resources.new/qiandao_fire.* resources/
  rm -rf resources.new

  # 重启
  sudo docker restart tl-monitor-server
"

# 4. 验证
sleep 5
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker exec tl-monitor-server curl -s http://localhost:8080/health"
```

---

## 常见操作

### 查看容器状态

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker ps --filter 'name=tl-monitor' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}'
"
```

### 查看实时日志

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker logs -f tl-monitor-server
"
```

### 健康检查

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker exec tl-monitor-server curl -s http://localhost:8080/health
"
```

### 查看 API 版本

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker exec tl-monitor-server curl -s http://localhost:8080/api/version | python3 -m json.tool
"
```

### 进入容器内部

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker exec -it tl-monitor-server /bin/bash
"
```

### 重启 / 停止 / 启动

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker restart tl-monitor-server    # 重启
  sudo docker stop tl-monitor-server       # 停止
  sudo docker start tl-monitor-server      # 启动
"
```

### 备份数据库

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
  TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
  cp \$COMPOSE_DIR/data/tl_monitor.db \$COMPOSE_DIR/backups/tl_monitor_\$TIMESTAMP.db
  ls -lh \$COMPOSE_DIR/backups/
"
```

### 查看资源占用

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker stats tl-monitor-server --no-stream
"
```

### 查看管理员面板

打开浏览器访问：

```
http://100.124.122.65:38457/admin
```

输入设置的管理员密码登录。

---

## 常见问题

### Q1: 容器启动后一直是 `unhealthy`？

**检查**：

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker logs tl-monitor-server --tail 30
"
```

**可能原因**：
- 端口 8080 被占用 → 改用其他端口
- 数据库文件权限问题 → `chmod 644 data/tl_monitor.db`
- 配置文件语法错误 → 检查 `config/server_config.yaml`

### Q2: SSH 连不上？

**检查清单**：
1. 极空间控制台是否启用了 SSH（系统设置 → 远程访问）
2. Tailscale 是否连接（极空间和 Mac 都要登录 Tailscale）
3. 端口是否正确（极空间 Z2Pro 用 10039）

**测试**：
```bash
nc -zv -G 3 100.124.122.65 10039
```

### Q3: 极空间宿主机 `curl` 命令不可用？

极空间宿主机（Debian）默认没装 curl。所有 HTTP 检查都要在**容器内**执行：

```bash
# ✗ 错误（宿主机无 curl）
curl http://localhost:38457/health

# ✓ 正确（容器内有 curl）
sudo docker exec tl-monitor-server curl -s http://localhost:8080/health
```

### Q4: 数据采集失败？

查看日志中抓取错误信息：

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker logs tl-monitor-server --tail 100 | grep -E 'ERROR|WARN'
"
```

**常见原因**：
- 上游 API 限流 → 调整 `api_config` 抓取间隔
- Node.js 资源脚本问题 → 检查 `resources/qiandao_fire.*` 是否最新

### Q5: 极空间 Docker 重启后容器没自动启动？

容器配置了 `--restart unless-stopped`，Docker 守护进程启动时会自动启动容器。
如果没启动，手动启动：

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  sudo docker start tl-monitor-server
"
```

### Q6: 容器内 glibc 错误？

不应该发生，因为：
- 容器镜像有独立 glibc 2.41
- 二进制在容器内运行，不依赖宿主机 glibc

如果真的发生，**不要在宿主机直接运行二进制**（宿主机 glibc 2.31 不够）。

### Q7: 客户端连不上服务？

**检查清单**：
1. 容器是否运行：`sudo docker ps | grep tl-monitor`
2. 端口是否监听：`sudo docker exec tl-monitor-server netstat -tlnp | grep 8080`
3. Tailscale 是否连接（客户端和服务端都要在 Tailscale 网络中）
4. 客户端配置的服务地址是否正确

---

## 回滚方案

### 方式 1：用 `.bak` 备份回滚

**前提**：用了"安全更新"方式 2，留下了 `tl-monitor-server.bak`

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
  cd \$COMPOSE_DIR

  sudo docker stop tl-monitor-server

  # 恢复二进制
  mv tl-monitor-server tl-monitor-server.failed
  mv tl-monitor-server.bak tl-monitor-server

  # 恢复资源
  rm -rf resources
  mv resources.bak resources

  sudo docker start tl-monitor-server
"
```

### 方式 2：用 GitHub Actions 旧构建回滚

```bash
# 1. 查看历史 build，找到可用的旧版本
gh run list --workflow=build-server-arm64.yml --limit 10

# 2. 下载旧版本
OLD_RUN_ID=28072867482  # 举例：6 月 23 日的 build
rm -rf /tmp/tl-build
mkdir -p /tmp/tl-build
gh run download $OLD_RUN_ID --name linux-arm64-server --dir /tmp/tl-build

# 3. 上传旧版本 + 重启
SSHPASS="$SSH_PASSWORD" sshpass -e rsync -avz -e "ssh -p $NAS_PORT" \
  /tmp/tl-build/linux-arm64-server/tl-monitor-server \
  $NAS_USER@$NAS_HOST:/zspace/zsrp/zdocker/compose_config/tl-monitor-server/

SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST \
  "sudo docker restart tl-monitor-server"
```

### 方式 3：从 `backups/` 恢复数据

如果数据文件出问题：

```bash
SSHPASS="$SSH_PASSWORD" sshpass -e ssh -p $NAS_PORT $NAS_USER@$NAS_HOST "
  COMPOSE_DIR=/zspace/zsrp/zdocker/compose_config/tl-monitor-server
  cd \$COMPOSE_DIR

  sudo docker stop tl-monitor-server

  # 恢复数据库
  BACKUP=\$(ls -t \$COMPOSE_DIR/backups/tl_monitor_*.db | head -1)
  cp \$BACKUP \$COMPOSE_DIR/data/tl_monitor.db
  chmod 644 \$COMPOSE_DIR/data/tl_monitor.db

  sudo docker start tl-monitor-server
"
```

---

## 附录：完整目录结构

```
/zspace/zsrp/zdocker/compose_config/tl-monitor-server/
├── docker-compose.yml      # （可选）docker-compose 文件
├── tl-monitor-server       # ARM64 二进制（volume 挂载到容器 /tmp/）
├── data/
│   └── tl_monitor.db       # SQLite 数据库（387 MB）
├── config/
│   └── server_config.yaml  # 配置文件
├── resources/
│   ├── qiandao_fire.cjs    # Node 抓取脚本
│   └── qiandao_fire.mjs
└── backups/                # 备份目录
    ├── tl_monitor_20260624_114919.db
    └── server_config_20260624_114919.yaml
```

---

## 附录：实测性能指标

| 指标 | 值 |
|------|-----|
| 启动时间 | 30-60 秒（healthy） |
| 内存占用 | ~100 MB |
| CPU 占用 | < 5%（空闲）/ ~30%（抓取时） |
| 数据库大小 | ~387 MB（持续增长） |
| 日均抓取 | 普通服 2824 物品 + 专家服 2718 物品 |
| API 响应 | < 100 ms |
| 健康检查间隔 | 30 秒 |

---

## 附录：核心配置参考

### `docker run` 完整参数

```bash
sudo docker run -d \
  --name tl-monitor-server \                    # 容器名
  --restart unless-stopped \                    # 自动重启策略
  -p 38457:8080 \                               # 端口映射（外部:内部）
  -v $(pwd)/data:/data \                        # 数据卷
  -v $(pwd)/config:/config \                    # 配置卷
  -v $(pwd)/tl-monitor-server:/tmp/tl-monitor-server \  # 覆盖二进制
  -v $(pwd)/resources:/resources \              # 资源卷
  -w /data \                                    # 工作目录
  -e RUST_LOG=info \                            # 日志级别
  -e TL_DB_PATH=/data/tl_monitor.db \           # 数据库路径
  -e TL_CONFIG_PATH=/config/server_config.yaml \# 配置文件路径
  -e TL_RESOURCES_DIR=/resources \              # 资源目录
  -e TL_ADMIN_PASSWORD='YourPassword' \         # 管理员密码
  --health-cmd='curl -fsS http://localhost:8080/health' \  # 健康检查命令
  --health-interval=30s \                       # 检查间隔
  --health-timeout=5s \                         # 超时
  --health-retries=3 \                          # 重试次数
  --health-start-period=30s \                   # 启动后等待
  ghcr.io/maojiaxu8039/tl-monitor-server:latest \  # 镜像
  /tmp/tl-monitor-server                        # 启动命令
```

---

**文档版本**：v2.0
**最后更新**：2026-06-24
**作者**：基于实测部署总结
