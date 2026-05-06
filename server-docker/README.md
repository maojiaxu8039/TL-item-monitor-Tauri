# TL Monitor Server Docker 配置

## 构建 Docker 镜像

```bash
cd server-docker
docker build -t tl-monitor-server:latest .
```

## 运行容器

### 基本运行

```bash
docker run -d \
  --name tl-monitor-server \
  -p 8080:8080 \
  -v /path/to/data:/data \
  -v /path/to/config:/config \
  -e RUST_LOG=info \
  tl-monitor-server:latest
```

### 带管理密码

```bash
docker run -d \
  --name tl-monitor-server \
  -p 8080:8080 \
  -v /path/to/data:/data \
  -v /path/to/config:/config \
  -e RUST_LOG=info \
  -e ADMIN_PASSWORD=your_password \
  tl-monitor-server:latest
```

## 配置文件示例

在宿主机创建 `/path/to/config/server_config.yaml`:

```yaml
season_id: "ss12"
http_port: 8080
scrape_modes:
  - mode: "normal"
    enabled: true
  - mode: "expert"
    enabled: true
admin_password: "your_secure_password"
api_config:
  qiandao_tag_id_normal: "1560053"
  qiandao_spec_id_normal: "267416"
  qiandao_tag_id_expert: "1560055"
  qiandao_spec_id_expert: "267417"
  luosi_season_id_normal: 1401
  luosi_season_id_expert: 1431
cors_allowed_origins:
  - "http://localhost:5173"
```

## Docker Compose 方式

创建 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  tl-monitor-server:
    build: ./server-docker
    container_name: tl-monitor-server
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
      - ./config:/config
    environment:
      - RUST_LOG=info
      - TL_DB_PATH=/data/tl_monitor.db
      - TL_CONFIG_PATH=/config/server_config.yaml
```

然后运行：

```bash
docker-compose up -d
```

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
   scp server_config.yaml admin@your_nas_ip:/data/TLMonitor/config/
   ```

5. **使用 Docker 运行**
   ```bash
   docker run -d \
     --name tl-monitor-server \
     --restart unless-stopped \
     -p 8080:8080 \
     -v /data/TLMonitor/data:/data \
     -v /data/TLMonitor/config:/config \
     -v /etc/localtime:/etc/localtime:ro \
     your_registry/tl-monitor-server:latest
   ```

6. **查看日志**
   ```bash
   docker logs -f tl-monitor-server
   ```

## API 接口

- `GET /status` - 服务器状态
- `GET /fire-history?mode=normal&limit=24` - 火价历史
- `GET /fire-history?mode=expert&limit=24` - 专家服火价历史
- `GET /items-history?mode=normal&item_id=xxx` - 物品历史
- `GET /items-history-all?mode=normal&limit=100` - 所有物品历史
- `GET /health` - 健康检查
- `POST /admin/init-season` - 初始化新赛季（需密码）
- `POST /admin/update-api-config` - 更新API配置（需密码）

## 定时任务

服务器每小时整点自动采集数据，无需额外配置。
