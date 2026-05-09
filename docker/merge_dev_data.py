#!/usr/bin/env python3
import sqlite3
import shutil

# 备份 dev_data 数据库
shutil.copy(
    '/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/dev_data/tl_monitor.db',
    '/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/dev_data/tl_monitor.db.bak'
)
print("已备份开发数据库")

# 连接开发数据库
dev_conn = sqlite3.connect('/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/dev_data/tl_monitor.db')
dev_cursor = dev_conn.cursor()

# 读取 NAS 数据库
nas_conn = sqlite3.connect('/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/tl_monitor_nas.db')

print("\n=== 当前开发数据库状态 ===")
dev_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
dev_fire_count = dev_cursor.fetchone()[0]
print(f"火价记录: {dev_fire_count}")

dev_cursor.execute("SELECT COUNT(*) FROM item_snapshots_ss12_normal")
dev_item_count = dev_cursor.fetchone()[0]
print(f"物品记录: {dev_item_count}")

print("\n=== NAS 数据库状态 ===")
nas_cursor = nas_conn.cursor()
nas_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
nas_fire_count = nas_cursor.fetchone()[0]
print(f"火价记录: {nas_fire_count}")

nas_cursor.execute("SELECT COUNT(*) FROM item_snapshots_ss12_normal")
nas_item_count = nas_cursor.fetchone()[0]
print(f"物品记录: {nas_item_count}")

# 导入火价数据
print("\n=== 导入火价数据 ===")
nas_cursor.execute("""
    SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
    FROM fire_price_snapshots_ss12_normal
""")
fire_records = nas_cursor.fetchall()
print(f"准备导入 {len(fire_records)} 条火价记录")

for record in fire_records:
    dev_cursor.execute("""
        INSERT OR REPLACE INTO fire_price_snapshots_ss12_normal
        (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, record)

print(f"火价数据导入完成")

# 导入物品数据
print("\n=== 导入物品数据 ===")
nas_cursor.execute("""
    SELECT item_id, name, item_type, fire_price, scraped_at, season_day
    FROM item_snapshots_ss12_normal
""")
item_records = nas_cursor.fetchall()
print(f"准备导入 {len(item_records)} 条物品记录")

for record in item_records:
    dev_cursor.execute("""
        INSERT OR REPLACE INTO item_snapshots_ss12_normal
        (item_id, name, item_type, fire_price, scraped_at, season_day)
        VALUES (?, ?, ?, ?, ?, ?)
    """, record)

print(f"物品数据导入完成")

# 提交更改
dev_conn.commit()

print("\n=== 导入后状态 ===")
dev_cursor.execute("SELECT COUNT(*) FROM fire_price_snapshots_ss12_normal")
final_fire_count = dev_cursor.fetchone()[0]
print(f"火价记录: {dev_fire_count} -> {final_fire_count} (+{final_fire_count - dev_fire_count})")

dev_cursor.execute("SELECT COUNT(*) FROM item_snapshots_ss12_normal")
final_item_count = dev_cursor.fetchone()[0]
print(f"物品记录: {dev_item_count} -> {final_item_count} (+{final_item_count - dev_item_count})")

# 查看时间范围
dev_cursor.execute("SELECT datetime(MIN(scraped_at), 'unixepoch'), datetime(MAX(scraped_at), 'unixepoch') FROM fire_price_snapshots_ss12_normal")
time_range = dev_cursor.fetchone()
print(f"火价时间范围: {time_range[0]} ~ {time_range[1]}")

dev_conn.close()
nas_conn.close()

print("\n✅ 数据导入完成！")