use std::{path::Path, sync::Mutex};

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

pub struct WatcherState(pub Mutex<Option<notify::RecommendedWatcher>>);

#[tauri::command]
pub fn start_watching(app: AppHandle, workspace_path: String) -> Result<(), String> {
    let app_clone = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = app_clone.emit("fs-change", ());
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&workspace_path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let state = app.state::<WatcherState>();
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);

    Ok(())
}

#[tauri::command]
pub fn stop_watching(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}
