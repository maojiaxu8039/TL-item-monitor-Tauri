-- Initial schema for TL Item Monitor (v2)
-- All foreign keys and constraints defined for new installations.

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

CREATE TABLE IF NOT EXISTS items (
    item_id TEXT NOT NULL,
    season_id TEXT NOT NULL DEFAULT 'current',
    market_mode TEXT NOT NULL DEFAULT 'season_normal',
    name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    last_time INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (season_id, market_mode, item_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
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
    purchase_fire_price REAL NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    more_value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_time TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    FOREIGN KEY (season_id, market_mode, item_id) REFERENCES items(season_id, market_mode, item_id)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sections_strategy_order ON sections(strategy_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_section_items_section ON section_items(section_id);

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_strategy ON alert_rules(strategy_id);
CREATE INDEX IF NOT EXISTS idx_section_items_lookup ON section_items(section_id, season_id, market_mode, item_id);

PRAGMA foreign_keys = ON;
