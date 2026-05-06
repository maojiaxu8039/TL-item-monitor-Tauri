-- Migration v9: Create strategy_detail tables for game strategy analysis

-- Strategy details table - main strategy info
CREATE TABLE IF NOT EXISTS strategy_details (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT '',
    output_value REAL NOT NULL DEFAULT 0,
    defense_value REAL NOT NULL DEFAULT 0,
    remark TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Strategy costs table - cost items (回响、信标、探针、罗盘等)
CREATE TABLE IF NOT EXISTS strategy_costs (
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

-- Strategy outputs table - output items
CREATE TABLE IF NOT EXISTS strategy_outputs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    count REAL NOT NULL DEFAULT 1,
    estimated_value REAL NOT NULL DEFAULT 0,
    remark TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_strategy_costs_strategy_id ON strategy_costs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outputs_strategy_id ON strategy_outputs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_costs_cost_type ON strategy_costs(cost_type);
