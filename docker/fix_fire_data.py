#!/usr/bin/env python3
import sqlite3
import shutil

print("=== 火价数据补充脚本 ===\n")

# 连接两个数据库
dev_conn = sqlite3.connect('/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/dev_data/tl_monitor.db')
dev_cursor = dev_conn.cursor()

nas_conn = sqlite3.connect('/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/tl_monitor_nas.db')
nas_cursor = nas_conn.cursor()

# 查看当前状态
print("开发环境数据库:")
dev_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
dev_count = dev_cursor.fetchone()[0]
print(f"  总记录数: {dev_count}")

print("\nNAS 数据库:")
nas_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
nas_count = nas_cursor.fetchone()[0]
print(f"  总记录数: {nas_count}")

# 获取 NAS 数据库中已有的 season_day 列表
nas_cursor.execute("SELECT DISTINCT season_day FROM fire_price_snapshots_ss12_normal ORDER BY season_day")
nas_days = set(row[0] for row in nas_cursor.fetchall())
print(f"  已有的赛季天数: {sorted(nas_days)}")

# 获取开发环境数据库中第8-22天的数据
print("\n=== 补充数据 ===")
dev_cursor.execute("""
    SELECT season_day, COUNT(*) as cnt
    FROM fire_price_snapshots_ss12_normal
    WHERE season_day >= 8 AND season_day <= 22
    GROUP BY season_day
    ORDER BY season_day
""")

missing_days = []
for row in dev_cursor.fetchall():
    day, cnt = row
    if day not in nas_days:
        missing_days.append(day)
        print(f"  赛季第{day}天: 需要补充 {cnt} 条数据")
    else:
        print(f"  赛季第{day}天: 已存在 {cnt} 条数据，跳过")

# 补充缺失的数据
if missing_days:
    print(f"\n从开发环境补充第 {min(missing_days)}-{max(missing_days)} 天的数据...")

    # 获取需要补充的数据
    dev_cursor.execute("""
        SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM fire_price_snapshots_ss12_normal
        WHERE season_day >= 8 AND season_day <= 22
        ORDER BY scraped_at
    """)

    records = dev_cursor.fetchall()
    print(f"准备导入 {len(records)} 条数据")

    # 插入数据
    inserted = 0
    for record in records:
        nas_cursor.execute("""
            INSERT OR REPLACE INTO fire_price_snapshots_ss12_normal
            (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, record)
        inserted += 1

    nas_conn.commit()
    print(f"已导入 {inserted} 条数据")
else:
    print("\n无需补充数据，所有赛季天的数据都已存在")

# 最终统计
print("\n=== 补充后 NAS 数据库状态 ===")
nas_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
final_count = nas_cursor.fetchone()[0]
print(f"总记录数: {nas_count} -> {final_count} (+{final_count - nas_count})")

nas_cursor.execute("SELECT season_day, COUNT(*) FROM fire_price_snapshots_ss12_normal GROUP BY season_day ORDER BY season_day")
print("\n按赛季天分布:")
for row in nas_cursor.fetchall():
    print(f"  第{row[0]}天: {row[1]}条")

dev_conn.close()
nas_conn.close()
print("\n✅ 完成！")