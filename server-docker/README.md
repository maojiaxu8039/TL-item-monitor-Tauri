# TL Monitor Server - 极空间 NAS 部署指南

## 目录

- [概览](#概览)
- [完整的部署流程](#完整的部署流程)
- [GitHub Actions 自动构建](#github-actions-自动构建)
- [NAS 部署详细步骤](#nas-部署详细步骤)
- [环境变量说明](#环境变量说明)
- [维护命令](#维护命令)
- [故障排除](#故障排除)

---

## 概览

本项目服务器用于采集《逃离塔科夫》游戏中的火价和物品数据，支持普通服和专家服同时采集。

**访问地址**:
| 地址 | 说明 |
|------|------|
| `http://NAS_IP:38457/` | 服务器状态页面 |
| `http://NAS_IP:38457/admin` | 管理页面（需要管理员密码） |

---

## 完整的部署流程

### 阶段一：代码修改与提交

```bash
# 1. 在本地修改代码后，提交到 GitHub
cd /项目目录
git add .
git commit -m "描述本次修改"
git push origin main
```

### 阶段二：GitHub Actions 构建

```bash
# 2. 手动触发构建（可选，push 代码会自动触发）
gh workflow run build-server-arm64.yml

# 3. 等待构建完成（通常需要 3-5 分钟）
gh run list --workflow=build-server-arm64.yml --limit 1

# 查看构建详情
gh run view <run-id>
```

**构建状态查看**: https://github.com/maojiaxu8039/TL-item-monitor-Tauri/actions/workflows/build-server-arm64.yml

### 阶段三：下载并部署到 NAS

```bash
# 4. 下载构建产物
mkdir -p /tmp/tl-build
gh run download <run-id> --name linux-arm64-server --dir /tmp/tl-build

# 5. 通过 base64 方式上传到 NAS（避免 SCP 网络问题）
base64 -i /tmp/tl-build/tl-monitor-server | sshpass -p 'NAS密码' ssh -o StrictHostKeyChecking=no -p 10039 用户@NAS_IP "cat > /tmp/tl-monitor-server.b64 && cat /tmp/tl-monitor-server.b64 | base64 -d > /tmp/tl-monitor-server && rm /tmp/tl-monitor-server.b64 && chmod +x /tmp/tl-monitor-server"

# 6. 部署到 NAS（需要先停止容器再替换二进制文件）
sshpass -p 'NAS密码' ssh -o StrictHostKeyChecking=no -p 10039 用户@NAS_IP << 'EOF'
# 停止容器
sudo docker stop tl-monitor-server

# 替换二进制文件
sudo cp /tmp/tl-monitor-server /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
sudo chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server

# 启动容器
sudo docker start tl-monitor-server

# 查看启动日志
sleep 5 && sudo docker logs tl-monitor-server --tail 30
EOF
```

### 阶段四：验证部署

```bash
# 查看容器状态
sshpass -p 'NAS密码' ssh -o StrictHostKeyChecking=no -p 10039 用户@NAS_IP 'sudo docker ps | grep tl-monitor'

# 查看最新日志
sshpass -p 'NAS密码' ssh -o StrictHostKeyChecking=no -p 10039 用户@NAS_IP 'sudo docker logs tl-monitor-server --tail 30'

# 测试 API
curl -s "http://100.124.122.65:38457/api/admin/status" -H "Content-Type: application/json" -d '{"password":"8039"}'
```

---

## GitHub Actions 自动构建

### Workflow 文件

`.github/workflows/build-server-arm64.yml`

### 构建流程

1. 克隆代码
2. 安装 Rust 交叉编译工具链（ARM64）
3. 编译 Rust 程序（Release 模式）
4. 验证二进制文件
5. 上传到 Artifacts（保留 30 天）

### 触发方式

| 方式 | 说明 |
|------|------|
| Push 代码 | 自动触发 `main` 分支的构建 |
| 手动触发 | `gh workflow run build-server-arm64.yml` |

### 下载构建产物

```bash
# 下载最新构建
gh run download <run-id> --name linux-arm64-server --dir <目标目录>

# 查看可用的构建
gh run list --workflow=build-server-arm64.yml --limit 5
```

---

## NAS 部署详细步骤

### 1. SSH 连接到 NAS

```bash
ssh -p 10039 15510607744@100.124.122.65
# 密码: !Mjx452212889
```

### 2. 创建目录结构

```bash
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config
mkdir -p /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources
```

### 3. 上传配置文件

确保 `server-docker/config/server_config.yaml` 存在并配置正确。

### 4. 上传 Node.js 脚本

将 `src-tauri/resources/qiandao_fire.cjs` 上传到 `/app/resources/` 目录。

### 5. 启动容器（完整命令）

```bash
sudo docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -e TL_CONFIG_PATH=/app/config/server_config.yaml \
  -e TL_RESOURCES_DIR=/app/resources \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor:/app \
  tl-monitor:full /app/tl-monitor-server
```

---

## 环境变量说明

| 变量名 | 默认值 | 必须 | 说明 |
|--------|--------|------|------|
| `TL_CONFIG_PATH` | `/config/server_config.yaml` | ⚠️ 必须设置 | 配置文件路径，应设为 `/app/config/server_config.yaml` |
| `TL_RESOURCES_DIR` | `/resources` | ⚠️ 必须设置 | 资源目录，应设为 `/app/resources` |
| `TL_DB_PATH` | `/data/tl_monitor.db` | 可选 | 数据库文件路径 |
| `RUST_LOG` | `info` | 可选 | 日志级别 |

**重要**：必须正确设置 `TL_CONFIG_PATH` 和 `TL_RESOURCES_DIR` 环境变量，否则服务器将无法找到配置文件和资源文件。

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

# 删除容器（需要先停止）
sudo docker stop tl-monitor-server && sudo docker rm tl-monitor-server
```

### 更新服务

当 GitHub Actions 构建完成后，按以下步骤更新：

```bash
# 1. 停止容器
sudo docker stop tl-monitor-server

# 2. 替换二进制文件（通过本地下载后上传）
# 使用 base64 方式上传新构建的 tl-monitor-server

# 3. 启动容器
sudo docker start tl-monitor-server

# 4. 验证
sudo docker logs tl-monitor-server --tail 20
```

### 数据管理

```bash
# 查看数据库大小
sudo docker exec tl-monitor-server ls -lh /data/*.db

# 备份数据库
sudo docker exec tl-monitor-server cp /data/tl_monitor.db /data/backup_$(date +%Y%m%d).db
```

### 日志分析

```bash
# 查看启动测试采集日志
sudo docker logs tl-monitor-server 2>&1 | grep "测试采集\|启动时"

# 查看整点采集日志
sudo docker logs tl-monitor-server 2>&1 | grep "等待.*秒后到达整点\|到达整点"

# 查看火价抓取日志
sudo docker logs --tail 50 tl-monitor-server | grep "火价"

# 查看错误日志
sudo docker logs --tail 100 tl-monitor-server | grep -i error

# 导出完整日志
sudo docker logs tl-monitor-server > /tmp/tl-monitor.log
```

---

## 故障排除

### 问题 1: 配置文件读取失败

**症状**: 日志显示 `配置加载成功: admin_password_set=false`

**原因**: `TL_CONFIG_PATH` 环境变量未设置或设置错误

**解决**: 确保启动命令中设置了 `-e TL_CONFIG_PATH=/app/config/server_config.yaml`

### 问题 2: Node.js 脚本找不到

**症状**: 日志显示 `Cannot find module`

**原因**: `TL_RESOURCES_DIR` 环境变量未设置或设置错误

**解决**: 确保启动命令中设置了 `-e TL_RESOURCES_DIR=/app/resources`

### 问题 3: 普通服状态显示"失败"

**症状**: 管理页面显示普通服状态为"失败"，但实际已采集成功

**原因**: 服务器刚启动还未执行过采集

**解决**: v3.3 版本已添加启动时测试采集功能，启动后会立即验证 API 连接并更新状态。如果仍显示失败，请检查日志中的错误信息。

### 问题 4: 容器无法启动

**检查项**:

```bash
# 1. 确认二进制文件存在
ls -la /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server

# 2. 确认配置文件存在
ls -la /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config/server_config.yaml

# 3. 确认资源文件存在
ls -la /data_s001/data/udata/real/15510607744/Docker/tl-monitor/resources/

# 4. 查看具体错误
sudo docker logs tl-monitor-server
```

### 问题 5: 数据采集失败

**检查项**:

```bash
# 1. 确认网络可以访问罗技 API
curl -s http://115.231.176.101:8080/get?season_id=1401

# 2. 检查 Node.js 脚本执行
sudo docker exec tl-monitor-server node /app/resources/qiandao_fire.cjs normal

# 3. 查看采集日志
sudo docker logs tl-monitor-server 2>&1 | grep -E "采集|失败|error"
```

### 问题 6: CORS 跨域错误

**解决方案**: 在 `server_config.yaml` 的 `cors_allowed_origins` 中添加客户端地址。

```yaml
cors_allowed_origins:
  - "http://localhost:5173"
  - "http://你的客户端IP:38457"
```

然后重启容器使配置生效。

### 问题 7: 赛季显示"已归档"

**解决方案**:

```bash
# 直接修改数据库
sudo docker exec -u root tl-monitor-server sqlite3 /data/tl_monitor.db \
  "UPDATE seasons SET ended_at = NULL, is_current = 1 WHERE id = 'ss12'"

# 重启容器
sudo docker restart tl-monitor-server
```

---

## 技术支持

如遇问题，请提供：

1. `sudo docker ps` 输出
2. `sudo docker logs tl-monitor-server` 日志
3. 配置文件内容（注意脱敏）
4. 具体错误信息

---

*文档最后更新：2026-05-11*