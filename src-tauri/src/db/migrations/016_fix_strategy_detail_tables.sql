-- Migration v16: Ensure strategy_detail_costs and strategy_detail_outputs tables exist
-- This fixes the case where v9 migration was marked as applied but tables weren't created

-- Create strategy_detail_costs table if not exists
CREATE TABLE IF NOT EXISTS strategy_detail_costs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    cost_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT,
    count REAL NOT NULL DEFAULT 1,
    fire_price REAL NOT NULL DEFAULT 0,
    total_fire REAL NOT NULL DEFAULT 0,
    is_realtime INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
);

-- Create strategy_detail_outputs table if not exists
CREATE TABLE IF NOT EXISTS strategy_detail_outputs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    count REAL NOT NULL DEFAULT 1,
    estimated_value REAL NOT NULL DEFAULT 0,
    realtime_value REAL DEFAULT 0,
    remark TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_id ON strategy_detail_costs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_id ON strategy_detail_outputs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_cost_type ON strategy_detail_costs(cost_type);