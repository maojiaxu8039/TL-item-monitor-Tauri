#!/usr/bin/env python3
import csv
import os

csv_file = '/Users/mc/Downloads/物价历史_S1401_20260509_230238.csv'

base_timestamp = 1776355200

# 尝试不同编码
encodings = ['utf-8-sig', 'utf-16', 'gbk', 'gb2312', 'latin1']
reader = None

for enc in encodings:
    try:
        with open(csv_file, 'r', encoding=enc) as f:
            reader = csv.DictReader(f)
            first_row = next(reader)
            print(f"成功使用编码: {enc}")
            print(f"列名: {list(first_row.keys())}")
            break
    except Exception as e:
        print(f"编码 {enc} 失败: {e}")
        continue

if reader is None:
    print("所有编码都失败")
    exit(1)

sql_lines = []
sql_lines.append("-- 物品价格历史数据导入")
sql_lines.append("")

# 获取正确的列名
headers = list(first_row.keys())
print(f"列名: {headers}")

# 重新打开文件读取所有数据
with open(csv_file, 'r', encoding=enc) as f:
    reader = csv.DictReader(f)
    item_count = 0
    for row in reader:
        item_id = row.get(headers[0], '')  # 物品ID
        name = row.get(headers[1], '').replace("'", "''")  # 物品名称
        item_type = row.get(headers[2], '').replace("'", "''")  # 类型
        scraped_at = row.get(headers[3], '')  # 时间戳
        price = row.get(headers[5], '')  # 价格

        if not item_id or not scraped_at or not price:
            continue

        season_day = (int(scraped_at) - base_timestamp) // 86400 + 1
        if season_day < 1:
            season_day = 1

        sql = f"INSERT OR REPLACE INTO item_snapshots_ss12_normal (item_id, name, item_type, fire_price, scraped_at, season_day) VALUES ('{item_id}', '{name}', '{item_type}', {price}, {scraped_at}, {season_day});"
        sql_lines.append(sql)
        item_count += 1

print(f"读取CSV完成，共 {item_count} 条记录")

output_sql = '/Users/mc/Downloads/import_item_price.sql'
with open(output_sql, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"已生成SQL文件: {output_sql}")
print(f"文件大小: {os.path.getsize(output_sql) / 1024 / 1024:.2f} MB")