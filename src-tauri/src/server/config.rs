//! 服务器配置文件

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub season_id: String,
    pub http_port: u16,
    pub scrape_modes: Vec<ScrapeMode>,
    pub admin_password: String,
    pub api_config: ApiConfig,
    #[serde(default)]
    pub cors_allowed_origins: Vec<String>,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
    #[serde(default)]
    pub api_endpoints: ApiEndpoints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub enabled: bool,
    pub requests_per_minute: u32,
    pub burst_size: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            requests_per_minute: 60,
            burst_size: 10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiEndpoints {
    #[serde(default = "default_luosi_api")]
    pub luosi: String,
    #[serde(default = "default_qiandao_api")]
    pub qiandao: String,
    #[serde(default = "default_qiandao_fire_endpoint")]
    pub qiandao_fire_endpoint: String,
}

fn default_luosi_api() -> String {
    "http://115.231.176.101:8080".to_string()
}

fn default_qiandao_api() -> String {
    "https://api.qiandao.com".to_string()
}

fn default_qiandao_fire_endpoint() -> String {
    "/c2c-web/v1/common/currency-spu-price-list".to_string()
}

impl Default for ApiEndpoints {
    fn default() -> Self {
        Self {
            luosi: default_luosi_api(),
            qiandao: default_qiandao_api(),
            qiandao_fire_endpoint: default_qiandao_fire_endpoint(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapeMode {
    pub mode: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub qiandao_tag_id_normal: String,
    pub qiandao_spec_id_normal: String,
    pub qiandao_tag_id_expert: String,
    pub qiandao_spec_id_expert: String,
    pub luosi_season_id_normal: i32,
    pub luosi_season_id_expert: i32,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            qiandao_tag_id_normal: "1560053".to_string(),
            qiandao_spec_id_normal: "267416".to_string(),
            qiandao_tag_id_expert: "1560055".to_string(),
            qiandao_spec_id_expert: "267417".to_string(),
            luosi_season_id_normal: 1401,
            luosi_season_id_expert: 1431,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            season_id: "ss12".to_string(),
            http_port: 8080,
            scrape_modes: vec![
                ScrapeMode {
                    mode: "normal".to_string(),
                    enabled: true,
                },
                ScrapeMode {
                    mode: "expert".to_string(),
                    enabled: true,
                },
            ],
            admin_password: "".to_string(),
            api_config: ApiConfig::default(),
            cors_allowed_origins: vec![
                "http://localhost:5173".to_string(),
                "http://localhost:8080".to_string(),
                "http://localhost:38457".to_string(),
            ],
            environment: "development".to_string(),
            rate_limit: RateLimitConfig::default(),
            api_endpoints: ApiEndpoints::default(),
        }
    }
}

pub fn load_config<P: AsRef<Path>>(path: P) -> Result<ServerConfig, String> {
    let path = path.as_ref();

    if !path.exists() {
        let default_config = ServerConfig::default();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        let yaml =
            serde_yaml::to_string(&default_config).map_err(|e| format!("序列化配置失败: {}", e))?;
        std::fs::write(path, yaml).map_err(|e| format!("写入配置文件失败: {}", e))?;
        return Ok(default_config);
    }

    let content = std::fs::read_to_string(path).map_err(|e| format!("读取配置文件失败: {}", e))?;

    let mut config: ServerConfig =
        serde_yaml::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))?;

    if config.api_endpoints.luosi.is_empty() {
        config.api_endpoints.luosi = default_luosi_api();
    }
    if config.api_endpoints.qiandao.is_empty() {
        config.api_endpoints.qiandao = default_qiandao_api();
    }
    if config.api_endpoints.qiandao_fire_endpoint.is_empty() {
        config.api_endpoints.qiandao_fire_endpoint = default_qiandao_fire_endpoint();
    }

    Ok(config)
}

pub fn save_config<P: AsRef<Path>>(path: P, config: &ServerConfig) -> Result<(), String> {
    let yaml = serde_yaml::to_string(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(path, yaml).map_err(|e| format!("写入配置文件失败: {}", e))
}
