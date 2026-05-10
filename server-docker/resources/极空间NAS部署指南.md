# TL Monitor Server - 极空间 NAS 部署指南

## 目录

1. [部署前准备](#部署前准备)
2. [一键部署脚本](#一键部署脚本)
3. [手动部署步骤](#手动部署步骤)
4. [GitHub Actions 自动构建](#github-actions-自动构建)
5. [常见问题](#常见问题)

---

## 部署前准备

### 环境要求

- **NAS 设备**: 极空间 Z2Pro 或其他 ARM64 架构 NAS
- **Docker**: NAS 上已安装 Docker
- **端口**: 38457（可自定义）

### 连接信息

```bash
SSH 地址: 100.124.122.65:10039
用户名: 15510607744
密码: !Mjx452212889
```

---

## 一键部署脚本

在 NAS 上执行以下命令即可完成全部部署：

```bash
ssh -p 10039 15510607744@100.124.122.65

# 然后在 NAS 上执行：
bash -c '
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources

# 创建 Docker 网络（如果还没有）
sudo docker network create -d bridge tl-monitor-net 2>/dev/null || true

# 停止并删除旧容器
sudo docker stop tl-monitor-server 2>/dev/null
sudo docker rm tl-monitor-server 2>/dev/null

# 启动新容器
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  --network tl-monitor-net \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources:/resources \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor:/app \
  -e TL_RESOURCES_DIR=/resources \
  -w /data \
  debian:stable-slim \
  bash -c "apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs && cp /app/tl-monitor-server /tmp/ && chmod +x /tmp/tl-monitor-server && /tmp/tl-monitor-server"

# 等待服务启动
sleep 10

# 验证服务
curl -s http://localhost:38457/health && echo "服务启动成功!"
'
```

---

## 手动部署步骤

### 步骤 1: SSH 连接到 NAS

```bash
ssh -p 10039 15510607744@100.124.122.65
```

### 步骤 2: 创建目录结构

```bash
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources
```

### 步骤 3: 下载 ARM64 二进制

**方式 A: 从 GitHub 下载最新构建**

1. 访问 https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/download-arm64.yml
2. 点击 "Run workflow" -> "Run workflow"
3. 等待构建完成
4. 下载 artifact: `linux-arm64-server`

**方式 B: 直接下载**

```bash
# 在 NAS 上执行
curl -L "https://github.com/maojiaxu8039/TL-item-monitor-Tauri/releases/latest/download/tl-monitor-server" -o /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
```

### 步骤 4: 准备配置文件

上传 `server_config.yaml` 到 `/data_s001/data/udata/real/15510607744/Docker/tl-monitor/config/`

### 步骤 5: 准备 Node.js 脚本

上传 `qiandao_fire.cjs` 到 `/data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources/`

### 步骤 6: 创建容器

```bash
# 基础镜像部署（首次）
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
  debian:stable-slim \
  bash -c "apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs && cp /app/tl-monitor-server /tmp/ && chmod +x /tmp/tl-monitor-server && /tmp/tl-monitor-server"
```

### 步骤 7: 创建完整镜像（可选，推荐）

首次部署后创建完整镜像，以后重启就不用重新安装 Node.js：

```bash
# 创建完整镜像
sudo docker commit tl-monitor-server tl-monitor:full

# 停止并删除旧容器
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
  bash -c "cp /app/tl-monitor-server /tmp/ && chmod +x /tmp/tl-monitor-server && /tmp/tl-monitor-server"
```

---

## GitHub Actions 自动构建

### 构建工作流

仓库地址: https://github.com/maojiaxu8039/TL-item-monitor-Tauri

工作流文件: `.github/workflows/download-arm64.yml`

### 触发构建

1. 访问 Actions 页面: https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/download-arm64.yml
2. 点击 "Run workflow"
3. 选择分支 (main)
4. 点击 "Run workflow"

### 下载构建产物

1. 构建完成后，点击对应的 run
2. 在 Artifacts 部分点击 `linux-arm64-server` 下载
3. 解压后得到 `tl-monitor-server` 二进制文件

### 更新 NAS 上的服务

1. 上传新的二进制文件到 NAS:
```bash
scp -P 10039 tl-monitor-server 15510607744@100.124.122.65:/tmp/tl-monitor-server
```

2. SSH 到 NAS 并替换:
```bash
ssh -p 10039 15510607744@100.124.122.65
sudo cp /tmp/tl-monitor-server /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
sudo chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
```

3. 重启容器:
```bash
sudo docker restart tl-monitor-server
```

4. 验证:
```bash
curl http://localhost:38457/health
```

---

## 常见问题

### Q1: 容器启动失败，显示 "Exec format error"

**原因**: 二进制文件架构不匹配（Mac vs Linux ARM64）

**解决**: 使用 GitHub Actions 构建的 Linux ARM64 二进制，不要使用 Mac 编译的

### Q2: 容器一直在 Restarting

**解决**:
```bash
sudo docker logs tl-monitor-server
```
查看错误日志

### Q3: 如何查看服务状态?

```bash
# 查看容器状态
sudo docker ps | grep tl-monitor

# 查看日志
sudo docker logs --tail 50 tl-monitor-server

# 测试 API
curl http://localhost:38457/health
```

### Q4: 如何更新服务器?

```bash
# 1. 下载新的二进制
# 2. 上传到 NAS
scp -P 10039 new-tl-monitor-server 15510607744@100.124.122.65:/tmp/

# 3. SSH 到 NAS
ssh -p 10039 15510607744@100.124.122.65

# 4. 替换二进制
sudo cp /tmp/new-tl-monitor-server /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
sudo chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server

# 5. 重启容器
sudo docker restart tl-monitor-server
```

### Q5: 数据库备份

```bash
# 备份
sudo docker cp tl-monitor-server:/data/tl_monitor.db /tmp/tl_monitor_backup.db

# 恢复
sudo docker cp /tmp/tl_monitor_backup.db tl-monitor-server:/data/tl_monitor.db
sudo docker restart tl-monitor-server
```

---

## 服务访问

- **API 地址**: http://100.124.122.65:38457
- **管理界面**: http://100.124.122.65:38457/admin
- **健康检查**: http://100.124.122.65:38457/health
- **火价历史**: http://100.124.122.65:38457/fire-history?mode=normal

---

## 目录结构

```
/data_s001/data/udata/real/15510607744/Docker/tl-monitor/
├── tl-monitor-server    # 二进制文件
├── data/               # 数据库目录
│   └── tl_monitor.db   # SQLite 数据库
├── config/             # 配置目录
│   └── server_config.yaml
├── resources/         # 资源目录
│   └── qiandao_fire.cjs  # Node.js 火价抓取脚本
└── 极空间Docker部署完整指南.md
```

---

*最后更新: 2026-05-10*
