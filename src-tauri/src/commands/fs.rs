use std::{collections::HashMap, fs, path::Path};

use serde::{Deserialize, Serialize};
use tauri::Manager as _;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
    pub git_status: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub modified: u32,
    pub added: u32,
    pub deleted: u32,
    pub untracked: u32,
}

// Binary extensions we won't try to read as text
const BINARY_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp",
    "mp4", "mp3", "wav", "ogg", "webm",
    "pdf", "zip", "tar", "gz", "7z", "rar",
    "exe", "dll", "so", "dylib", "wasm",
    "ttf", "otf", "woff", "woff2",
    "bin", "dat", "db", "sqlite", "sqlite3",
    "safetensors", "pt", "pth", "onnx",
];

/// Deterministic djb2 hash of a workspace path → 16-char hex folder name
fn workspace_hash(path: &str) -> String {
    let mut h: u64 = 5381;
    for b in path.bytes() {
        h = h.wrapping_mul(33).wrapping_add(b as u64);
    }
    format!("{h:016x}")
}

/// Returns the per-workspace app-data directory, creating it if needed.
fn workspace_data_dir(app: &tauri::AppHandle, workspace_path: &str) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("workspaces").join(workspace_hash(workspace_path));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn is_binary_ext(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    BINARY_EXTS.contains(&ext.as_str())
}

fn status_to_code(status: git2::Status) -> String {
    if status.contains(git2::Status::IGNORED) {
        return String::new();
    }
    if status.intersects(git2::Status::INDEX_NEW | git2::Status::WT_NEW) {
        return "A".to_string();
    }
    if status.intersects(git2::Status::INDEX_MODIFIED | git2::Status::WT_MODIFIED) {
        return "M".to_string();
    }
    if status.intersects(git2::Status::INDEX_DELETED | git2::Status::WT_DELETED) {
        return "D".to_string();
    }
    String::new()
}

fn build_status_map(workspace: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(repo) = git2::Repository::open(workspace) else {
        return map;
    };

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let Ok(statuses) = repo.statuses(Some(&mut opts)) else {
        return map;
    };

    for entry in statuses.iter() {
        let Some(path) = entry.path() else { continue };
        let code = status_to_code(entry.status());
        if !code.is_empty() {
            map.insert(path.replace('\\', "/"), code);
        }
    }
    map
}

fn build_tree(
    base: &Path,
    dir: &Path,
    status_map: &HashMap<String, String>,
    depth: usize,
) -> Vec<FileNode> {
    if depth > 8 {
        return vec![];
    }

    let Ok(read_dir) = fs::read_dir(dir) else {
        return vec![];
    };

    let mut entries: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();

    // Dirs first, then alphabetical
    entries.sort_by(|a, b| {
        let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        b_dir
            .cmp(&a_dir)
            .then_with(|| a.file_name().cmp(&b.file_name()))
    });

    let mut nodes = Vec::new();
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }

        let path = entry.path();
        let rel = path
            .strip_prefix(base)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let git_status = status_map.get(&rel).cloned();

        let children = if is_dir {
            Some(build_tree(base, &path, status_map, depth + 1))
        } else {
            None
        };

        nodes.push(FileNode {
            name,
            path: path.to_string_lossy().replace('\\', "/"),
            is_dir,
            children,
            git_status,
        });
    }

    nodes
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_dir(workspace_path: String) -> Result<Vec<FileNode>, String> {
    let workspace = Path::new(&workspace_path);
    if !workspace.is_dir() {
        return Err(format!("Not a directory: {workspace_path}"));
    }
    let status_map = build_status_map(workspace);
    Ok(build_tree(workspace, workspace, &status_map, 0))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    if is_binary_ext(&path) {
        return Err("binary".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Ensures home.md exists in the app-data workspace dir. Returns its path and content.
#[tauri::command]
pub fn ensure_home_md(app: tauri::AppHandle, workspace_path: String) -> Result<(String, String), String> {
    let dir = workspace_data_dir(&app, &workspace_path)?;
    let home_path = dir.join("home.md");
    if !home_path.exists() {
        let template = "# Overview\n\nDescribe your project here.\n\n# Progress\n\n- [ ] Getting started\n\n# Todos\n\n- [ ] First task\n";
        fs::write(&home_path, template).map_err(|e| e.to_string())?;
    }
    let content = fs::read_to_string(&home_path).map_err(|e| e.to_string())?;
    let path_str = home_path.to_string_lossy().replace('\\', "/");
    Ok((path_str, content))
}

#[tauri::command]
pub fn get_git_status(workspace_path: String) -> Result<GitStatus, String> {
    let workspace = Path::new(&workspace_path);
    let Ok(repo) = git2::Repository::open(workspace) else {
        return Ok(GitStatus {
            is_repo: false,
            branch: None,
            modified: 0,
            added: 0,
            deleted: 0,
            untracked: 0,
        });
    };

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(str::to_string));

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut modified = 0u32;
    let mut added = 0u32;
    let mut deleted = 0u32;
    let mut untracked = 0u32;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.contains(git2::Status::IGNORED) {
            continue;
        }
        if s.intersects(git2::Status::INDEX_MODIFIED | git2::Status::WT_MODIFIED) {
            modified += 1;
        } else if s.intersects(git2::Status::INDEX_NEW | git2::Status::INDEX_DELETED | git2::Status::WT_DELETED) {
            if s.contains(git2::Status::INDEX_DELETED) || s.contains(git2::Status::WT_DELETED) {
                deleted += 1;
            } else {
                added += 1;
            }
        } else if s.contains(git2::Status::WT_NEW) {
            untracked += 1;
        }
    }

    Ok(GitStatus {
        is_repo: true,
        branch,
        modified,
        added,
        deleted,
        untracked,
    })
}

/// Save binary file annotation to app-data meta.json (keyed by workspace hash)
#[tauri::command]
pub fn save_annotation(app: tauri::AppHandle, workspace_path: String, rel_path: String, note: String) -> Result<(), String> {
    let dir = workspace_data_dir(&app, &workspace_path)?;
    let meta_path = dir.join("meta.json");

    let mut meta: serde_json::Map<String, serde_json::Value> = if meta_path.exists() {
        let raw = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    if note.is_empty() {
        meta.remove(&rel_path);
    } else {
        meta.insert(rel_path, serde_json::Value::String(note));
    }

    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json).map_err(|e| e.to_string())
}

/// Read an image file and return it as a base64 data URL (avoids asset:// protocol issues)
#[tauri::command]
pub fn read_image_b64(path: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "image/png",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
pub fn get_annotations(app: tauri::AppHandle, workspace_path: String) -> Result<HashMap<String, String>, String> {
    let dir = workspace_data_dir(&app, &workspace_path)?;
    let meta_path = dir.join("meta.json");
    if !meta_path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let map: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(map)
}

/// Persist the last-opened workspace path.
#[tauri::command]
pub fn set_last_workspace(app: tauri::AppHandle, workspace_path: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    fs::write(base.join("last_workspace.txt"), &workspace_path).map_err(|e| e.to_string())
}

/// Returns the last-opened workspace path if the folder still exists on disk.
#[tauri::command]
pub fn get_last_workspace(app: tauri::AppHandle) -> Option<String> {
    let base = app.path().app_data_dir().ok()?;
    let raw = fs::read_to_string(base.join("last_workspace.txt")).ok()?;
    let p = raw.trim().to_string();
    if p.is_empty() || !Path::new(&p).is_dir() { None } else { Some(p) }
}
