-- Migration v12: Create arbitrage recipe tables for price comparison analysis
-- Using item_name instead of item_id for easier management

-- Recipe groups table - main recipe info
CREATE TABLE IF NOT EXISTS arbitrage_recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    recipe_type TEXT NOT NULL DEFAULT 'decompose',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Recipe ingredients table - input materials (using item_name)
CREATE TABLE IF NOT EXISTS arbitrage_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    count REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
);

-- Recipe outputs table - output products (using item_name)
CREATE TABLE IF NOT EXISTS arbitrage_outputs (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    count REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_type ON arbitrage_recipes(recipe_type);
CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_recipe ON arbitrage_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_recipe ON arbitrage_outputs(recipe_id);
CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_name ON arbitrage_ingredients(item_name);
CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_name ON arbitrage_outputs(item_name);
