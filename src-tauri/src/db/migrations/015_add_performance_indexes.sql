-- Migration v15: Add performance indexes for critical query paths
-- Addresses N+1 queries and slow lookups identified in code review

-- Strategy details indexes (for filtering by label/difficulty)
CREATE INDEX IF NOT EXISTS idx_strategy_details_label ON strategy_details(label);
CREATE INDEX IF NOT EXISTS idx_strategy_details_difficulty ON strategy_details(difficulty);
CREATE INDEX IF NOT EXISTS idx_strategy_details_label_difficulty ON strategy_details(label, difficulty);

-- Arbitrage recipes indexes
CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_enabled ON arbitrage_recipes(enabled);
CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_type_enabled ON arbitrage_recipes(recipe_type, enabled);

-- Strategy detail costs indexes (for realtime price lookups)
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_realtime ON strategy_detail_costs(strategy_id, is_realtime);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_item_id ON strategy_detail_costs(item_id);

-- Strategy detail outputs indexes
CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_name ON strategy_detail_outputs(strategy_id, item_name);

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
