-- Create table for item realtime fire price tracking (for quick deal hunting)
-- This table stores fire price changes for the last 3 hours
CREATE TABLE IF NOT EXISTS item_realtime_fire_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Composite index for efficient queries
CREATE INDEX IF NOT EXISTS idx_item_scraped ON item_realtime_fire_prices (item_id, scraped_at DESC);

-- Comment explaining the data retention policy
-- Data older than 3 hours should be cleaned up by background task
