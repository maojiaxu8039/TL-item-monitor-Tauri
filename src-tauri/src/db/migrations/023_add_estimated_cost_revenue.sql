-- Migration v23: Add estimated cost and revenue range fields to strategy_details

ALTER TABLE strategy_details ADD COLUMN estimated_cost REAL NOT NULL DEFAULT 0;
ALTER TABLE strategy_details ADD COLUMN estimated_revenue_min REAL NOT NULL DEFAULT 0;
ALTER TABLE strategy_details ADD COLUMN estimated_revenue_max REAL NOT NULL DEFAULT 0;
