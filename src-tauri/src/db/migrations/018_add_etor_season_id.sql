-- Migration v18: Add etor season ID columns to season_api_configs table
-- 为 season_api_configs 表添加易火赛季ID字段（普通/专家模式）

ALTER TABLE season_api_configs ADD COLUMN etor_season_id_normal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE season_api_configs ADD COLUMN etor_season_id_expert INTEGER NOT NULL DEFAULT 0;
