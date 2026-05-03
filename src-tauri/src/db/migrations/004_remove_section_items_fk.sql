-- Migration v4: Remove foreign key constraint from section_items
-- The items table has been split into season/mode specific tables,
-- so the FK constraint to the old items table is no longer valid.

-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table

-- 1. Create temporary table without FK constraint
CREATE TABLE IF NOT EXISTS section_items_new (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'current',
    market_mode TEXT NOT NULL DEFAULT 'season_normal',
    item_id TEXT NOT NULL,
    purchase_fire_price REAL NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    more_value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_time TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- 2. Copy data from old table
INSERT INTO section_items_new 
    SELECT id, section_id, season_id, market_mode, item_id, 
           purchase_fire_price, count, more_value, sort_order, 
           last_time, created_at, updated_at 
    FROM section_items;

-- 3. Drop old table
DROP TABLE section_items;

-- 4. Rename new table
ALTER TABLE section_items_new RENAME TO section_items;

-- 5. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_section_items_section ON section_items(section_id);
CREATE INDEX IF NOT EXISTS idx_section_items_lookup ON section_items(section_id, season_id, market_mode, item_id);
