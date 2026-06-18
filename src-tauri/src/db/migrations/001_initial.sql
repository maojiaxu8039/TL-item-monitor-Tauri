-- Initial schema for TL Item Monitor (v2)
-- Real-time tables: items_normal, items_expert, fire_price_normal, fire_price_expert
-- Snapshot tables: item_snapshots_{season}_{mode}, fire_price_snapshots_{season}_{mode}

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    ended_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Per-season API configuration for data sources
CREATE TABLE IF NOT EXISTS season_api_configs (
    season_id TEXT PRIMARY KEY,
    qiandao_tag_id_normal TEXT NOT NULL DEFAULT '',
    qiandao_spec_id_normal TEXT NOT NULL DEFAULT '',
    qiandao_tag_id_expert TEXT NOT NULL DEFAULT '',
    qiandao_spec_id_expert TEXT NOT NULL DEFAULT '',
    luosi_season_id_normal INTEGER NOT NULL DEFAULT 0,
    luosi_season_id_expert INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
);

-- Real-time items table for normal mode (no season suffix)
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

-- Real-time items table for expert mode
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

-- Real-time fire price table for normal mode
-- UNIQUE(scraped_at) 使 repo_fire::insert_fire_record 的 ON CONFLICT(scraped_at) UPSERT 生效
CREATE TABLE IF NOT EXISTS fire_price_normal (
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

-- Real-time fire price table for expert mode
CREATE TABLE IF NOT EXISTS fire_price_expert (
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

CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    strategy_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS section_items (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'current',
    market_mode TEXT NOT NULL DEFAULT 'season_normal',
    item_id TEXT NOT NULL,
    item_name TEXT,
    item_type TEXT,
    current_price REAL,
    purchase_fire_price REAL NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    more_value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_time TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    season_scope TEXT NOT NULL DEFAULT 'all',
    enabled INTEGER NOT NULL DEFAULT 1,
    consider_ratio REAL NOT NULL DEFAULT 1.15,
    sort_rule TEXT NOT NULL DEFAULT 'purchase_gap',
    notification_enabled INTEGER NOT NULL DEFAULT 1,
    cooldown_seconds INTEGER NOT NULL DEFAULT 1800,
    quiet_start TEXT,
    quiet_end TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_costs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'ss12',
    market_mode TEXT NOT NULL DEFAULT 'season_normal',
    fire_price REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_outputs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'ss12',
    market_mode TEXT NOT NULL DEFAULT 'season_normal',
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL DEFAULT '',
    item_type TEXT NOT NULL DEFAULT '',
    buy_price REAL NOT NULL DEFAULT 0,
    sell_price REAL NOT NULL DEFAULT 0,
    profit_rate REAL NOT NULL DEFAULT 0,
    realtime_value REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_details (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL DEFAULT '',
    output_value REAL NOT NULL DEFAULT 0,
    defense_value REAL NOT NULL DEFAULT 0,
    remark TEXT,
    image_url TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_detail_costs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    cost_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT,
    count REAL NOT NULL DEFAULT 1,
    fire_price REAL NOT NULL DEFAULT 0,
    total_fire REAL NOT NULL DEFAULT 0,
    is_realtime INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS strategy_detail_outputs (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    count REAL NOT NULL DEFAULT 1,
    estimated_value REAL NOT NULL DEFAULT 0,
    realtime_value REAL DEFAULT 0,
    remark TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    strategy_id TEXT,
    section_id TEXT,
    item_id TEXT,
    rule_type TEXT NOT NULL DEFAULT 'price_threshold',
    threshold REAL NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    cooldown_seconds INTEGER NOT NULL DEFAULT 1800,
    last_triggered_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    section_item_id TEXT,
    triggered_at INTEGER NOT NULL,
    message TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_diagnostics (
    source TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    market_mode TEXT,
    local_path TEXT,
    last_success_at INTEGER,
    last_failure_at INTEGER,
    last_duration_ms INTEGER,
    last_item_count INTEGER,
    last_error TEXT,
    updated_at INTEGER NOT NULL
);

-- Real-time item price changes (for quick deal hunting)
-- NOTE: This table is recreated in migration v11 with the correct column names.
-- We create a temporary version here to avoid breaking old code, but v11 will
-- handle the proper schema with 'name' and 'fire_price' columns.
CREATE TABLE IF NOT EXISTS item_realtime_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fire_price REAL NOT NULL,
    scraped_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_item_realtime_item_scraped ON item_realtime_prices(item_id, scraped_at DESC);

-- Indexes for real-time tables
CREATE INDEX IF NOT EXISTS idx_fire_price_normal_scraped ON fire_price_normal(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_fire_price_expert_scraped ON fire_price_expert(scraped_at DESC);

-- Indexes for sections
CREATE INDEX IF NOT EXISTS idx_sections_strategy_order ON sections(strategy_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_section_items_section ON section_items(section_id);

-- Indexes for alert events
CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_strategy ON alert_rules(strategy_id);

-- Indexes for section_items lookup
CREATE INDEX IF NOT EXISTS idx_section_items_lookup ON section_items(section_id, season_id, market_mode, item_id);

-- Indexes for strategy tables
CREATE INDEX IF NOT EXISTS idx_strategy_costs_strategy ON strategy_costs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_outputs_strategy ON strategy_outputs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_details_label ON strategy_details(label);
CREATE INDEX IF NOT EXISTS idx_strategy_details_difficulty ON strategy_details(difficulty);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_id ON strategy_detail_costs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_id ON strategy_detail_outputs(strategy_id);

PRAGMA foreign_keys = ON;
