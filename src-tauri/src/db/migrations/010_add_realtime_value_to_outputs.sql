-- Migration v10: Add realtime_value to strategy_outputs

ALTER TABLE strategy_outputs ADD COLUMN realtime_value REAL NOT NULL DEFAULT 0;
