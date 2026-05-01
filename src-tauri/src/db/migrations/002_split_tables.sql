-- Migration 002: Split tables by market mode (normal/expert)
-- This creates separate tables for season_normal and season_expert

-- Drop old tables if they exist (will be recreated with new structure)
-- Only drop if migrating from old schema

-- Create fire price current tables (one per mode)
CREATE TABLE IF NOT EXISTS fire_price_normal (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL,
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(season_id, scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_expert (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL,
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(season_id, scraped_at)
);

-- Create fire history tables (one per mode)
CREATE TABLE IF NOT EXISTS fire_history_normal (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL,
    source_time TEXT,
    recorded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_history_expert (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL,
    source_time TEXT,
    recorded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Create items tables (one per mode)
CREATE TABLE IF NOT EXISTS items_normal (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT,
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL,
    UNIQUE(season_id, item_id)
);

CREATE TABLE IF NOT EXISTS items_expert (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT,
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL,
    UNIQUE(season_id, item_id)
);

-- Create items history tables (one per mode)
CREATE TABLE IF NOT EXISTS items_history_normal (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT,
    price REAL NOT NULL,
    last_time INTEGER,
    recorded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items_history_expert (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_type TEXT,
    price REAL NOT NULL,
    last_time INTEGER,
    recorded_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- Create section_items tables (one per mode)
CREATE TABLE IF NOT EXISTS section_items_normal (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    purchase_fire_price REAL NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    more_value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_time TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    UNIQUE(section_id, item_id, season_id)
);

CREATE TABLE IF NOT EXISTS section_items_expert (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    purchase_fire_price REAL NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    more_value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_time TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    UNIQUE(section_id, item_id, season_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_fire_normal_season ON fire_price_normal(season_id);
CREATE INDEX IF NOT EXISTS idx_fire_normal_time ON fire_price_normal(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_fire_expert_season ON fire_price_expert(season_id);
CREATE INDEX IF NOT EXISTS idx_fire_expert_time ON fire_price_expert(scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_fire_history_normal_season ON fire_history_normal(season_id);
CREATE INDEX IF NOT EXISTS idx_fire_history_normal_time ON fire_history_normal(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fire_history_expert_season ON fire_history_expert(season_id);
CREATE INDEX IF NOT EXISTS idx_fire_history_expert_time ON fire_history_expert(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_normal_season ON items_normal(season_id);
CREATE INDEX IF NOT EXISTS idx_items_normal_type ON items_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_items_normal_name ON items_normal(name);
CREATE INDEX IF NOT EXISTS idx_items_expert_season ON items_expert(season_id);
CREATE INDEX IF NOT EXISTS idx_items_expert_type ON items_expert(item_type);
CREATE INDEX IF NOT EXISTS idx_items_expert_name ON items_expert(name);

CREATE INDEX IF NOT EXISTS idx_items_history_normal_season ON items_history_normal(season_id);
CREATE INDEX IF NOT EXISTS idx_items_history_normal_item ON items_history_normal(item_id);
CREATE INDEX IF NOT EXISTS idx_items_history_normal_time ON items_history_normal(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_history_expert_season ON items_history_expert(season_id);
CREATE INDEX IF NOT EXISTS idx_items_history_expert_item ON items_history_expert(item_id);
CREATE INDEX IF NOT EXISTS idx_items_history_expert_time ON items_history_expert(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_section_items_normal_section ON section_items_normal(section_id);
CREATE INDEX IF NOT EXISTS idx_section_items_normal_season ON section_items_normal(season_id);
CREATE INDEX IF NOT EXISTS idx_section_items_expert_section ON section_items_expert(section_id);
CREATE INDEX IF NOT EXISTS idx_section_items_expert_season ON section_items_expert(season_id);
