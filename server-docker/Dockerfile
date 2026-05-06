FROM rust:1.85-bookworm-slim AS builder

WORKDIR /build

COPY Cargo.toml Cargo.lock* ./
COPY src/ ./src/

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN cargo build --release --bin server
RUN strip /target/release/server

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

WORKDIR /app
COPY --from=builder /target/release/server /app/server
COPY --from=builder /build/resources /app/resources

RUN chown -R appuser:appuser /app

USER appuser
ENV RUST_LOG=info
ENV TL_DB_PATH=/data/tl_monitor.db
ENV TL_CONFIG_PATH=/config/server_config.yaml

EXPOSE 8080

VOLUME ["/data", "/config"]

CMD ["/app/server"]
