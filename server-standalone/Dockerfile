# TL Item Monitor Server - 多阶段构建
# Stage 1: builder - 编译 release 二进制
# Stage 2: runtime - 仅含运行所需的最小镜像

# ==================== Stage 1: builder ====================
FROM rust:1.75-slim AS builder

# 安装构建依赖
# - pkg-config / libssl-dev: sqlx + reqwest with native-tls 依赖
# - ca-certificates: HTTPS 请求需要
# - build-essential / cmake: 某些 crate (libsqlite3-sys) 需要 C 编译器
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# 先复制 Cargo 文件以最大化缓存
COPY Cargo.toml Cargo.lock* ./

# 复制源代码
COPY src ./src
# 复制 item mapping 资源 (编译时 include_str! 需要)
# 注: 生产环境建议用 TL_RESOURCES_DIR 环境变量挂载,而非 bake into 镜像
COPY ../src-tauri/resources/item_id_mapping.json /tmp/resources/item_id_mapping.json 2>/dev/null || true

# Release 构建
# - 减少二进制体积
# - strip: 去掉调试符号
ENV CARGO_TERM_COLOR=always \
    RUSTFLAGS="-C strip=symbols"

RUN cargo build --release \
    && strip target/release/tl-monitor-server

# ==================== Stage 2: runtime ====================
FROM debian:bookworm-slim AS runtime

# 安装运行时依赖
# - ca-certificates: HTTPS
# - libsqlite3-0 / libssl3: sqlx / reqwest 动态库
# - tini: 正确处理 SIGTERM,让 graceful_shutdown 工作
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    libssl3 \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash -u 1001 monitor

# 复制编译产物
COPY --from=builder /build/target/release/tl-monitor-server /usr/local/bin/tl-monitor-server

# 数据目录（运行时挂载点）
WORKDIR /app
RUN mkdir -p /app/data /app/logs /app/resources \
    && chown -R monitor:monitor /app

USER monitor

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/usr/local/bin/tl-monitor-server", "--health-check"] || \
    wget -qO- http://localhost:8080/health/live || exit 1

# 环境变量默认值
ENV TL_CONFIG_PATH=/app/data/server_config.yaml \
    TL_DB_PATH=/app/data/tl-monitor.db \
    TL_RESOURCES_DIR=/app/resources \
    TL_LOG_LEVEL=info \
    RUST_LOG=info

# tini 作为 init: 正确转发信号 (SIGTERM/SIGINT) 给应用
# 让 graceful_shutdown 路径走完:等待 in-flight 请求 + WAL checkpoint
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/tl-monitor-server"]
