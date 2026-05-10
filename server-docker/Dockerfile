FROM rust:1.79-bookworm-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY src-tauri/Cargo.toml src-tauri/Cargo.lock* ./
COPY src-tauri/src ./src/

RUN cargo build --release --bin server && \
    strip /target/release/server

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

WORKDIR /app

COPY --from=builder /target/release/server /app/server

RUN mkdir -p /app/resources /app/config

USER appuser

ENV RUST_LOG=info
ENV TL_DB_PATH=/data/tl_monitor.db
ENV TL_CONFIG_PATH=/config/server_config.yaml
ENV TL_RESOURCES_DIR=/app/resources

EXPOSE 8080

VOLUME ["/data", "/app/config", "/app/resources"]

CMD ["/app/server"]