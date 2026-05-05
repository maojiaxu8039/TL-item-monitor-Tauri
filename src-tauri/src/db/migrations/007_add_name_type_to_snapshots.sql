-- Add name and item_type columns to item snapshot tables
-- These columns are needed for the ItemsPage search and display functionality

-- SS12 Normal
ALTER TABLE item_snapshots_ss12_normal ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE item_snapshots_ss12_normal ADD COLUMN item_type TEXT NOT NULL DEFAULT '';

-- SS12 Expert
ALTER TABLE item_snapshots_ss12_expert ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE item_snapshots_ss12_expert ADD COLUMN item_type TEXT NOT NULL DEFAULT '';

-- SS11 Normal
ALTER TABLE item_snapshots_ss11_normal ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE item_snapshots_ss11_normal ADD COLUMN item_type TEXT NOT NULL DEFAULT '';

-- SS11 Expert
ALTER TABLE item_snapshots_ss11_expert ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE item_snapshots_ss11_expert ADD COLUMN item_type TEXT NOT NULL DEFAULT '';

-- Create indexes for name and item_type lookups
CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_name ON item_snapshots_ss12_normal(name);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_name ON item_snapshots_ss12_expert(name);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_name ON item_snapshots_ss11_normal(name);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_name ON item_snapshots_ss11_expert(name);

CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_type ON item_snapshots_ss12_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_type ON item_snapshots_ss12_expert(item_type);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_type ON item_snapshots_ss11_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_type ON item_snapshots_ss11_expert(item_type);
