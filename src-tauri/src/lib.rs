mod commands;
mod db;
mod supervision;
mod watcher;

use commands::agent::chat_stream;
use commands::fs::{
    ensure_home_md, get_annotations, get_git_status, get_last_workspace, get_workspace_hash,
    list_dir, open_in_explorer, read_file, read_image_b64, save_annotation, set_last_workspace,
    write_file, write_file_with_backup,
};
use commands::memory::{
    clear_conversation, ensure_conversation, get_events, load_messages, log_event,
    save_message, search_messages, DbPoolCache,
};
use commands::settings::{get_settings, save_settings};
use commands::shell::{classify_command, run_command};
use supervision::{
    configure_supervision, report_activity, start_supervision, stop_supervision,
    SupervisionState,
};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use watcher::{start_watching, stop_watching, WatcherState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState::new())
        .manage(SupervisionState::new())
        .manage(DbPoolCache(std::sync::Mutex::new(std::collections::HashMap::new())))
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
            open_in_explorer,
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
        ])
        .setup(|app| {
            // ── System tray ──
            let show = MenuItemBuilder::with_id("show", "Show Clock Lock")
                .build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit")
                .build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show)
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Close → hide to tray ──
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let _ = window_clone.hide();
                        api.prevent_close();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
