-- Migration v21: Add season_id and market_mode to arbitrage_recipes table

ALTER TABLE arbitrage_recipes ADD COLUMN season_id TEXT NOT NULL DEFAULT '';
ALTER TABLE arbitrage_recipes ADD COLUMN market_mode TEXT NOT NULL DEFAULT 'season_normal';

CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_season_mode
ON arbitrage_recipes(season_id, market_mode);
