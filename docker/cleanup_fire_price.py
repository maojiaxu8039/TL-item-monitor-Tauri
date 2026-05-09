#!/usr/bin/env python3
import sqlite3
import shutil
from datetime import datetime

db_path = '/Users/mc/Downloads/tl_monitor.db'

# 备份原文件
backup_path = '/Users/mc/Downloads/tl_monitor_backup.db'
shutil.copy(db_path, backup_path)
print("已备份原文件:", backup_path)

# 连接数据库
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 查看清理前的数据
print("\n=== 清理前 ===")
cursor.execute("SELECT COUNT(*) FROM fire_price_record")
print(f"火价记录数: {cursor.fetchone()[0]}")
cursor.execute("SELECT COUNT(*) FROM items")
print(f"物品记录数: {cursor.fetchone()[0]}")
cursor.execute("SELECT COUNT(*) FROM item_price_log")
print(f"物品价格日志数: {cursor.fetchone()[0]}")

# 删除所有物品数据
print("\n=== 删除物品数据 ===")
cursor.execute("DELETE FROM item_price_log")
print(f"已删除 item_price_log: {cursor.rowcount} 条")
cursor.execute("DELETE FROM items")
print(f"已删除 items: {cursor.rowcount} 条")

# 分析火价数据
print("\n=== 火价数据分析 ===")
cursor.execute("""
    SELECT scraped_at, datetime(scraped_at, 'unixepoch'), mode, ten_k
    FROM fire_price_record
    ORDER BY scraped_at
""")
records = cursor.fetchall()
print(f"总火价记录: {len(records)} 条")
print(f"时间范围: {records[0][1]} 到 {records[-1][1]}")

# 统计模式
cursor.execute("SELECT mode, COUNT(*) FROM fire_price_record GROUP BY mode")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]} 条")

# 提交更改
conn.commit()
conn.close()

print("\n=== 清理完成 ===")
print("已生成清理后的文件:", db_path)
