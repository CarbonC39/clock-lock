mod commands;
mod db;
mod supervision;
mod watcher;

use commands::agent::chat_stream;
use commands::fs::{
    ensure_home_md, get_annotations, get_git_status, get_last_workspace, get_workspace_hash,
    list_dir, read_file, read_image_b64, save_annotation, set_last_workspace, write_file,
    write_file_with_backup,
};
use commands::memory::{
    clear_conversation, ensure_conversation, get_events, load_messages, log_event,
    save_message, search_messages,
};
use commands::settings::{get_settings, save_settings};
use commands::shell::{classify_command, run_command};
use commands::window::{close_widget, is_widget_visible, toggle_widget};
use supervision::{
    configure_supervision, report_activity, start_supervision, stop_supervision,
    SupervisionState,
};
use watcher::{start_watching, stop_watching, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState::new())
        .manage(SupervisionState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // fs
            list_dir,
            read_file,
            read_image_b64,
            write_file,
            write_file_with_backup,
            ensure_home_md,
            get_git_status,
            save_annotation,
            get_annotations,
            get_last_workspace,
            set_last_workspace,
            get_workspace_hash,
            // watcher
            start_watching,
            stop_watching,
            // agent
            chat_stream,
            // settings
            get_settings,
            save_settings,
            // shell
            classify_command,
            run_command,
            // memory
            ensure_conversation,
            save_message,
            load_messages,
            search_messages,
            clear_conversation,
            log_event,
            get_events,
            // supervision
            report_activity,
            configure_supervision,
            start_supervision,
            stop_supervision,
            // window
            toggle_widget,
            close_widget,
            is_widget_visible,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
