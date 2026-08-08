use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::fs::workspace_hash;
use crate::commands::memory::log_event;
use crate::git_tracker::{self, GitTrackerState};

pub struct SupervisionState {
    pub last_activity: Mutex<Instant>, // 用户 activity（report_activity）
    pub idle_enabled: Mutex<bool>,
    pub idle_minutes: Mutex<u64>,
    pub dnd: Mutex<bool>,
    pub handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,

    // === B 功能：self-checkin 三信号 ===
    pub last_file_change: Mutex<Instant>,          // watcher 更新
    pub last_agent_activity: Mutex<Instant>,       // agent sendMessage 收尾更新
    pub self_checkin_enabled: Mutex<bool>,
    pub self_checkin_idle_minutes: Mutex<u64>,
    pub self_checkin_min_interval_minutes: Mutex<u64>,
    pub last_self_checkin_at: Mutex<Option<Instant>>,

    // === A 功能：git tracker 全局阈值/间隔/开关（settings.json 驱动） ===
    pub git_tracking_enabled: Mutex<bool>,
    pub git_tracking_threshold: Mutex<u32>,
    pub git_tracking_min_interval_minutes: Mutex<u64>,
    pub git_tracker_snooze_until: Mutex<Instant>, // 同 self-checkin 同款 snooze

    pub workspace_path: Mutex<Option<String>>, // loadWorkspace 后由前端设置
}

