# TL Monitor Server Dockerfile
# Note: This project does not have a standalone server binary.
# The server functionality is embedded in the Tauri desktop app.
# For server deployment, use server-standalone/ instead.

# This Dockerfile is kept for reference but will NOT build successfully
# because --bin server target does not exist.

# If you need a standalone server, see:
# - server-standalone/ for the independent server implementation
# - Dockerfile.prebuilt for using prebuilt binaries

FROM rust:1.79-bookworm AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# IMPORTANT: This will FAIL because there is no 'server' binary target.
# Only 'tl-monitor' target exists in src-tauri/Cargo.toml
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock* ./
COPY src-tauri/src ./src/

# This command is intentionally left as documentation of the issue.
# To build a server, use server-standalone/ instead.
# RUN cargo build --release --bin server && \
#     strip /target/release/server

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

WORKDIR /app

# COPY --from=builder /target/release/server /app/server

RUN mkdir -p /app/resources /app/config

USER appuser

ENV RUST_LOG=info
ENV TL_DB_PATH=/data/tl_monitor.db
ENV TL_CONFIG_PATH=/app/config/server_config.yaml
ENV TL_RESOURCES_DIR=/app/resources

EXPOSE 8080

VOLUME ["/data", "/app/config", "/app/resources"]

# CMD ["/app/server"]
CMD ["echo", "This Dockerfile is deprecated. Use server-standalone/ instead."]
