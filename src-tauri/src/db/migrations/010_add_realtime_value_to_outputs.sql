-- Migration v10: Add realtime_value to strategy_outputs (idempotent)
-- This column may already exist in newer initial schemas

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pragma_table_info('strategy_outputs') WHERE name = 'realtime_value'
    ) THEN
        ALTER TABLE strategy_outputs ADD COLUMN realtime_value REAL NOT NULL DEFAULT 0;
    END IF;
END $$;
