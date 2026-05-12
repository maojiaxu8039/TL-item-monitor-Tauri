-- Migration v13: Fix arbitrage tables - use item_name only, remove item_id
-- This migration drops and recreates the ingredients and outputs tables

-- Drop old tables (data will be lost, users need to re-create recipes)
DROP TABLE IF EXISTS arbitrage_ingredients;
DROP TABLE IF EXISTS arbitrage_outputs;

-- Recreate ingredients table with item_name only
CREATE TABLE IF NOT EXISTS arbitrage_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    count REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
);

-- Recreate outputs table with item_name only
CREATE TABLE IF NOT EXISTS arbitrage_outputs (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    count REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_recipe ON arbitrage_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_recipe ON arbitrage_outputs(recipe_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_name ON arbitrage_ingredients(item_name);
CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_name ON arbitrage_outputs(item_name);
