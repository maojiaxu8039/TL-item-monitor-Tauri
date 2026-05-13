-- Migration v15: Add performance indexes for critical query paths
-- ALSO creates strategy_detail_costs and strategy_detail_outputs tables if they don't exist
-- This ensures the migration works even if v9 failed to create the tables

-- ============================================
-- Step 1: Ensure strategy_detail tables exist (in case v9 failed)
-- ============================================

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

-- ============================================
-- Step 2: Create indexes for better performance
-- ============================================

-- Strategy detail costs indexes
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_id ON strategy_detail_costs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_realtime ON strategy_detail_costs(strategy_id, is_realtime);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_item_id ON strategy_detail_costs(item_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_cost_type ON strategy_detail_costs(cost_type);

-- Strategy detail outputs indexes
CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_id ON strategy_detail_outputs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_name ON strategy_detail_outputs(strategy_id, item_name);

-- Strategy details indexes (for filtering by label/difficulty)
CREATE INDEX IF NOT EXISTS idx_strategy_details_label ON strategy_details(label);
CREATE INDEX IF NOT EXISTS idx_strategy_details_difficulty ON strategy_details(difficulty);
CREATE INDEX IF NOT EXISTS idx_strategy_details_label_difficulty ON strategy_details(label, difficulty);

-- Arbitrage recipes indexes
CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_enabled ON arbitrage_recipes(enabled);
CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_type_enabled ON arbitrage_recipes(recipe_type, enabled);

-- Section items composite index for common lookups
CREATE INDEX IF NOT EXISTS idx_section_items_composite ON section_items(section_id, season_id, market_mode, item_id);

-- Items table indexes for name lookups
CREATE INDEX IF NOT EXISTS idx_items_normal_name ON items_normal(name);
CREATE INDEX IF NOT EXISTS idx_items_expert_name ON items_expert(name);

-- Fire price indexes for latest lookup optimization
CREATE INDEX IF NOT EXISTS idx_fire_price_normal_scraped_covering ON fire_price_normal(scraped_at DESC, rmb_per_10k_fire, fire_per_rmb);
CREATE INDEX IF NOT EXISTS idx_fire_price_expert_scraped_covering ON fire_price_expert(scraped_at DESC, rmb_per_10k_fire, fire_per_rmb);

-- Realtime prices index optimization
CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_covering ON item_realtime_prices(item_id, scraped_at DESC, fire_price);

-- Alert rules indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_rules_section ON alert_rules(section_id);

-- Source diagnostics index
CREATE INDEX IF NOT EXISTS idx_source_diagnostics_enabled ON source_diagnostics(enabled);