-- Migration v18: Add etor season ID columns to season_api_configs table
-- 为 season_api_configs 表添加易火赛季ID字段（普通/专家模式）

-- 检查列是否已存在，如果不存在则添加
-- 使用 PRAGMA table_info 检查列
CREATE TABLE IF NOT EXISTS _temp_check_columns AS
SELECT 'etor_season_id_normal' as col_name WHERE NOT EXISTS (
    SELECT 1 FROM pragma_table_info('season_api_configs') WHERE name = 'etor_season_id_normal'
);
DROP TABLE IF EXISTS _temp_check_columns;

ALTER TABLE season_api_configs ADD COLUMN etor_season_id_normal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE season_api_configs ADD COLUMN etor_season_id_expert INTEGER NOT NULL DEFAULT 0;
