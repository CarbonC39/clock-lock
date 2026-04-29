mod commands;
mod watcher;

use commands::fs::{
    ensure_home_md, get_annotations, get_git_status, list_dir, read_file, save_annotation,
    write_file,
};
use watcher::{start_watching, stop_watching, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState(std::sync::Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file,
            write_file,
            ensure_home_md,
            get_git_status,
            save_annotation,
            get_annotations,
            start_watching,
            stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
