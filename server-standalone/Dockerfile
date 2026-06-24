# TL Monitor Server - 本地开发用镜像
# 仅用于本地开发，不用于极空间部署
# 极空间使用 ghcr.io/maojiaxu8039/tl-monitor-server:latest + volume 挂载

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    libssl3 \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash -u 1001 monitor

WORKDIR /app

# 本地开发时，从 ../target/... 拷贝二进制进来
COPY target/release/tl-monitor-server /usr/local/bin/tl-monitor-server
RUN chmod +x /usr/local/bin/tl-monitor-server

RUN mkdir -p /app/data /app/logs /app/resources \
    && chown -R monitor:monitor /app

USER monitor

EXPOSE 8080

ENV TL_CONFIG_PATH=/app/server_config.yaml \
    TL_DB_PATH=/app/data/tl-monitor.db \
    TL_RESOURCES_DIR=/app/resources \
    TL_LOG_LEVEL=info \
    RUST_LOG=info

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/tl-monitor-server"]
