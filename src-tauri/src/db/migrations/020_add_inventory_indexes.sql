-- Migration v20: Add inventory tables indexes for better query performance

-- ============================================
-- Inventory Positions Table Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_inventory_positions_season_market
ON inventory_positions(season_id, market_mode);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_item_id
ON inventory_positions(item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_updated
ON inventory_positions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_positions_item_season
ON inventory_positions(item_id, season_id);

-- ============================================
-- Inventory Buy Watches Table Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_season_market
ON inventory_buy_watches(season_id, market_mode);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_item_id
ON inventory_buy_watches(item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_target_price
ON inventory_buy_watches(target_buy_price);

CREATE INDEX IF NOT EXISTS idx_inventory_buy_watches_item_season
ON inventory_buy_watches(item_id, season_id);
