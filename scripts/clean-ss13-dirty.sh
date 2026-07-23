#!/bin/bash
APP_DIR="/Users/mc/Library/Application Support/com.torchscan.desktop"
DB="$APP_DIR/tl_monitor.db"

echo "=== 1. 备份 ==="
BAK="$DB.bak.$(date +%s)"
cp "$DB" "$BAK"
ls -la "$BAK" | awk '{print $5, $9}'

echo ""
echo "=== 2. 清理前数据 ==="
sqlite3 -header -column "$DB" "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN rmb_per_10k_fire = 0 THEN 1 ELSE 0 END) AS zeros
FROM fire_price_snapshots_ss13_normal;
"

echo ""
echo "=== 3. 删除 7/17 13:00 之前所有数据（UTC 时间）==="
# 7/17 13:00 北京 = 7/17 05:00 UTC
sqlite3 "$DB" "
DELETE FROM fire_price_snapshots_ss13_normal
WHERE scraped_at < 1784408400;
"

echo ""
echo "=== 4. 清理后数据 ==="
sqlite3 -header -column "$DB" "
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN rmb_per_10k_fire = 0 THEN 1 ELSE 0 END) AS zeros,
  datetime(MIN(scraped_at), 'unixepoch', 'localtime') AS min_bj,
  datetime(MAX(scraped_at), 'unixepoch', 'localtime') AS max_bj
FROM fire_price_snapshots_ss13_normal;
"

echo ""
echo "=== 5. season_day 重新分布 ==="
sqlite3 -header -column "$DB" "
SELECT season_day, COUNT(*) AS cnt
FROM fire_price_snapshots_ss13_normal
GROUP BY season_day ORDER BY season_day;
"