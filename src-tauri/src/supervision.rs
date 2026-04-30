use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

pub struct SupervisionState {
    pub last_activity: Mutex<Instant>,
    pub idle_hours: Mutex<u64>,
    pub dnd: Mutex<bool>,
    pub handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl SupervisionState {
    pub fn new() -> Self {
        Self {
            last_activity: Mutex::new(Instant::now()),
            idle_hours: Mutex::new(48),
            dnd: Mutex::new(false),
            handle: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn report_activity(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    let mut t = state.last_activity.lock().unwrap();
    *t = Instant::now();
}

#[tauri::command]
pub fn configure_supervision(app: AppHandle, idle_hours: u64, dnd: bool) {
    let state = app.state::<SupervisionState>();
    let mut h = state.idle_hours.lock().unwrap();
    *h = idle_hours;
    drop(h);
    let mut d = state.dnd.lock().unwrap();
    *d = dnd;
}

#[tauri::command]
pub fn start_supervision(app: AppHandle) {
    let app_clone = app.clone();

    // Cancel any existing task
    {
        let state = app.state::<SupervisionState>();
        let mut h = state.handle.lock().unwrap();
        if let Some(handle) = h.take() {
            handle.abort();
        }
    }

    let handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(300)).await;

            let state = app_clone.state::<SupervisionState>();
            let idle_hours = {
                let h = state.idle_hours.lock().unwrap();
                *h
            };
            let dnd = {
                let d = state.dnd.lock().unwrap();
                *d
            };
            let elapsed = {
                let la = state.last_activity.lock().unwrap();
                la.elapsed()
            };

            if !dnd && elapsed >= Duration::from_secs(idle_hours * 3600) {
                let _ = app_clone.emit("supervision-checkin", ());
            }
        }
    });

    let state = app.state::<SupervisionState>();
    let mut h = state.handle.lock().unwrap();
    *h = Some(handle);
}

#[tauri::command]
pub fn stop_supervision(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    let mut h = state.handle.lock().unwrap();
    if let Some(handle) = h.take() {
        handle.abort();
    }
}
