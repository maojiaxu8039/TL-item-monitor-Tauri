#!/usr/bin/env python3
"""导入 SS13 CSV 到桌面端数据库"""
import sqlite3
import csv
import os

DB = "/Users/mc/Library/Application Support/com.torchscan.desktop/tl_monitor.db"
CSV = "/Users/mc/Downloads/torchscan-sync/ss13_normal.csv"

# 先清空
con = sqlite3.connect(DB)
cur = con.cursor()
cur.execute("DELETE FROM fire_price_snapshots_ss13_normal")
print(f"清空 SS13_normal")

# 读 CSV
rows = []
with open(CSV, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        rows.append((
            float(r["rmb_per_10k_fire"]),
            float(r["fire_per_rmb"]) if r["fire_per_rmb"] else 0,
            float(r["increase_ratio"]) if r["increase_ratio"] else 0,
            r["trading_volume"] or "",
            r["source"] or "",
            r["source_time"] or "",
            int(r["scraped_at"]),
            int(r["season_day"]),
        ))

print(f"读 CSV: {len(rows)} 行")

# 用 INSERT OR REPLACE 避免 UNIQUE(scraped_at) 冲突
cur.executemany("""
INSERT OR REPLACE INTO fire_price_snapshots_ss13_normal
  (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
""", rows)
con.commit()
print(f"导入完成: {cur.rowcount} 行")

# 验证
cur.execute("SELECT COUNT(*), MIN(season_day), MAX(season_day), MIN(scraped_at), MAX(scraped_at) FROM fire_price_snapshots_ss13_normal")
total, min_day, max_day, min_ts, max_ts = cur.fetchone()
print(f"数据库现在: {total} 条, season_day {min_day}-{max_day}")
print(f"  时间范围: {min_ts} - {max_ts}")

# 检查 7/17 13:00 之前的数据
import time
threshold = int(time.mktime(time.strptime("2026-07-17 13:00:00", "%Y-%m-%d %H:%M:%S"))) - 8 * 3600  # 北京转 UTC
cur.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss13_normal WHERE scraped_at < ?", (threshold,))
before = cur.fetchone()[0]
print(f"7/17 13:00 之前的数据: {before} 条（应=0）")

con.close()
print("✅ 完成")