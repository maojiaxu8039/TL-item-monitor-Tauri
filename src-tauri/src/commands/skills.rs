use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String,
    #[serde(default)]
    pub enabled: bool,
}

fn get_openclaw_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("HOME") {
        let openclaw_path = PathBuf::from(home).join(".openclaw");
        if openclaw_path.exists() {
            return Some(openclaw_path);
        }
    }

    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let openclaw_path = PathBuf::from(userprofile).join(".openclaw");
        if openclaw_path.exists() {
            return Some(openclaw_path);
        }
    }

    None
}

fn parse_frontmatter(content: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();

    if let Some(start) = content.find("---") {
        if let Some(end) = content[start + 3..].find("---") {
            let yaml = &content[start + 3..start + 3 + end];
            for line in yaml.lines() {
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim();
                    let mut value = line[colon_pos + 1..].trim().to_string();
                    value = value.trim_matches('"').trim_matches('\'').to_string();

                    match key {
                        "name" => name = value,
                        "description" => description = value,
                        _ => {}
                    }
                }
            }
        }
    }

    (name, description)
}

fn read_skills_from_dir(dir_path: &PathBuf, source: &str) -> Vec<SkillInfo> {
    let mut skills = Vec::new();

    if !dir_path.exists() {
        return skills;
    }

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    if let Ok(content) = fs::read_to_string(&skill_md) {
                        let (name, description) = parse_frontmatter(&content);
                        let skill_name = if name.is_empty() {
                            path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string()
                        } else {
                            name
                        };

                        skills.push(SkillInfo {
                            name: skill_name,
                            description: if description.is_empty() {
                                "No description".to_string()
                            } else {
                                description
                            },
                            path: path.to_string_lossy().to_string(),
                            source: source.to_string(),
                            enabled: false,
                        });
                    }
                }
            }
        }
    }

    skills
}

#[tauri::command]
pub fn get_installed_skills() -> Vec<SkillInfo> {
    let mut all_skills = Vec::new();

    if let Some(openclaw_dir) = get_openclaw_dir() {
        let system_skills_dir = openclaw_dir.join("skills");
        let workspace_skills_dir = openclaw_dir.join("workspace").join("skills");

        let system_skills = read_skills_from_dir(&system_skills_dir, "system");
        let workspace_skills = read_skills_from_dir(&workspace_skills_dir, "workspace");

        all_skills.extend(system_skills);
        all_skills.extend(workspace_skills);
    }

    all_skills
}
