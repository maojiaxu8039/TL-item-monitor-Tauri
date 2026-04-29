-- Migration v2: Add UNIQUE index and additional indexes for existing databases.
-- SQLite cannot ALTER TABLE ADD FOREIGN KEY, so FKs are only enforced
-- for new installations (via 001_initial.sql). This migration adds
-- what SQLite CAN add: indexes and UNIQUE constraints via CREATE UNIQUE INDEX.

-- Prevent duplicate items in the same section
CREATE UNIQUE INDEX IF NOT EXISTS idx_section_items_unique
    ON section_items(section_id, season_id, market_mode, item_id);

-- Index for alert event queries
CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggered_at DESC);

-- Index for alert rule lookups by strategy
CREATE INDEX IF NOT EXISTS idx_alert_rules_strategy ON alert_rules(strategy_id);

-- Composite lookup for section items
CREATE INDEX IF NOT EXISTS idx_section_items_lookup ON section_items(section_id, season_id, market_mode, item_id);
