#!/usr/bin/env python3
import csv
import os
import calendar
from datetime import datetime

csv_file = '/Users/mc/Downloads/fire_price_cleaned.csv'
base_timestamp = 1776355200

sql_lines = ["-- 火价数据导入SQL", ""]

count = 0
enc = 'utf-8'

with open(csv_file, 'r', encoding=enc) as f:
    reader = csv.DictReader(f)
    headers = reader.fieldnames
    print(f"列名: {headers}")

    time_key = headers[0]
    price_key = headers[1]
    fire_key = headers[2]
    ratio_key = headers[3]

    for row in reader:
        time_str = row[time_key].replace('%', '').strip()
        rmb_per_10k = row[price_key]
        fire_per_rmb = row[fire_key]
        increase_ratio = row[ratio_key]

        try:
            dt = datetime.strptime(time_str, '%Y/%m/%d %H:%M')
        except:
            try:
                dt = datetime.strptime(time_str, '%Y/%m/%d %H:%M:%S')
            except:
                print(f"无法解析时间: {time_str}")
                continue

        scraped_at = int(calendar.timegm(dt.utctimetuple()))
        season_day = (scraped_at - base_timestamp) // 86400 + 1
        if season_day < 1:
            season_day = 1

        source_time = dt.strftime('%Y-%m-%d %H:%M')
        sql = f"INSERT OR REPLACE INTO fire_price_snapshots_ss12_normal (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day) VALUES ({rmb_per_10k}, {fire_per_rmb}, {increase_ratio}, '', '千岛API-赛季普通', '{source_time}', {scraped_at}, {season_day});"
        sql_lines.append(sql)
        count += 1

print(f"读取CSV完成，共 {count} 条记录")

output_sql = '/Users/mc/Downloads/import_fire_price_clean.sql'
with open(output_sql, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"已生成SQL文件: {output_sql}")
print(f"文件大小: {os.path.getsize(output_sql) / 1024:.2f} KB")