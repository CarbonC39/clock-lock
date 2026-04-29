use std::fs;
use serde::{Deserialize, Serialize};
use tauri::Manager as _;

fn default_max_context_messages() -> u32 { 30 }
fn default_max_tokens() -> u32 { 4096 }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentSettings {
    pub provider: String,   // "cloud" | "ollama"
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub personality: String,
    #[serde(default = "default_max_context_messages")]
    pub max_context_messages: u32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: "cloud".into(),
            base_url: "https://api.openai.com/v1".into(),
            api_key: String::new(),
            model: "gpt-4o-mini".into(),
            personality: "helpful and encouraging senior developer".into(),
            max_context_messages: 30,
            max_tokens: 4096,
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("settings.json"))
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> AgentSettings {
    let Ok(path) = settings_path(&app) else { return AgentSettings::default(); };
    let Ok(raw) = fs::read_to_string(path) else { return AgentSettings::default(); };
    serde_json::from_str(&raw).unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AgentSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
