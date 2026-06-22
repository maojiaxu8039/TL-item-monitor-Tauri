-- Migration v22: Backfill season_id and market_mode for existing records
-- For users who created data before the season_id/market_mode fix

-- Update inventory_buy_watches where season_id is empty
-- Use the most common season_id/market_mode for users with only one context
UPDATE inventory_buy_watches
SET season_id = COALESCE(
    (SELECT season_id FROM inventory_buy_watches
     WHERE season_id != '' AND season_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    's1'
),
market_mode = COALESCE(
    (SELECT market_mode FROM inventory_buy_watches
     WHERE season_id != '' AND market_mode != '' AND market_mode IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    'season_normal'
)
WHERE season_id = '' OR season_id IS NULL;

-- Update inventory_positions where season_id is empty
UPDATE inventory_positions
SET season_id = COALESCE(
    (SELECT season_id FROM inventory_positions
     WHERE season_id != '' AND season_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    's1'
),
market_mode = COALESCE(
    (SELECT market_mode FROM inventory_positions
     WHERE season_id != '' AND market_mode != '' AND market_mode IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    'season_normal'
)
WHERE season_id = '' OR season_id IS NULL;

-- Update arbitrage_recipes where season_id is empty
UPDATE arbitrage_recipes
SET season_id = COALESCE(
    (SELECT season_id FROM arbitrage_recipes
     WHERE season_id != '' AND season_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    's1'
),
market_mode = COALESCE(
    (SELECT market_mode FROM arbitrage_recipes
     WHERE season_id != '' AND market_mode != '' AND market_mode IS NOT NULL
     ORDER BY created_at DESC LIMIT 1),
    'season_normal'
)
WHERE season_id = '' OR season_id IS NULL;
