#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p config data

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 server-standalone/.env，请先修改 TL_ADMIN_PASSWORD 后再次运行。"
  exit 1
fi

docker compose --env-file .env -f docker-compose.yml build --pull
docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=80 torchscan-server
