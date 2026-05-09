# 极空间 Z2Pro 部署 TL 物品火价监控服务器

## 方案选择

推荐使用 **预编译镜像** 方式部署（最简单），无需在 Mac 上编译 ARM64 二进制文件。

如果你已经有编译好的 server 二进制文件，可以使用 **自定义镜像** 方式。

---

## 方式一：使用预编译镜像（推荐）

### 1. 准备配置文件

在电脑上创建以下文件夹结构：

```
tl-monitor/
├── config/
│   └── server_config.yaml
├── data/           （空文件夹，会自动创建数据库）
└── resources/
    └── qiandao_fire
```

#### config/server_config.yaml 内容：

```yaml
admin_password: "8039"
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
  - "http://localhost:8080"
  - "http://localhost:38457"
```

#### docker-compose.yml 内容：

```yaml
version: '3.8'
services:
  tl-monitor:
    image: ghcr.io/maojiaxu8039/tl-monitor-server:latest
    container_name: tl-monitor
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "38457:8080"
    volumes:
      - ./data:/data
      - ./config:/config
      - ./resources:/app/resources
    environment:
      - RUST_LOG=info
      - TL_DB_PATH=/data/tl_monitor.db
      - TL_CONFIG_PATH=/config/server_config.yaml
```

**注意**：使用预编译镜像不需要命令行操作，可以完全通过图形界面部署。

### 2. 上传文件到极空间

#### 步骤：

1. 打开极空间 Web 管理页面
2. 点击左侧 **文件管理** → **Docker**
3. 新建文件夹 `tl-monitor`
4. 在 `tl-monitor` 下创建：
   - `config/` 文件夹
   - `data/` 文件夹（可以是空的）
   - `resources/` 文件夹

5. 上传配置文件：
   - 将 `server_config.yaml` 上传到 `config/` 文件夹
   - 将项目中的 `resources/qiandao_fire` 文件上传到 `resources/` 文件夹

6. （可选）在 `tl-monitor` 文件夹上传 `docker-compose.yml`

### 3. 通过图形界面创建容器

#### 步骤：

1. 在极空间 Web 页面点击 **Docker** 应用
2. 点击 **创建容器**
3. 基本设置：
   - 容器名称：`tl-monitor`
   - 镜像：`ghcr.io/maojiaxu8039/tl-monitor-server:latest`
4. **存储卷** - 点击添加：
   - 源路径：选择 `tl-monitor/data`
   - 目标路径：`/data`
   - 再添加：
   - 源路径：选择 `tl-monitor/config`
   - 目标路径：`/config`
   - 再添加：
   - 源路径：选择 `tl-monitor/resources`
   - 目标路径：`/app/resources`
5. **端口** - 点击添加：
   - 本地端口：`8080`，容器端口：`8080`，TCP
   - 再添加：
   - 本地端口：`38457`，容器端口：`8080`，TCP
6. **环境变量** - 点击添加：
   - `RUST_LOG` = `info`
   - `TL_DB_PATH` = `/data/tl_monitor.db`
   - `TL_CONFIG_PATH` = `/config/server_config.yaml`
7. 重启策略：选择 **容器退出时总是重启**
8. 点击 **创建**

### 4. 验证部署

容器创建后等待 1-2 分钟初始化。

在浏览器中访问：

| 地址 | 说明 |
|------|------|
| `http://极空间IP:8080/` | 服务器状态页面 |
| `http://极空间IP:8080/admin` | 管理页面 |
| `http://极空间IP:8080/health` | 健康检查 |

---

## 方式二：使用自定义镜像（自己编译）

如果你需要使用自己编译的 server 二进制文件：

### 1. 确保有 Linux ARM64 二进制文件

如果还没有编译好，需要先在 Mac 上交叉编译或直接在 NAS 上编译。

#### 在 Mac 上交叉编译：

```bash
# 安装交叉编译工具链
rustup target add aarch64-unknown-linux-gnu

# 交叉编译
cargo build --release --target aarch64-unknown-linux-gnu --bin server
```

#### 或直接在 Z2Pro 上编译：

1. SSH 连接到极空间
2. 安装 Rust：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup target add aarch64-unknown-linux-gnu
```

3. 克隆代码后编译

### 2. 创建 Dockerfile.prebuilt

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

WORKDIR /app

COPY server /app/server
COPY resources /app/resources

RUN chown -R appuser:appuser /app

USER appuser
ENV RUST_LOG=info
ENV TL_DB_PATH=/data/tl_monitor.db
ENV TL_CONFIG_PATH=/config/server_config.yaml

EXPOSE 8080

VOLUME ["/data", "/config"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/app/server"]
```

### 3. 构建并推送镜像

```bash
# 在 Mac 上构建 ARM64 镜像
docker buildx create --name mybuilder
docker buildx use mybuilder
docker buildx build --platform linux/arm64 -t tl-monitor:latest --load .

# 或者推送到 GitHub Container Registry
docker buildx build --platform linux/arm64 -t ghcr.io/你的用户名/tl-monitor:latest --push .
```

### 4. 在极空间部署

同方式一的步骤 2-4。

---

## 常见问题

### Q1: 容器启动失败

**检查项：**

1. 确认 `qiandao_fire` 文件存在且在正确位置
2. 确认 `server_config.yaml` 格式正确
3. 查看容器日志排查具体错误

### Q2: 无法访问页面

**检查项：**

1. 确认端口 8080 未被占用
2. 确认防火墙允许 8080 端口
3. 确认容器状态为"运行中"

### Q3: 数据采集失败

**检查项：**

1. 确认网络可以访问 `http://115.231.176.101:8080`
2. 确认 `qiandao_fire` 文件有执行权限（通过 docker-compose 的 chmod +x 或手动赋予）

### Q4: 如何更新配置

1. 停止容器
2. 修改 `config/server_config.yaml`
3. 重启容器

### Q5: 如何备份数据

备份以下文件夹：

```
tl-monitor/
├── data/                      ← 数据库文件
└── config/server_config.yaml  ← 配置文件
```

---

## 目录结构最终确认

```
tl-monitor/
├── docker-compose.yml        （可选）
├── config/
│   └── server_config.yaml    ← 配置文件
├── data/
│   └── tl_monitor.db         ← 数据库（自动创建）
└── resources/
    └── qiandao_fire          ← 火价抓取脚本
```

---

## 客户端连接配置

部署成功后，在客户端中设置：

- 服务器地址：`http://极空间IP:8080`
- 管理密码：`8039`