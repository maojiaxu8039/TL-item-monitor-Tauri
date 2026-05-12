-- Migration v10: Add realtime_value to strategy_outputs
-- NOTE: This migration is applied conditionally in Rust code.
-- The apply_sql_migration function checks if the column already exists
-- before executing this SQL, making it safe for both old and new schemas.

ALTER TABLE strategy_outputs ADD COLUMN realtime_value REAL NOT NULL DEFAULT 0;
