-- Migration v6: Add season_day column to fire_price and items tables
-- season_day represents the day number within the season (1, 2, 3, ...)
-- This helps track data relative to season start date

-- Add season_day to real-time fire_price tables (no season suffix)
ALTER TABLE fire_price_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Add season_day to real-time items tables (no season suffix)
ALTER TABLE items_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Add season_day to snapshot tables (with season suffix)
ALTER TABLE item_snapshots_ss12_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss12_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss11_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE item_snapshots_ss11_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Add season_day to fire price snapshot tables
ALTER TABLE fire_price_snapshots_ss12_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_snapshots_ss12_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_snapshots_ss11_normal ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fire_price_snapshots_ss11_expert ADD COLUMN season_day INTEGER NOT NULL DEFAULT 1;

-- Create indexes for season_day lookups on real-time tables
CREATE INDEX IF NOT EXISTS idx_fire_normal_season_day ON fire_price_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_fire_expert_season_day ON fire_price_expert(season_day);
CREATE INDEX IF NOT EXISTS idx_items_normal_season_day ON items_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_items_expert_season_day ON items_expert(season_day);

-- Create indexes for season_day lookups on snapshot tables
CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_season_day ON item_snapshots_ss12_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_season_day ON item_snapshots_ss12_expert(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_season_day ON item_snapshots_ss11_normal(season_day);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_season_day ON item_snapshots_ss11_expert(season_day);
