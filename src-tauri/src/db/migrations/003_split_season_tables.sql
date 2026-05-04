-- Migration v3: Split tables by season and market mode
-- Real-time tables (no season suffix): items_normal/expert, fire_price_normal/expert
-- Snapshot tables (with season suffix): item_snapshots_ss{season}_{mode}, fire_price_snapshots_ss{season}_{mode}

-- ============================================
-- Real-time Tables (Current Season Only)
-- ============================================

CREATE TABLE IF NOT EXISTS items_normal (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    season_day INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items_expert (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    season_day INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fire_price_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    UNIQUE(scraped_at)
);

-- ============================================
-- SS12 Season Snapshot Tables
-- ============================================

CREATE TABLE IF NOT EXISTS item_snapshots_ss12_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_snapshots_ss12_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss12_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_snapshots_ss12_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scraped_at)
);

-- ============================================
-- SS11 Season Snapshot Tables
-- ============================================

CREATE TABLE IF NOT EXISTS item_snapshots_ss11_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_snapshots_ss11_normal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scraped_at)
);

CREATE TABLE IF NOT EXISTS item_snapshots_ss11_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(item_id, scraped_at)
);

CREATE TABLE IF NOT EXISTS fire_price_snapshots_ss11_expert (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmb_per_10k_fire REAL NOT NULL,
    fire_per_rmb REAL NOT NULL DEFAULT 0,
    increase_ratio REAL,
    trading_volume TEXT,
    source TEXT NOT NULL DEFAULT '',
    source_time TEXT,
    scraped_at INTEGER NOT NULL,
    season_day INTEGER NOT NULL DEFAULT 1,
    UNIQUE(scraped_at)
);

-- ============================================
-- Indexes for performance
-- ============================================

-- Real-time tables indexes
CREATE INDEX IF NOT EXISTS idx_items_normal_name ON items_normal(name);
CREATE INDEX IF NOT EXISTS idx_items_normal_type ON items_normal(item_type);
CREATE INDEX IF NOT EXISTS idx_items_expert_name ON items_expert(name);
CREATE INDEX IF NOT EXISTS idx_items_expert_type ON items_expert(item_type);
CREATE INDEX IF NOT EXISTS idx_fire_price_normal_scraped ON fire_price_normal(scraped_at);
CREATE INDEX IF NOT EXISTS idx_fire_price_expert_scraped ON fire_price_expert(scraped_at);

-- SS12 snapshot indexes
CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_item ON item_snapshots_ss12_normal(item_id, scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss12_normal_fire_snapshots_scraped ON fire_price_snapshots_ss12_normal(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_item ON item_snapshots_ss12_expert(item_id, scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss12_expert_fire_snapshots_scraped ON fire_price_snapshots_ss12_expert(scraped_at);

-- SS11 snapshot indexes
CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_item ON item_snapshots_ss11_normal(item_id, scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss11_normal_fire_snapshots_scraped ON fire_price_snapshots_ss11_normal(scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_item ON item_snapshots_ss11_expert(item_id, scraped_at);
CREATE INDEX IF NOT EXISTS idx_ss11_expert_fire_snapshots_scraped ON fire_price_snapshots_ss11_expert(scraped_at);
