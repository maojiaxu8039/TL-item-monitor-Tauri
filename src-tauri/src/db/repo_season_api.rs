use crate::core::state::SeasonApiConfig;
use chrono::Utc;
use sqlx::SqlitePool;

/// Get API config for a season. Returns default if not found.
pub async fn get_season_api_config(
    pool: &SqlitePool,
    season_id: &str,
) -> Result<SeasonApiConfig, crate::core::errors::AppError> {
    let row: Option<(String, String, String, String, i32, i32, i32, i32)> = sqlx::query_as(
        "SELECT qiandao_tag_id_normal, qiandao_spec_id_normal, qiandao_tag_id_expert, qiandao_spec_id_expert, luosi_season_id_normal, luosi_season_id_expert, etor_season_id_normal, etor_season_id_expert
         FROM season_api_configs WHERE season_id = ?"
    )
    .bind(season_id)
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        Some((tgn, spn, tge, spe, ln, le, en, ee)) => SeasonApiConfig {
            qiandao_tag_id_normal: tgn,
            qiandao_spec_id_normal: spn,
            qiandao_tag_id_expert: tge,
            qiandao_spec_id_expert: spe,
            luosi_season_id_normal: ln,
            luosi_season_id_expert: le,
            etor_season_id_normal: en,
            etor_season_id_expert: ee,
        },
        None => SeasonApiConfig::default(),
    })
}

/// Upsert API config for a season.
pub async fn set_season_api_config(
    pool: &SqlitePool,
    season_id: &str,
    config: &SeasonApiConfig,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO season_api_configs (season_id, qiandao_tag_id_normal, qiandao_spec_id_normal, qiandao_tag_id_expert, qiandao_spec_id_expert, luosi_season_id_normal, luosi_season_id_expert, etor_season_id_normal, etor_season_id_expert, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET
             qiandao_tag_id_normal = excluded.qiandao_tag_id_normal,
             qiandao_spec_id_normal = excluded.qiandao_spec_id_normal,
             qiandao_tag_id_expert = excluded.qiandao_tag_id_expert,
             qiandao_spec_id_expert = excluded.qiandao_spec_id_expert,
             luosi_season_id_normal = excluded.luosi_season_id_normal,
             luosi_season_id_expert = excluded.luosi_season_id_expert,
             etor_season_id_normal = excluded.etor_season_id_normal,
             etor_season_id_expert = excluded.etor_season_id_expert,
             updated_at = excluded.updated_at"
    )
    .bind(season_id)
    .bind(&config.qiandao_tag_id_normal)
    .bind(&config.qiandao_spec_id_normal)
    .bind(&config.qiandao_tag_id_expert)
    .bind(&config.qiandao_spec_id_expert)
    .bind(config.luosi_season_id_normal)
    .bind(config.luosi_season_id_expert)
    .bind(config.etor_season_id_normal)
    .bind(config.etor_season_id_expert)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}
