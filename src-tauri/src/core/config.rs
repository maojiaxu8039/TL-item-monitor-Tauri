use crate::core::paths::config_path;
use crate::core::state::{
    AppConfig, AppSettings, DataSettings, DealSettings, DesktopSettings, NotificationSettings,
    ScrapeSettings,
};

/// Legacy flat config for migration from pre-nested schema.
#[derive(Debug, serde::Deserialize)]
#[serde(default)]
struct LegacyAppConfig {
    schema_version: u32,
    fire_price_mode: String,
    fire_price_scrape_interval: u64,
    fire_price_scrape_enabled: bool,
    items_source: String,
    items_json_path: String,
    items_reload_interval: u64,
    auto_reload: bool,
    #[serde(default)]
    expert_enabled: bool,
    season_id: String,
}

impl Default for LegacyAppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            fire_price_mode: "season_normal".to_string(),
            fire_price_scrape_interval: 300,
            fire_price_scrape_enabled: true,
            items_source: "api".to_string(),
            items_json_path: String::new(),
            items_reload_interval: 300,
            auto_reload: true,
            expert_enabled: false,
            season_id: "ss12".to_string(),
        }
    }
}

/// Load config from YAML file. If file doesn't exist, creates it with defaults.
/// Automatically migrates legacy flat configs to the new nested schema.
pub fn load_config() -> Result<AppConfig, String> {
    let path = config_path();

    if !path.exists() {
        let config = AppConfig::default();
        save_config(&config)?;
        return Ok(config);
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config file: {}", e))?;

    let value: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse config YAML: {}", e))?;

    // Detect old flat format by checking for legacy top-level keys
    let is_flat = value.get("fire_price_mode").is_some() || value.get("items_source").is_some();

    let config = if is_flat {
        let flat: LegacyAppConfig = serde_yaml::from_value(value)
            .map_err(|e| format!("Failed to parse legacy config: {}", e))?;
        let migrated = AppConfig {
            schema_version: flat.schema_version,
            scrape: ScrapeSettings {
                fire_price_mode: flat.fire_price_mode,
                fire_price_scrape_interval: flat.fire_price_scrape_interval,
                fire_price_scrape_enabled: flat.fire_price_scrape_enabled,
                fire_scrape_normal_enabled: true,
                fire_scrape_expert_enabled: flat.expert_enabled,
                items_source: flat.items_source,
                items_json_path: flat.items_json_path,
                items_reload_interval: flat.items_reload_interval,
                auto_reload: flat.auto_reload,
                items_scrape_normal_enabled: true,
                items_scrape_expert_enabled: flat.expert_enabled,
            },
            desktop: DesktopSettings::default(),
            notification: NotificationSettings::default(),
            deal: DealSettings::default(),
            data: DataSettings::default(),
            app: AppSettings {
                season_id: flat.season_id,
                ..Default::default()
            },
        };
        save_config(&migrated)?;
        migrated
    } else {
        serde_yaml::from_value(value).map_err(|e| format!("Failed to parse config YAML: {}", e))?
    };

    Ok(config)
}

/// Save config to YAML file.
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let yaml =
        serde_yaml::to_string(config).map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, yaml).map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}
