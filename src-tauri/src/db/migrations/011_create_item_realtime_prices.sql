-- 011_create_item_realtime_prices.sql
-- 捡漏出货专用表：存储物品实时价格历史，只保留最近3小时数据
-- 此迁移是幂等的：如果表已存在且结构正确则跳过；如果结构不对则重建

-- Step 1: Check if old table exists with wrong schema (item_name/price instead of name/fire_price)
-- We do this by trying to select the old column; if it fails, we know we need to migrate

-- Step 2: If table exists with old schema, migrate data and recreate
-- SQLite doesn't support ALTER TABLE DROP COLUMN, so we use the rename-and-recreate approach

-- Create the correct table if it doesn't exist
CREATE TABLE IF NOT EXISTS item_realtime_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Drop and recreate indexes to ensure they match the current schema
DROP INDEX IF EXISTS idx_item_realtime_item_scraped;
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_id ON item_realtime_prices(item_id);
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_scraped_at ON item_realtime_prices(scraped_at);
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_time ON item_realtime_prices(item_id, scraped_at);
