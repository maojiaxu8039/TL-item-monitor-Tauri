-- Migration v3: Split items and fire_price_records by season and market mode
-- This creates separate tables for each season/mode combination

-- ============================================
-- SS12 Season Normal Tables
-- ============================================

CREATE TABLE IF NOT EXISTS items_ss12_normal (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_price_ss12_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss12_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    UNIQUE(item_id, scraped_at)
);

-- ============================================
-- SS12 Season Expert Tables
-- ============================================

CREATE TABLE IF NOT EXISTS items_ss12_expert (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_price_ss12_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss12_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    UNIQUE(item_id, scraped_at)
);

-- ============================================
-- SS11 Season Normal Tables
-- ============================================

CREATE TABLE IF NOT EXISTS items_ss11_normal (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_price_ss11_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss11_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    UNIQUE(item_id, scraped_at)
);

-- ============================================
-- SS11 Season Expert Tables
-- ============================================

CREATE TABLE IF NOT EXISTS items_ss11_expert (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_price_ss11_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss11_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    UNIQUE(item_id, scraped_at)
);

-- ============================================
-- Indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ss12_normal_items_name ON items_ss12_normal(name);
CREATE INDEX IF NOT EXISTS idx_ss12_normal_items_type ON items_ss12_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_ss12_normal_fire_scraped ON fire_price_ss12_normal(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_item ON item_snapshots_ss12_normal(item_id, scraped_at);

CREATE INDEX IF NOT EXISTS idx_ss12_expert_items_name ON items_ss12_expert(name);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_items_type ON items_ss12_expert(item_type);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_fire_scraped ON fire_price_ss12_expert(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_item ON item_snapshots_ss12_expert(item_id, scraped_at);

CREATE INDEX IF NOT EXISTS idx_ss11_normal_items_name ON items_ss11_normal(name);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_items_type ON items_ss11_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_fire_scraped ON fire_price_ss11_normal(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_item ON item_snapshots_ss11_normal(item_id, scraped_at);

CREATE INDEX IF NOT EXISTS idx_ss11_expert_items_name ON items_ss11_expert(name);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_items_type ON items_ss11_expert(item_type);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_fire_scraped ON fire_price_ss11_expert(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_item ON item_snapshots_ss11_expert(item_id, scraped_at);
