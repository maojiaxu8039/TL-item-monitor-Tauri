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
            luosi_season_id_normal: 1401, // ss12 normal: 200*12-1000+1
            luosi_season_id_expert: 1431, // ss12 expert: 200*12-1000+31
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
            admin_password: "admin123".to_string(),
            api_config: ApiConfig::default(),
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

    serde_yaml::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))
}

pub fn save_config<P: AsRef<Path>>(path: P, config: &ServerConfig) -> Result<(), String> {
    let yaml = serde_yaml::to_string(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(path, yaml).map_err(|e| format!("写入配置文件失败: {}", e))
}
