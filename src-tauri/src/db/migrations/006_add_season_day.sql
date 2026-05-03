-- Migration v6: Add season_day column to fire_price and items tables
-- season_day represents the day number within the season (1, 2, 3, ...)
-- This helps track data relative to season start date

-- Add season_day to all existing fire_price tables
ALTER TABLE fire_price_ss12_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_ss12_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_ss11_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_ss11_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Add season_day to all existing items tables
ALTER TABLE items_ss12_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items_ss12_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items_ss11_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items_ss11_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Add season_day to item_snapshots tables
ALTER TABLE item_snapshots_ss12_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss12_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss11_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss11_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Create indexes for season_day lookups
CREATE INDEX IF NOT EXISTS idx_ss12_normal_fire_season_day ON fire_price_ss12_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_fire_season_day ON fire_price_ss12_expert(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_fire_season_day ON fire_price_ss11_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_fire_season_day ON fire_price_ss11_expert(season_day);

CREATE INDEX IF NOT EXISTS idx_ss12_normal_items_season_day ON items_ss12_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_items_season_day ON items_ss12_expert(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_items_season_day ON items_ss11_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_items_season_day ON items_ss11_expert(season_day);
