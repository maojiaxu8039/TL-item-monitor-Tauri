-- 011_create_item_realtime_prices.sql
-- 捡漏出货专用表：存储物品实时价格历史，只保留最近3小时数据

CREATE TABLE IF NOT EXISTS item_realtime_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 复合索引用于查询和去重
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_id ON item_realtime_prices(item_id);
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_scraped_at ON item_realtime_prices(scraped_at);
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_time ON item_realtime_prices(item_id, scraped_at);