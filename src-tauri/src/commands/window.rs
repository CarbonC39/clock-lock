use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn toggle_widget(app: AppHandle) -> Result<bool, String> {
    if let Some(widget) = app.get_webview_window("widget") {
        let visible = widget.is_visible().map_err(|e| e.to_string())?;
        if visible {
            widget.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            widget.show().map_err(|e| e.to_string())?;
            widget.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        // Create the widget window if it doesn't exist
        let _widget = WebviewWindowBuilder::new(
            &app,
            "widget",
            WebviewUrl::App("widget.html".into()),
        )
        .title("Clock Lock Widget")
        .inner_size(320.0, 72.0)
        .min_inner_size(220.0, 56.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .visible_on_all_workspaces(true)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|e| e.to_string())?;

        Ok(true)
    }
}

#[tauri::command]
pub fn close_widget(app: AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        widget.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn is_widget_visible(app: AppHandle) -> Result<bool, String> {
    if let Some(widget) = app.get_webview_window("widget") {
        widget.is_visible().map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}
