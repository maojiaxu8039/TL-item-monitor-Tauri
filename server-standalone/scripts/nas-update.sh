#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p data logs resources

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 server-standalone/.env，请先修改 TL_ADMIN_PASSWORD 后再次运行。"
  exit 1
fi

# 拉取最新镜像
echo "拉取最新镜像..."
docker compose --env-file .env -f docker-compose.yml pull

# 启动服务
echo "启动服务..."
docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans

# 查看状态
echo "服务状态:"
docker compose --env-file .env -f docker-compose.yml ps

echo ""
echo "最新日志:"
docker compose --env-file .env -f docker-compose.yml logs --tail=50 tl-monitor
