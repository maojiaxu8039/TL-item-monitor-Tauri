# TL Monitor Server Docker 配置

## 快速开始

### 1. 准备配置

```bash
# 在项目根目录执行
cd /path/to/TL-item-monitor-Tauri

# 编辑配置文件（必填：设置强密码）
vim server-docker/config/server_config.yaml
```

确保 `server-docker/config/server_config.yaml` 中的 `admin_password` 已设置为强密码：

```yaml
admin_password: "your_secure_password"
http_port: 8080
```

### 2. 构建并启动

```bash
# 在项目根目录执行
docker compose -f server-docker/docker-compose.yml up -d
```

或使用 docker-compose（较旧版本）：

```bash
docker-compose -f server-docker/docker-compose.yml up -d
```

### 3. 验证运行

```bash
curl http://localhost:8080/health
```

## 单独构建

如果只想构建镜像而不运行：

```bash
docker build -t tl-monitor-server:latest -f server-docker/Dockerfile .
```

注意：由于 Dockerfile 需要访问 `src-tauri` 目录，构建上下文是项目根目录。

## 手动运行容器

```bash
docker run -d \
  --name tl-monitor-server \
  -p 8080:8080 \
  -v $(pwd)/server-docker/data:/data \
  -v $(pwd)/server-docker/config:/config \
  -e RUST_LOG=info \
  tl-monitor-server:latest
```

## 配置文件说明

在 `server-docker/config/server_config.yaml` 中配置：

```yaml
season_id: "ss12"           # 当前赛季 ID
http_port: 8080             # 服务端口（重启后生效）
admin_password: "your_secure_password"  # 管理员密码（必填，使用强密码）
api_config:
  qiandao_tag_id_normal: "1560053"
  qiandao_spec_id_normal: "267416"
  qiandao_tag_id_expert: "1560055"
  qiandao_spec_id_expert: "267417"
  luosi_season_id_normal: 1401
  luosi_season_id_expert: 1431
```

## API 接口

### 公开接口

- `GET /status` - 服务器状态
- `GET /fire-history?mode=normal&limit=24` - 火价历史
- `GET /fire-history?mode=expert&limit=24` - 专家服火价历史
- `GET /items-history?mode=normal&item_id=xxx` - 物品历史
- `GET /items-history-all?mode=normal&limit=100` - 所有物品历史
- `GET /health` - 健康检查
- `GET /season-start` - 赛季开始时间
- `GET /stats` - 赛季统计

### 管理员接口（需要密码）

所有管理员接口需要在请求体中包含 `password` 字段：

```json
{
  "password": "your_admin_password",
  ...
}
```

- `POST /admin/init-season` - 初始化新赛季
- `POST /admin/archive-season` - 归档赛季
- `POST /admin/update-api-config` - 更新API配置

### 管理后台

服务器提供内置 HTML 管理页面，访问 `http://localhost:8080/admin.html`

## 极空间 NAS 安装步骤

1. **开启 SSH 管理**（在极空间控制面板中）

2. **SSH 连接到 NAS**
   ```bash
   ssh admin@your_nas_ip
   ```

3. **创建目录**
   ```bash
   mkdir -p /data/TLMonitor
   mkdir -p /data/TLMonitor/config
   ```

4. **复制配置文件到 NAS**
   ```bash
   scp server-docker/config/server_config.yaml admin@your_nas_ip:/data/TLMonitor/config/
   ```

5. **构建并运行容器**
   ```bash
   docker build -t tl-monitor-server:latest -f server-docker/Dockerfile .
   docker run -d \
     --name tl-monitor-server \
     --restart unless-stopped \
     -p 8080:8080 \
     -v /data/TLMonitor/data:/data \
     -v /data/TLMonitor/config:/config \
     -v /etc/localtime:/etc/localtime:ro \
     tl-monitor-server:latest
   ```

6. **查看日志**
   ```bash
   docker logs -f tl-monitor-server
   ```

## 定时任务

服务器每小时整点自动采集数据，无需额外配置。

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| TL_DB_PATH | /data/tl_monitor.db | 数据库文件路径 |
| TL_CONFIG_PATH | /config/server_config.yaml | 配置文件路径 |
| RUST_LOG | info | 日志级别 |