impl SupervisionState {
    pub fn new() -> Self {
        Self {
            last_activity: Mutex::new(Instant::now()),
            idle_enabled: Mutex::new(true),
            idle_minutes: Mutex::new(2880), // 48h
            dnd: Mutex::new(false),
            handle: Mutex::new(None),

            last_file_change: Mutex::new(Instant::now()),
            last_agent_activity: Mutex::new(Instant::now()),
            self_checkin_enabled: Mutex::new(false),
            self_checkin_idle_minutes: Mutex::new(25),
            self_checkin_min_interval_minutes: Mutex::new(30),
            last_self_checkin_at: Mutex::new(None),

            git_tracking_enabled: Mutex::new(false),
            git_tracking_threshold: Mutex::new(5),
            git_tracking_min_interval_minutes: Mutex::new(10),
            git_tracker_snooze_until: Mutex::new(Instant::now()),

            workspace_path: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn report_activity(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    *state.last_activity.lock().unwrap() = Instant::now();
}

#[tauri::command]
pub fn report_file_activity(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    *state.last_file_change.lock().unwrap() = Instant::now();
}

#[tauri::command]
pub fn report_agent_activity(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    *state.last_agent_activity.lock().unwrap() = Instant::now();
}

#[tauri::command]
pub fn configure_supervision(app: AppHandle, idle_enabled: bool, idle_minutes: u64, dnd: bool) {
    let state = app.state::<SupervisionState>();
    *state.idle_enabled.lock().unwrap() = idle_enabled;
    *state.idle_minutes.lock().unwrap() = idle_minutes;
    *state.dnd.lock().unwrap() = dnd;
}

#[tauri::command]
pub fn configure_supervision_workspace(app: AppHandle, workspace_path: Option<String>) {
    let state = app.state::<SupervisionState>();
    *state.workspace_path.lock().unwrap() = workspace_path;
    // Reset every idle signal so a freshly loaded workspace never trips an
    // immediate self-check-in.
    *state.last_activity.lock().unwrap() = Instant::now();
    *state.last_file_change.lock().unwrap() = Instant::now();
    *state.last_agent_activity.lock().unwrap() = Instant::now();
    *state.last_self_checkin_at.lock().unwrap() = None;
}

#[tauri::command]
pub fn configure_supervision_self_checkin(
    app: AppHandle,
    enabled: bool,
    idle_minutes: u64,
    min_interval_minutes: u64,
) {
    let state = app.state::<SupervisionState>();
    *state.self_checkin_enabled.lock().unwrap() = enabled;
    *state.self_checkin_idle_minutes.lock().unwrap() = idle_minutes;
    *state.self_checkin_min_interval_minutes.lock().unwrap() = min_interval_minutes;
}

#[tauri::command]
pub fn configure_git_tracking(
    app: AppHandle,
    enabled: bool,
    threshold: u32,
    min_interval_minutes: u64,
) {
    let state = app.state::<SupervisionState>();
    *state.git_tracking_enabled.lock().unwrap() = enabled;
    *state.git_tracking_threshold.lock().unwrap() = threshold;
    *state.git_tracking_min_interval_minutes.lock().unwrap() = min_interval_minutes;
}

/// Snooze the git tracker for `duration_ms` from now.
#[tauri::command]
pub fn set_git_tracker_snooze(app: AppHandle, duration_ms: u64) {
    let state = app.state::<SupervisionState>();
    *state.git_tracker_snooze_until.lock().unwrap() =
        Instant::now() + Duration::from_millis(duration_ms);
}

#[derive(Serialize, Clone)]
struct SelfCheckinPayload {
    idle_minutes: u64,
    file_idle_secs: u64,
    user_idle_secs: u64,
    agent_idle_secs: u64,
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

    let handle = tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(300)).await;

            let state = app_clone.state::<SupervisionState>();

            let dnd = *state.dnd.lock().unwrap();
            let workspace_path = state.workspace_path.lock().unwrap().clone();
            if dnd || workspace_path.is_none() {
                continue;
            }
            let ws = workspace_path.as_deref().unwrap_or("");

            let idle_enabled = *state.idle_enabled.lock().unwrap();
            let idle_minutes = *state.idle_minutes.lock().unwrap();
            let elapsed = state.last_activity.lock().unwrap().elapsed();

            // === 48h 老逻辑（现为分钟级、可 Off） ===
            if idle_enabled && elapsed >= Duration::from_secs(idle_minutes * 60) {
                let _ = app_clone.emit("supervision-checkin", ());
                *state.last_activity.lock().unwrap() = Instant::now();
            }

            // === A: git 跟踪 ===
            let git_enabled = *state.git_tracking_enabled.lock().unwrap();
            if git_enabled {
                let threshold = *state.git_tracking_threshold.lock().unwrap();
                let min_interval = *state.git_tracking_min_interval_minutes.lock().unwrap();
                let snoozed = {
                    let until = *state.git_tracker_snooze_until.lock().unwrap();
                    Instant::now() < until
                };
                if !snoozed {
                    let gt = app_clone.state::<GitTrackerState>();
                    if let Some((payload, log_desc)) =
                        git_tracker::check_git(&gt, ws, threshold, min_interval * 60)
                    {
                        let _ = log_event(
                            app_clone.clone(),
                            workspace_hash(ws),
                            "git-commits".into(),
                            log_desc,
                        )
                        .await;
                        let _ = app_clone.emit("git-tracker-tick", payload);
                    }
                }
            }

            // === B: self-checkin ===
            let sc_enabled = *state.self_checkin_enabled.lock().unwrap();
            if sc_enabled {
                let sc_idle = *state.self_checkin_idle_minutes.lock().unwrap();
                let sc_min = *state.self_checkin_min_interval_minutes.lock().unwrap();
                let file_idle = state.last_file_change.lock().unwrap().elapsed();
                let user_idle = state.last_activity.lock().unwrap().elapsed();
                let agent_idle = state.last_agent_activity.lock().unwrap().elapsed();
                let silent = file_idle.max(user_idle).max(agent_idle);
                let interval_ok = match *state.last_self_checkin_at.lock().unwrap() {
                    None => true,
                    Some(at) => at.elapsed() >= Duration::from_secs(sc_min * 60),
                };
                if silent >= Duration::from_secs(sc_idle * 60) && interval_ok {
                    let _ = app_clone.emit(
                        "agent-self-checkin",
                        SelfCheckinPayload {
                            idle_minutes: silent.as_secs() / 60,
                            file_idle_secs: file_idle.as_secs(),
                            user_idle_secs: user_idle.as_secs(),
                            agent_idle_secs: agent_idle.as_secs(),
                        },
                    );
                    *state.last_self_checkin_at.lock().unwrap() = Some(Instant::now());
                }
            }
        }
    });

    let state = app.state::<SupervisionState>();
    *state.handle.lock().unwrap() = Some(handle);
}

#[tauri::command]
pub fn stop_supervision(app: AppHandle) {
    let state = app.state::<SupervisionState>();
    let mut h = state.handle.lock().unwrap();
    if let Some(handle) = h.take() {
        handle.abort();
    }
}
