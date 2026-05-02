use std::fs;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::Manager as _;

fn default_max_context_messages() -> u32 { 30 }
fn default_max_tokens() -> u32 { 4096 }
fn default_shell_path() -> String {
    if cfg!(target_os = "windows") { "cmd".into() } else { "sh".into() }
}
fn default_startup_mode() -> String { "window".into() }
fn default_close_behavior() -> String { "close".into() }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentSettings {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub personality: String,
    #[serde(default = "default_max_context_messages")]
    pub max_context_messages: u32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_shell_path")]
    pub shell_path: String,
    #[serde(default = "default_startup_mode")]
    pub startup_mode: String,
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
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
            shell_path: default_shell_path(),
            startup_mode: "window".into(),
            close_behavior: "close".into(),
        }
    }
}

/// Deterministic djb2 hash → 16-char hex key
fn hash_key(app: &tauri::AppHandle) -> String {
    let salt = app
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "clock-lock-fallback".into());
    let mut h: u64 = 5381;
    for b in salt.bytes() {
        h = h.wrapping_mul(33).wrapping_add(b as u64);
    }
    format!("{h:016x}")
}

fn obfuscate(plain: &str, key: &str) -> String {
    if plain.is_empty() { return String::new(); }
    let kb = key.as_bytes();
    let mut out = Vec::with_capacity(plain.len());
    for (i, b) in plain.bytes().enumerate() {
        out.push(b ^ kb[i % kb.len()]);
    }
    base64::engine::general_purpose::STANDARD.encode(&out)
}

fn deobfuscate(encoded: &str, key: &str) -> String {
    if encoded.is_empty() { return String::new(); }
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
        return String::new();
    };
    let kb = key.as_bytes();
    let mut out = String::with_capacity(bytes.len());
    for (i, b) in bytes.iter().enumerate() {
        out.push((b ^ kb[i % kb.len()]) as char);
    }
    out
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("settings.json"))
}

/// Raw on-disk format (api_key encrypted in the file, decrypted in memory)
#[derive(Serialize, Deserialize)]
struct StoredSettings {
    provider: String,
    base_url: String,
    api_key_enc: String,
    model: String,
    personality: String,
    max_context_messages: u32,
    max_tokens: u32,
    shell_path: String,
    #[serde(default = "default_startup_mode")]
    startup_mode: String,
    #[serde(default = "default_close_behavior")]
    close_behavior: String,
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> AgentSettings {
    let key = hash_key(&app);
    let path = match settings_path(&app) {
        Ok(p) => p,
        Err(_) => return AgentSettings::default(),
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return AgentSettings::default();
    };
    let Ok(stored) = serde_json::from_str::<StoredSettings>(&raw) else {
        // Try old format (plaintext api_key field) for backward compat
        if let Ok(old) = serde_json::from_str::<AgentSettings>(&raw) {
            return old;
        }
        return AgentSettings::default();
    };
    AgentSettings {
        provider: stored.provider,
        base_url: stored.base_url,
        api_key: deobfuscate(&stored.api_key_enc, &key),
        model: stored.model,
        personality: stored.personality,
        max_context_messages: stored.max_context_messages,
        max_tokens: stored.max_tokens,
        shell_path: stored.shell_path,
        startup_mode: stored.startup_mode,
        close_behavior: stored.close_behavior,
    }
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AgentSettings) -> Result<(), String> {
    let key = hash_key(&app);
    let path = settings_path(&app)?;
    let stored = StoredSettings {
        provider: settings.provider,
        base_url: settings.base_url,
        api_key_enc: obfuscate(&settings.api_key, &key),
        model: settings.model,
        personality: settings.personality,
        max_context_messages: settings.max_context_messages,
        max_tokens: settings.max_tokens,
        shell_path: settings.shell_path,
        startup_mode: settings.startup_mode,
        close_behavior: settings.close_behavior,
    };
    let json = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
