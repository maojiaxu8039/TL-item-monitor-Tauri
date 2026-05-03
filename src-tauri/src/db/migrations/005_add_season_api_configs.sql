-- Migration v5: Add season_api_configs table for per-season API configuration
-- This table stores API parameters for Qiandao and Luosi data sources per season.

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

CREATE INDEX IF NOT EXISTS idx_season_api_configs_season ON season_api_configs(season_id);
