use std::{
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};

use notify::{EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState {
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    last_emit: Mutex<Instant>,
}

/// Payload for the `fs-change` event. Carries the changed path so the UI can
/// derive a recent-focus hint without ever running git or reading the file.
#[derive(Clone, serde::Serialize)]
struct FsChangePayload {
    path: Option<String>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
            last_emit: Mutex::new(Instant::now()),
        }
    }
}

#[tauri::command]
pub fn start_watching(app: AppHandle, workspace_path: String) -> Result<(), String> {
    let app_clone = app.clone();
    let ws_root = workspace_path.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };

        // Skip non-content-change events (metadata-only, access, etc.)
        let is_write = matches!(
            event.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        );
        if !is_write {
            return;
        }

        // Debounce: at most one emit per 500ms
        let state = app_clone.state::<WatcherState>();
        let mut last = state.last_emit.lock().unwrap();
        if last.elapsed() < Duration::from_millis(500) {
            return;
        }

        // Filter gitignored paths
        let changed = event.paths.first();
        if let Some(p) = changed {
            if is_gitignored(&ws_root, p) {
                return;
            }
        }

        *last = Instant::now();
        let path = changed.map(|p| p.to_string_lossy().to_string());
        let _ = app_clone.emit("fs-change", FsChangePayload { path });
        // Notify all windows when home.md changes (e.g., external editor edit)
        if event.paths.iter().any(|p| p.file_name().map(|n| n == "home.md").unwrap_or(false)) {
            let _ = app_clone.emit("home-md-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&workspace_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let state = app.state::<WatcherState>();
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);

    Ok(())
}

#[tauri::command]
pub fn stop_watching(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    *state.watcher.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

fn is_gitignored(workspace_path: &str, file_path: &Path) -> bool {
    let Ok(repo) = git2::Repository::open(workspace_path) else {
        return false;
    };
    let Ok(rel) = file_path.strip_prefix(workspace_path) else {
        return false;
    };
    repo.is_path_ignored(rel).unwrap_or(false)
}
