#!/usr/bin/env python3
import sqlite3
import csv

nas_db_path = '/Users/mc/Downloads/tl_monitor_nas.db'

print("正在连接本地数据库...")
conn = sqlite3.connect(nas_db_path)
cursor = conn.cursor()

base_timestamp = 1776355200

csv_file = '/Users/mc/Downloads/物价历史_S1401_20260509_230238.csv'

print("读取CSV文件...")
cursor.execute("SELECT COUNT(*) FROM item_snapshots_ss12_normal")
before_count = cursor.fetchone()[0]
print(f"导入前记录数: {before_count}")

print("开始导入数据...")
insert_count = 0

with open(csv_file, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        item_id = row['物品ID']
        name = row['物品名称'].replace("'", "''")
        item_type = row['类型'].replace("'", "''")
        scraped_at = row['时间戳']
        price = row['价格']

        season_day = (int(scraped_at) - base_timestamp) // 86400 + 1
        if season_day < 1:
            season_day = 1

        cursor.execute("""
            INSERT OR REPLACE INTO item_snapshots_ss12_normal
            (item_id, name, item_type, fire_price, scraped_at, season_day)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (item_id, name, item_type, float(price), int(scraped_at), season_day))

        insert_count += 1
        if insert_count % 50000 == 0:
            print(f"已导入 {insert_count} 条...")
            conn.commit()

conn.commit()

cursor.execute("SELECT COUNT(*) FROM item_snapshots_ss12_normal")
after_count = cursor.fetchone()[0]
print(f"导入后记录数: {after_count}")
print(f"本次导入: {after_count - before_count} 条")

conn.close()
print("导入完成！")