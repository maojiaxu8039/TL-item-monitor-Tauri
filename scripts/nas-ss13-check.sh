#!/bin/bash
echo '$SSH_PASSWORD' | sudo -S -p '' bash <<'INNER'
sudo docker exec tl-monitor-server sqlite3 -header -column /data/tl_monitor.db "
SELECT
  COUNT(*) AS total,
  MIN(season_day) AS min_day,
  MAX(season_day) AS max_day,
  datetime(MIN(scraped_at), 'unixepoch', 'localtime') AS min_bj,
  datetime(MAX(scraped_at), 'unixepoch', 'localtime') AS max_bj,
  ROUND(AVG(rmb_per_10k_fire), 2) AS avg_price
FROM fire_price_snapshots_ss13_normal;
"

echo ""
echo "=== 按 season_day 分布 ==="
sudo docker exec tl-monitor-server sqlite3 -header -column /data/tl_monitor.db "
SELECT season_day, COUNT(*) AS cnt,
  datetime(MIN(scraped_at),'unixepoch','localtime') AS first_bj,
  datetime(MAX(scraped_at),'unixepoch','localtime') AS last_bj
FROM fire_price_snapshots_ss13_normal
GROUP BY season_day ORDER BY season_day;
"

echo ""
echo "=== 7月17号到今天应该有数据吗？==="
echo "今天是 $(date '+%Y-%m-%d %H:%M:%S')"
echo "NAS 上最新数据时间："
sudo docker exec tl-monitor-server sqlite3 /data/tl_monitor.db "
SELECT datetime(MAX(scraped_at), 'unixepoch', 'localtime') FROM fire_price_snapshots_ss13_normal;
"
INNER