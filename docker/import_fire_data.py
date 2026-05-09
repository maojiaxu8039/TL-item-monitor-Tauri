#!/usr/bin/env python3
import sqlite3

# 读取本地数据库
local_db = sqlite3.connect('/Users/mc/Downloads/tl_monitor.db')
local_cursor = local_db.cursor()

# 读取火价数据
local_cursor.execute("""
    SELECT
        ten_k,                    -- rmb_per_10k_fire
        fire_per_rmb,             -- fire_per_rmb
        increase_ratio,            -- increase_ratio
        trading_volume,            -- trading_volume
        source,                    -- source
        ts,                       -- source_time
        scraped_at                -- scraped_at
    FROM fire_price_record
    ORDER BY scraped_at
""")

records = local_cursor.fetchall()
local_db.close()

print(f"读取到 {len(records)} 条火价记录")
print("\n前5条记录：")
for i, r in enumerate(records[:5]):
    print(f"  {i+1}. scraped_at={r[6]}, ten_k={r[0]}, source={r[4]}")

print("\n后5条记录：")
for i, r in enumerate(records[-5:]):
    print(f"  {len(records)-4+i}. scraped_at={r[6]}, ten_k={r[0]}, source={r[4]}")

# 计算 season_day (假设 ss12 赛季从4月17日开始)
# scraped_at=1776355200 对应 2026-04-17 00:00:00
base_timestamp = 1776355200  # 2026-04-17 00:00:00 UTC

print(f"\n赛季开始时间戳: {base_timestamp}")

# 导出为SQL文件
with open('/Users/mc/Downloads/import_fire_price.sql', 'w') as f:
    f.write("-- 火价数据导入SQL\n")
    f.write("-- 共 {} 条记录\n\n".format(len(records)))

    for r in records:
        ten_k, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at = r
        season_day = (scraped_at - base_timestamp) // 86400 + 1
        if season_day < 1:
            season_day = 1

        sql = """INSERT OR REPLACE INTO fire_price_snapshots_ss12_normal
(rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day)
VALUES ({}, {}, {}, '{}', '{}', '{}', {}, {});\n""".format(
            ten_k, fire_per_rmb, increase_ratio or 0,
            trading_volume or '', source, source_time, scraped_at, season_day
        )
        f.write(sql)

print(f"\n已生成SQL文件: /Users/mc/Downloads/import_fire_price.sql")
