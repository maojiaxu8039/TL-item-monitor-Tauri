#!/usr/bin/env python3
"""
SS13 day 1-5 历史数据补采脚本

策略:
- 易火 etor API 有 7 天历史（从开服 7/17 18:45 到 7/24 17:45）
- 对每个 item_id 调一次 chart API，拿到 15min 间隔数据点
- 按小时聚合成物品快照（每小时 1 个数据点）
- 写入 item_snapshots_ss13_normal 表

输出:
- /tmp/ss13_backfill.sql 包含所有 INSERT 语句
"""

import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============== 配置 ==============
ETOR_BASE = "https://etor.710421059.xyz"
API_SEASON_ID = "1501"  # SS13 normal
ITEM_MAPPING_FILE = "/Users/mc/项目/TL-item-monitor-Tauri/src-tauri/resources/item_id_mapping.json"

# 目标表名
TABLE_NAME = "item_snapshots_ss13_normal"

# 并发数（避免被 API 限流）
MAX_WORKERS = 8

# 请求间隔（秒）
REQUEST_INTERVAL = 0.05

# 进度报告间隔
PROGRESS_INTERVAL = 100

# ============== 加载 mapping ==============
print(f"[1/4] 加载 item mapping: {ITEM_MAPPING_FILE}")
with open(ITEM_MAPPING_FILE) as f:
    ITEM_MAPPING = json.load(f)
print(f"      总物品数: {len(ITEM_MAPPING)}")

# 只补 etor 有数据的物品（source: 'etor' 或 'both'）
ETOR_ITEMS = [
    (item_id, info)
    for item_id, info in ITEM_MAPPING.items()
    if info.get("source") in ("etor", "both")
]
print(f"      etor 可补采: {len(ETOR_ITEMS)} 物品")
print()


# ============== 抓 chart ==============
def fetch_chart(item_id: str) -> tuple[str, list]:
    """从易火 API 抓单个物品的 chart 数据（最近 7 天）"""
    url = f"{ETOR_BASE}/etor-api/api/chart/{API_SEASON_ID}/{item_id}?interval=15m"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "tl-monitor-server"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            trend = data.get("trend", [])
            return (item_id, trend)
    except Exception as e:
        return (item_id, [])


print(f"[2/4] 并发抓取 {len(ETOR_ITEMS)} 物品的 7 天历史 chart 数据...")
print(f"      并发数: {MAX_WORKERS}")

results = {}
failed = []
completed = 0
start_time = time.time()

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = {executor.submit(fetch_chart, item_id): item_id for item_id, _ in ETOR_ITEMS}

    for future in as_completed(futures):
        item_id, trend = future.result()
        if trend:
            results[item_id] = trend
        else:
            failed.append(item_id)
        completed += 1
        if completed % PROGRESS_INTERVAL == 0:
            elapsed = time.time() - start_time
            rate = completed / elapsed if elapsed > 0 else 0
            remaining = (len(ETOR_ITEMS) - completed) / rate if rate > 0 else 0
            print(
                f"      {completed}/{len(ETOR_ITEMS)} ({rate:.1f}/s, 剩余 ~{remaining:.0f}s, 失败 {len(failed)})"
            )
        time.sleep(REQUEST_INTERVAL)

print(f"      完成: {completed}, 失败: {len(failed)}, 用时 {time.time()-start_time:.1f}s")
if failed:
    print(f"      失败样本: {failed[:10]}")
print()


# ============== 按小时聚合 ==============
print(f"[3/4] 按小时聚合成 {TABLE_NAME} 数据...")


def to_hour_ts(ts_ms: int) -> int:
    """15min ms 时间戳 → 整点小时秒时间戳"""
    ts_s = ts_ms // 1000
    return ts_s - (ts_s % 3600)


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


# SS13 开服时间：7/17 10:00 北京 = 1784253600
SS13_START = 1784253600

# 收集 (item_id, hour_ts, fire_price) 三元组
hourly_records = []
skipped_no_data = 0

for item_id, info in ETOR_ITEMS:
    if item_id not in results:
        skipped_no_data += 1
        continue

    name = info["name"]
    item_type = info.get("type", "")

    # 按小时聚合
    hour_prices: dict[int, list] = {}
    for pt in results[item_id]:
        ts_ms = pt.get("timestamp")
        price = pt.get("price")
        if ts_ms is None or price is None or price <= 0:
            continue
        # 过滤 710421059.0 这个无效标记
        if price >= 710421059.0:
            continue
        h_ts = to_hour_ts(ts_ms)
        hour_prices.setdefault(h_ts, []).append(price)

    for h_ts, prices in hour_prices.items():
        if not prices:
            continue
        # 取小时均价
        avg_price = sum(prices) / len(prices)
        day = season_day_for_ts(h_ts, SS13_START)
        hourly_records.append(
            (
                item_id,
                name,
                item_type,
                avg_price,
                h_ts,
                day,
            )
        )

print(f"      生成 {len(hourly_records)} 条小时记录, 跳过空数据物品 {skipped_no_data}")


# ============== 生成 SQL ==============
print(f"[4/4] 生成 INSERT SQL...")

# 排序：按 (hour_ts, item_id)
hourly_records.sort(key=lambda x: (x[4], x[0]))

sql_lines = [
    "BEGIN TRANSACTION;",
]

for item_id, name, item_type, price, h_ts, day in hourly_records:
    # 字段顺序: item_id, name, item_type, fire_price, scraped_at, season_day
    nm = name.replace("'", "''")
    tp = item_type.replace("'", "''")
    sql_lines.append(
        f"INSERT OR IGNORE INTO {TABLE_NAME} "
        f"(item_id, name, item_type, fire_price, scraped_at, season_day) "
        f"VALUES('{item_id}','{nm}','{tp}',{price:.4f},{h_ts},{day});"
    )

sql_lines.append("COMMIT;")

SQL_FILE = "/tmp/ss13_backfill.sql"
with open(SQL_FILE, "w") as f:
    f.write("\n".join(sql_lines))

print(f"      写入 {SQL_FILE}: {len(sql_lines)} 行 SQL")
print()
print("=== 完成 ===")
print(f"  抓取: {len(results)} 物品")
print(f"  生成记录: {len(hourly_records)} 条")
print(f"  SQL 文件: {SQL_FILE}")