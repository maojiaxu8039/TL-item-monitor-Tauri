# 极空间 Z2Pro Docker 部署指南

## 前提条件

- ✅ 已下载 `linux-arm64-server` 文件
- ✅ 已上传到极空间：`data_s001/data/udata/real/15510607744/Docker/tl-monitor`
- ✅ 文件已命名为 `tl-monitor-server`

---

## 部署方式一：极空间图形化界面

### 步骤1：上传文件并准备目录

在极空间文件管理器中：
```
/data_s001/data/udata/real/15510607744/Docker/tl-monitor/
├── tl-monitor-server    ← 上传的二进制文件
├── data/               ← 创建数据目录（数据库文件）
└── config/             ← 创建配置目录（配置文件）
```

操作：
1. 在极空间文件管理器中进入 `tl-monitor` 目录
2. 创建 `data` 文件夹
3. 创建 `config` 文件夹
4. 确保 `tl-monitor-server` 文件存在

### 步骤2：赋予执行权限

使用极空间的SSH功能或终端：
```bash
chmod +x /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server
```

或者在极空间终端应用中执行：
```bash
cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor
chmod +x tl-monitor-server
```

### 步骤3：创建Docker容器

#### 方法A：使用docker run命令

在极空间终端中执行：
```bash
docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/data:/app/data \
  -v /data_s001/data/udata/real/15510607744/Docker/tl-monitor/config:/app/config \
  -e TZ=Asia/Shanghai \
  debian:stable-slim \
  sh -c "cp /backup/tl-monitor-server /app/ && chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server"
```

然后复制文件到容器：
```bash
docker cp /data_s001/data/udata/real/15510607744/Docker/tl-monitor/tl-monitor-server tl-monitor-server:/backup/
```

#### 方法B：使用Docker Compose

在 `/data_s001/data/udata/real/15510607744/Docker/tl-monitor/` 目录下创建 `docker-compose.yml`：

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
      - ./data:/app/data
      - ./config:/app/config
      - ./tl-monitor-server:/app/tl-monitor-server:ro
    environment:
      - TZ=Asia/Shanghai
    command: sh -c "chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server"
```

然后执行：
```bash
cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor
docker-compose up -d
```

---

## 部署方式二：创建自定义镜像（推荐）

### 步骤1：创建Dockerfile

在 `/data_s001/data/udata/real/15510607744/Docker/tl-monitor/` 创建 `Dockerfile`：

```dockerfile
FROM debian:stable-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY tl-monitor-server /app/tl-monitor-server
RUN chmod +x /app/tl-monitor-server

RUN mkdir -p /app/data /app/config

EXPOSE 8080

ENV TZ=Asia/Shanghai

CMD ["./tl-monitor-server"]
```

### 步骤2：构建镜像

在终端中执行：
```bash
cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor
docker build -t tl-monitor-server:latest .
```

### 步骤3：运行容器

```bash
docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v ./data:/app/data \
  -v ./config:/app/config \
  -e TZ=Asia/Shanghai \
  tl-monitor-server:latest
```

---

## 验证部署

### 检查容器状态

```bash
docker ps | grep tl-monitor
```

输出应该类似：
```
CONTAINER ID   IMAGE                 COMMAND                  STATUS          PORTS                    NAMES
abc123def456   tl-monitor-server     "./tl-monitor-server"    Up 2 minutes    0.0.0.0:38457->8080/tcp   tl-monitor-server
```

### 查看日志

```bash
docker logs tl-monitor-server
```

### 测试服务

在浏览器中访问：
- http://极空间IP:38457
- http://极空间IP:38457/admin （管理界面）

---

## 常用命令

### 启动容器
```bash
docker start tl-monitor-server
```

### 停止容器
```bash
docker stop tl-monitor-server
```

### 重启容器
```bash
docker restart tl-monitor-server
```

### 查看日志
```bash
docker logs -f tl-monitor-server
```

### 进入容器
```bash
docker exec -it tl-monitor-server /bin/bash
```

### 删除容器
```bash
docker stop tl-monitor-server && docker rm tl-monitor-server
```

---

## 数据持久化

数据存储在以下目录：
- **数据库**: `./data/` 目录
- **配置**: `./config/` 目录
- **日志**: 通常也在 `./data/` 目录

重要：这些目录已通过 `-v` 参数挂载到宿主机，删除容器不会丢失数据。

---

## 故障排除

### 容器无法启动

1. 检查日志：`docker logs tl-monitor-server`
2. 常见问题：
   - 端口被占用：修改 `-p 38457:8080` 为其他端口
   - 文件权限：确保 `tl-monitor-server` 有执行权限
   - 路径错误：检查 `-v` 挂载的路径是否正确

### 端口访问不了

1. 确认容器正在运行：`docker ps`
2. 检查端口映射：`docker port tl-monitor-server`
3. 检查防火墙：极空间控制台 → 安全中心 → 防火墙
4. 临时关闭防火墙测试

### 数据库错误

1. 检查数据目录权限：
   ```bash
   ls -la ./data/
   ```
2. 修复权限：
   ```bash
   chmod 777 ./data/
   chmod 666 ./data/*.db
   ```

---

## 自动化部署脚本

创建 `deploy.sh` 脚本（可选）：

```bash
#!/bin/bash

# 进入目录
cd /data_s001/data/udata/real/15510607744/Docker/tl-monitor

# 创建必要目录
mkdir -p data config

# 赋予执行权限
chmod +x tl-monitor-server

# 停止旧容器（如果存在）
docker stop tl-monitor-server 2>/dev/null || true
docker rm tl-monitor-server 2>/dev/null || true

# 运行容器
docker run -d \
  --name tl-monitor-server \
  --restart unless-stopped \
  -p 38457:8080 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/config \
  -e TZ=Asia/Shanghai \
  debian:stable-slim \
  sh -c "cp /backup/tl-monitor-server /app/ && chmod +x /app/tl-monitor-server && cd /app && ./tl-monitor-server"

# 复制二进制文件
docker cp tl-monitor-server tl-monitor-server:/backup/

# 显示状态
docker ps | grep tl-monitor

echo "部署完成！访问 http://你的极空间IP:38457"
```

使用方法：
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 获取帮助

如果遇到问题，请提供：
1. `docker ps` 输出
2. `docker logs tl-monitor-server` 日志
3. 具体的错误信息
