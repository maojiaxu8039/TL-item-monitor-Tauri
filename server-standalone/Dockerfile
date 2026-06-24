# syntax=docker/dockerfile:1

FROM rust:1.85-bookworm AS builder

WORKDIR /app
COPY server-standalone/Cargo.toml server-standalone/Cargo.lock ./server-standalone/
COPY server-standalone/src ./server-standalone/src
COPY src-tauri/resources/item_id_mapping.json ./src-tauri/resources/item_id_mapping.json

WORKDIR /app/server-standalone
RUN cargo build --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/server-standalone/target/release/tl-monitor-server /usr/local/bin/tl-monitor-server
COPY src-tauri/resources/qiandao_fire.cjs /app/resources/qiandao_fire.cjs
COPY src-tauri/resources/qiandao_fire.mjs /app/resources/qiandao_fire.mjs
COPY src-tauri/resources/item_id_mapping.json /app/resources/item_id_mapping.json

ENV TL_CONFIG_PATH=/config/server_config.yaml \
    TL_DB_PATH=/data/tl_monitor.db \
    TL_RESOURCES_DIR=/app/resources \
    RUST_LOG=info

VOLUME ["/config", "/data"]
EXPOSE 8080 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/tl-monitor-server"]
