#!/bin/bash
# 检查 NAS 服务器 SS12 火价数据
echo '$SSH_PASSWORD' | sudo -S -p '' bash <<'INNER'
sudo docker exec tl-monitor-server sqlite3 -header -column /data/tl_monitor.db "
SELECT
  COUNT(*) AS total,
  MIN(scraped_at) AS min_ts,
  MAX(scraped_at) AS max_ts,
  datetime(MIN(scraped_at), 'unixepoch', 'localtime') AS min_bj,
  datetime(MAX(scraped_at), 'unixepoch', 'localtime') AS max_bj,
  MIN(season_day) AS min_day,
  MAX(season_day) AS max_day
FROM fire_price_snapshots_ss12_normal;
"

echo ""
echo "=== season_day 分布 ==="
sudo docker exec tl-monitor-server sqlite3 -header -column /data/tl_monitor.db "
SELECT season_day, COUNT(*) AS cnt,
  datetime(MIN(scraped_at),'unixepoch','localtime') AS first_bj,
  datetime(MAX(scraped_at),'unixepoch','localtime') AS last_bj
FROM fire_price_snapshots_ss12_normal
GROUP BY season_day ORDER BY season_day LIMIT 20;
"
INNER