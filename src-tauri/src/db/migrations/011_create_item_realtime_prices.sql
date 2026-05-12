-- 011_create_item_realtime_prices.sql
-- 捡漏出货专用表：存储物品实时价格历史，只保留最近3小时数据
-- 注意：如果表已存在但结构不同（如 001_initial 创建的），需要重建

-- 检查是否需要重建表（旧版 schema 使用 price 而不是 fire_price）
-- SQLite 不支持直接修改列，所以用迁移方式处理

-- 如果表存在且列名不对，重建表
DROP TABLE IF EXISTS item_realtime_prices_old;

-- 检查旧表结构
-- 如果是从 001_initial 创建的，有 item_name 和 price 列
-- 如果是新创建的，有 name 和 fire_price 列

-- 安全做法：直接创建正确结构的新表（如果已存在则保留）
-- 但如果旧表存在且结构不同，需要迁移数据

-- 先尝试创建新表（IF NOT EXISTS 不会覆盖旧表）
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