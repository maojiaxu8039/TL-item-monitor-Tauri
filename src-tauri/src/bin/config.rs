//! 服务器配置文件

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub season_id: String,
    pub http_port: u16,
    pub scrape_modes: Vec<ScrapeMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapeMode {
    pub mode: String,
    pub enabled: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            season_id: "ss12".to_string(),
            http_port: 8080,
            scrape_modes: vec![
                ScrapeMode { mode: "normal".to_string(), enabled: true },
                ScrapeMode { mode: "expert".to_string(), enabled: true },
            ],
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
        let yaml = serde_yaml::to_string(&default_config)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        std::fs::write(path, yaml).map_err(|e| format!("写入配置文件失败: {}", e))?;
        return Ok(default_config);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_yaml::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}
