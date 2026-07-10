-- Migration v24: Add runs_per_hour field to strategy_details

ALTER TABLE strategy_details ADD COLUMN runs_per_hour REAL NOT NULL DEFAULT 0;
