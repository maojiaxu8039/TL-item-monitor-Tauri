#!/usr/bin/env python3
"""
SS12 中间段 4/26 ~ 7/13 数据补采 - 刷图小助手 /price/history 版

策略:
- 刷图小助手 /price/history?season_id=1401&item_id=X&range=season
  返回 SS12 从 4/26 起的全部赛季历史（91 天 / 2157 个 15min 数据点）
- 对每个 SS12 item_id 调一次（2077 个物品）
- 按小时写入 item_snapshots_ss12_normal（INSERT OR IGNORE）

输出: /tmp/ss12_backfill_luosi.sql
"""

import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# ============== 配置 ==============
LUOSI_BASE = "http://115.231.176.101:8080"
API_SEASON_ID = "1401"  # SS12 normal

# 目标表名
TABLE_NAME = "item_snapshots_ss12_normal"

# 并发数
MAX_WORKERS = 12

# 进度报告间隔
PROGRESS_INTERVAL = 100

# 复用 SS12 /get?season_id=1401 拿到的物品清单
ITEM_LIST_FILE = "/tmp/luosi_ss12.json"

# SS12 开服时间：4/17 10:00 北京 = 4/17 02:00 UTC
SS12_START = 1776384000


def season_day_for_ts(ts: int, season_start: int) -> int:
    """ts → season_day（按北京自然日切）"""
    BJ_OFFSET = 8 * 3600
    SECS_PER_DAY = 86400
    if ts < season_start:
        return 1
    beijing_ts = ts + BJ_OFFSET
    day_idx = beijing_ts // SECS_PER_DAY
    start_day_idx = (season_start + BJ_OFFSET) // SECS_PER_DAY
    return max(1, (day_idx - start_day_idx) + 1)


# ============== 加载物品清单 ==============
import os

print(f"[1/4] 加载物品清单: {ITEM_LIST_FILE}")
if not os.path.exists(ITEM_LIST_FILE):
    print(f"      文件不存在，先拉取 SS12 物品清单...")
    url = f"{LUOSI_BASE}/get?season_id={API_SEASON_ID}"
    req = urllib.request.Request(url, headers={"User-Agent": "tl-monitor-server"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        with open(ITEM_LIST_FILE, "wb") as f:
            f.write(resp.read())

with open(ITEM_LIST_FILE) as f:
    LUOSI_ITEMS = json.load(f)
print(f"      总物品数: {len(LUOSI_ITEMS)}")


# ============== 抓 price/history ==============
def fetch_price_history(item_id: str) -> tuple[str, list]:
    """从刷图小助手 /price/history 抓物品的赛季历史"""
    url = f"{LUOSI_BASE}/price/history?season_id={API_SEASON_ID}&item_id={item_id}&range=season"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "tl-monitor-server"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            points = data.get("points", [])
            return (item_id, points)
    except Exception as e:
        return (item_id, [])


print(f"[2/4] 并发抓取 {len(LUOSI_ITEMS)} 物品的赛季历史...")
print(f"      并发数: {MAX_WORKERS}")

results = {}
failed = []
completed = 0
start_time = time.time()

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = {executor.submit(fetch_price_history, item_id): item_id for item_id in LUOSI_ITEMS}

    for future in as_completed(futures):
        item_id, points = future.result()
        if points:
            results[item_id] = points
        else:
            failed.append(item_id)
        completed += 1
        if completed % PROGRESS_INTERVAL == 0:
            elapsed = time.time() - start_time
            rate = completed / elapsed if elapsed > 0 else 0
            remaining = (len(LUOSI_ITEMS) - completed) / rate if rate > 0 else 0
            print(
                f"      {completed}/{len(LUOSI_ITEMS)} ({rate:.1f}/s, 剩余 ~{remaining:.0f}s, 失败 {len(failed)})"
            )

print(f"      完成: {completed}, 失败: {len(failed)}, 用时 {time.time()-start_time:.1f}s")
if failed:
    print(f"      失败样本: {failed[:10]}")
print()


# ============== 按整点聚合 ==============
print(f"[3/4] 按整点聚合生成 {TABLE_NAME} 数据...")

# 只补 4/26 之后的数据（之前已经有了）
MIN_SCRAPED_AT = 1777070400  # 2026-04-26 04:00 UTC = 2026-04-26 12:00 北京

hourly_records = []
skipped_no_data = 0
skipped_existing = 0

for item_id, points in results.items():
    item_info = LUOSI_ITEMS[item_id]
    name = item_info.get("name", "")
    item_type = item_info.get("type", "")

    if not points:
        skipped_no_data += 1
        continue

    for pt in points:
        ts = pt.get("ts")
        price = pt.get("price")
        if ts is None or price is None or price <= 0:
            continue
        if price >= 710421059.0:
            continue
        # 只补 4/26 之后（4/26 之前刷图小助手没有，4/26 之后我们数据库缺）
        if ts < MIN_SCRAPED_AT:
            skipped_existing += 1
            continue

        day = season_day_for_ts(ts, SS12_START)
        hourly_records.append(
            (
                item_id,
                name,
                item_type,
                price,
                ts,
                day,
            )
        )

print(f"      生成 {len(hourly_records)} 条小时记录")
print(f"      跳过空数据物品: {skipped_no_data}")
print(f"      跳过已有数据点 (4/26 前): {skipped_existing}")


# ============== 生成 SQL ==============
print(f"[4/4] 生成 INSERT SQL...")

# 排序
hourly_records.sort(key=lambda x: (x[4], x[0]))

sql_lines = [
    "BEGIN TRANSACTION;",
]

for item_id, name, item_type, price, h_ts, day in hourly_records:
    nm = name.replace("'", "''")
    tp = item_type.replace("'", "''")
    sql_lines.append(
        f"INSERT OR IGNORE INTO {TABLE_NAME} "
        f"(item_id, name, item_type, fire_price, scraped_at, season_day) "
        f"VALUES('{item_id}','{nm}','{tp}',{price:.4f},{h_ts},{day});"
    )

sql_lines.append("COMMIT;")

SQL_FILE = "/tmp/ss12_backfill_luosi.sql"
with open(SQL_FILE, "w") as f:
    f.write("\n".join(sql_lines))

print(f"      写入 {SQL_FILE}: {len(sql_lines)} 行 SQL")
print()
print("=== 完成 ===")
print(f"  抓取: {len(results)} 物品")
print(f"  生成记录: {len(hourly_records)} 条")
print(f"  SQL 文件: {SQL_FILE}")